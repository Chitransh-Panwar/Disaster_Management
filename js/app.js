import { bindMapMarkerPlacement, initMap } from './map/map.js';
import { createMarkerLayers, createRoadLayer, createRouteLayer, createBridgeLayer, createComponentLayer, createMissionRouteLayer } from './map/layers.js';
import { createOsmLayers } from './map/osmLayers.js';
import { DEFAULT_SPEED_KMH, DEFAULT_FUEL_KM } from './config.js';
import { buildOverpassQuery, createOverpassClient } from './domain/overpass.js';
import { overpassToRoadNetwork } from './domain/osmRoads.js';
import { overpassToPois } from './domain/osmPois.js';
import { computeRoadComponents, filterNetworkToDisasterAreas } from './domain/connectivity.js';
import { DSU } from './algo/dsu.js';
import { applyEdgeOverrides, buildAdjacency, getAlgorithmNetwork, loadRoadNetwork } from './domain/roads.js';
import { nearestNodeId } from './domain/snap.js';
import { bfsLevels } from './algo/bfsSpread.js';
import { boundedKnapsack } from './algo/knapsack.js';
import { dijkstra } from './algo/dijkstra.js';
import { findBridgeEdgeIds } from './algo/tarjanBridges.js';
import { routeStepsFromPath } from './domain/routeSteps.js';
import { loadScenario, scenarioToStatePayload } from './domain/scenarios.js';
import { computeWaypointOrder } from './algo/waypointOrder.js';
import { simulateMission } from './algo/missionSim.js';
import { createDijkstraModal } from './ui/dijkstraModal.js';
import { initPanels } from './ui/panels.js';
import { createEventLog } from './ui/eventLog.js';
import { renderLeftTools } from './ui/leftTools.js';
import { initResourceTab } from './ui/resourceForm.js';
import { renderStats } from './ui/stats.js';
import { createStore } from './state/store.js';
import { createInitialState, reducer, sanitizePersistedState } from './state/reducer.js';
import { loadState, saveState } from './state/storage.js';
import { initFreehandDrawing } from './map/freehandDraw.js';


async function main() {
  const persisted = sanitizePersistedState(loadState());
  const base = createInitialState();
  const store = createStore(reducer, persisted ? { ...base, ...persisted } : undefined);

  store.subscribe(() => saveState(store.getState()));

  const map = initMap('map');
  initPanels();

  const dijkstraModal = createDijkstraModal(document.getElementById('dijkstraModalRoot'));

  const statsEl = document.getElementById('tab-stats');
  store.subscribe(() => renderStats(statsEl, store.getState()));
  renderStats(statsEl, store.getState());

  const logEl = document.getElementById('tab-log');
  const eventLog = logEl ? createEventLog(logEl) : null;
  eventLog?.logEvent('system', 'App started');

  const resourcesEl = document.getElementById('tab-resources');
  initResourceTab(resourcesEl, { map, store, eventLog });

  const leftBody = document.getElementById('leftPanelBody');
  renderLeftTools(leftBody, store, eventLog);

  const bar = document.getElementById('scenarioBar');
  if (bar) {
    bar.addEventListener('click', async (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const btn = target?.closest('button[data-scenario]');
      if (!btn) return;
      const id = btn.dataset.scenario;
      if (typeof id !== 'string' || id.length === 0) {
        eventLog?.logEvent('system', 'Error: missing scenario id on button');
        return;
      }

      try {
        const s = await loadScenario(id);
        const payload = scenarioToStatePayload(s);
        store.dispatch({ type: 'LOAD_SCENARIO', ...payload });
        eventLog?.logEvent('scenario', `Loaded scenario: ${s.label} (${s.year})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        eventLog?.logEvent('system', `Error: ${message}`);
        console.error(err);
      }
    });
  }

  const roads = createRoadLayer(map, store, eventLog);

  store.subscribe(() => {
    const state = store.getState();
    if (!state.roadNetwork) return;
    const net = applyEdgeOverrides(state.roadNetwork, state.edgeOverrides);
    roads.render(net);
  });

  const osmLayers = createOsmLayers(map, store, eventLog);
  let lastOsmPois = null;
  let lastPoiHospitals = null;
  let lastPoiPolice = null;
  let lastFilteredPois = [];
  store.subscribe(() => {
    const s = store.getState();
    if (!s.osmEnabled) {
      osmLayers.clear();
      return;
    }
    osmLayers.renderRoads(s.osmRoadNetwork, s.osmEdgeOverrides);
    // Only re-filter POIs when relevant state changes
    if (s.osmPois !== lastOsmPois || s.poiHospitals !== lastPoiHospitals || s.poiPolice !== lastPoiPolice) {
      lastOsmPois = s.osmPois;
      lastPoiHospitals = s.poiHospitals;
      lastPoiPolice = s.poiPolice;
      lastFilteredPois = (s.osmPois ?? []).filter((p) => {
        if (p.kind === 'hospital') return s.poiHospitals;
        if (p.kind === 'police') return s.poiPolice;
        return false;
      });
    }
    osmLayers.renderPois(lastFilteredPois);
  });

  const overpass = createOverpassClient();
  /** @type {AbortController | null} */
  let inflight = null;

  function boundsToBbox(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return { s: sw.lat, w: sw.lng, n: ne.lat, e: ne.lng };
  }

  async function refreshOsm() {
    const s = store.getState();
    if (!s.osmEnabled) return;

    if (overpass.isOnCooldown()) {
      const secs = Math.ceil(overpass.getCooldownRemaining() / 1000);
      eventLog?.logEvent?.('system', `Overpass rate-limited. Retry in ${secs}s.`);
      return;
    }

    const zoom = map.getZoom();
    if (zoom < 7) {
      eventLog?.logEvent?.('hint', 'Zoom in to load live OSM roads/POIs');
      return;
    }

    const bbox = boundsToBbox(map.getBounds());
    const area = Math.abs((bbox.n - bbox.s) * (bbox.e - bbox.w));
    if (area > 6) {
      eventLog?.logEvent?.('hint', 'Viewport too large for Overpass; zoom in further');
      return;
    }

    if (inflight) inflight.abort();
    inflight = new AbortController();

    store.dispatch({ type: 'OSM_FETCH_START' });

    try {
      const q = buildOverpassQuery({
        bbox,
        includeRoads: true,
        includeHospitals: s.poiHospitals,
        includePolice: s.poiPolice,
      });
      const json = await overpass.runQuery(q, { signal: inflight.signal });

      const network = overpassToRoadNetwork(json);
      const pois = overpassToPois(json);

      store.dispatch({ type: 'OSM_FETCH_SUCCESS', network, pois, at: Date.now() });
      eventLog?.logEvent?.(
        'data',
        `OSM loaded: ${network.nodes.length} nodes, ${network.edges.length} edges, ${pois.length} POIs`
      );
    } catch (err) {
      if (err && typeof err === 'object' && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : String(err);
      store.dispatch({ type: 'OSM_FETCH_ERROR', error: message });
      eventLog?.logEvent?.('system', `OSM fetch failed: ${message}`);
    }
  }

  // No auto-fetch on moveend; OSM only loads when user presses the button

  const route = createRouteLayer(map);
  const bridgeLayer = createBridgeLayer(map);
  const componentLayer = createComponentLayer(map);
  const missionRouteLayer = createMissionRouteLayer(map);

  let lastAction = null;
  const baseDispatch = store.dispatch;
  store.dispatch = (action) => {
    lastAction = action;
    return baseDispatch(action);
  };

  store.subscribe(() => {
    if (!lastAction) return;

    if (lastAction.type === 'OSM_MANUAL_REFRESH') {
      lastAction = null;
      refreshOsm();
      return;
    }

    if (lastAction.type === 'RUN_DSU') {
      lastAction = null;
      const state = store.getState();
      const fullNet = getAlgorithmNetwork(state);
      if (!fullNet) {
        eventLog?.logEvent?.('dsu', 'No road network loaded');
        return;
      }

      // Constrain to disaster areas
      const markers = Array.isArray(state.markers) ? state.markers : [];
      const { network: net, message } = filterNetworkToDisasterAreas(fullNet, markers);
      if (!net) {
        eventLog?.logEvent?.('dsu', message);
        return;
      }

      const components = computeRoadComponents(net);
      store.dispatch({ type: 'SET_STATS', stats: { components } });
      eventLog?.logEvent?.('dsu', `Components (within disaster areas): ${components}`);

      // Highlight the component containing start marker or selected marker
      let refMarker = null;
      if (state.routeStartMarkerId) {
        refMarker = markers.find((m) => m.id === state.routeStartMarkerId);
      }
      if (!refMarker && state.selectedMarkerId) {
        refMarker = markers.find((m) => m.id === state.selectedMarkerId);
      }

      if (refMarker && Number.isFinite(refMarker.lat) && Number.isFinite(refMarker.lng)) {
        try {
          const nodeId = nearestNodeId(net.nodes ?? [], refMarker.lat, refMarker.lng);
          if (nodeId) {
            // Build a DSU instance for component rendering
            const ids = (net.nodes ?? []).map((n) => n.id).filter((id) => typeof id === 'string');
            const dsu = new DSU(ids);
            for (const e of net.edges ?? []) {
              if (e.status === 'blocked') continue;
              if (typeof e.from === 'string' && typeof e.to === 'string') {
                try { dsu.union(e.from, e.to); } catch { /* skip unknown */ }
              }
            }
            componentLayer.render(nodeId, net, dsu);
            eventLog?.logEvent?.('dsu', `Highlighted component containing node ${nodeId}`);
          }
        } catch { /* non-critical */ }
      }
      return;
    }

    if (lastAction.type === 'RUN_TARJAN') {
      lastAction = null;
      const state = store.getState();
      const fullNet = getAlgorithmNetwork(state);
      if (!fullNet) {
        eventLog?.logEvent?.('tarjan', 'No road network loaded');
        return;
      }

      // Constrain to disaster areas
      const markers = Array.isArray(state.markers) ? state.markers : [];
      const { network: net, message } = filterNetworkToDisasterAreas(fullNet, markers);
      if (!net) {
        eventLog?.logEvent?.('tarjan', message);
        return;
      }

      const adj = buildAdjacency(net);
      const edgeIds = findBridgeEdgeIds(adj);
      store.dispatch({ type: 'SET_BRIDGES', edgeIds });
      eventLog?.logEvent?.('tarjan', `Bridges (within disaster areas): ${edgeIds.length}`);

      // Render only bridge edges in black
      bridgeLayer.render(edgeIds, net);
      return;
    }

    if (lastAction.type === 'RUN_BFS') {
      lastAction = null;
      const state = store.getState();
      const net = getAlgorithmNetwork(state);
      if (!net) {
        eventLog?.logEvent?.('bfs', 'No road network loaded');
        return;
      }

      const adj = buildAdjacency(net);

      const markers = Array.isArray(state.markers) ? state.markers : [];
      const sourceZone = markers.find((m) => m.kind === 'disasterZone');
      if (!sourceZone) {
        eventLog?.logEvent?.('bfs', 'Add or load at least one disaster zone');
        return;
      }

      let startId;
      try {
        startId = nearestNodeId(net.nodes ?? [], sourceZone.lat, sourceZone.lng);
      } catch (err) {
        eventLog?.logEvent?.('bfs', 'Wave failed: invalid disaster zone coordinates');
        return;
      }

      if (!startId) {
        eventLog?.logEvent?.('bfs', 'Wave failed: could not snap disaster zone to road nodes');
        return;
      }

      const levels = bfsLevels(adj, startId);
      const sorted = Array.from(levels.entries()).sort((a, b) => a[1] - b[1]);
      const preview = sorted
        .slice(0, 8)
        .map(([id, l]) => `${id}:${l}`)
        .join(', ');

      eventLog?.logEvent?.(
        'bfs',
        `Wave from ${startId}: ${preview}${sorted.length > 8 ? ' …' : ''}`
      );
      return;
    }

    if (lastAction.type === 'RUN_KNAPSACK') {
      lastAction = null;
      const state = store.getState();
      const resources = Array.isArray(state.resources) ? state.resources : [];
      const budget = Number.isInteger(state.resourceBudget) ? state.resourceBudget : 0;

      if (!resources.length) {
        eventLog?.logEvent?.('knapsack', 'Add at least one resource');
        return;
      }

      const items = resources
        .filter((r) => r && r.status === 'available')
        .map((r) => ({
          id: r.id,
          weight: Number.isInteger(r.costPerUnit) ? r.costPerUnit : 0,
          value: Number.isInteger(r.capacityPerUnit) ? r.capacityPerUnit : 0,
          quantity: Number.isInteger(r.quantity) ? r.quantity : 0,
          name: r.resourceName,
          type: r.resourceType,
        }))
        .filter((i) => i.weight > 0 && i.value >= 0 && i.quantity > 0);

      if (!items.length) {
        eventLog?.logEvent?.('knapsack', 'No usable (available) resources with cost/value');
        return;
      }

      const res = boundedKnapsack(items, Math.max(0, budget));
      let usedWeight = 0;
      const chosenLabels = [];
      for (const it of items) {
        const c = res.chosen[it.id] ?? 0;
        if (c > 0) {
          usedWeight += c * it.weight;
          chosenLabels.push(`${it.name ?? it.id} x${c}`);
        }
      }

      store.dispatch({
        type: 'SET_KNAPSACK_RESULT',
        result: { ...res, usedWeight, budget },
      });

      eventLog?.logEvent?.(
        'knapsack',
        `Best capacity=${res.maxValue} (cost ${usedWeight}/${budget}). ${chosenLabels.join(', ') || 'Nothing chosen'}`
      );
      return;
    }

    if (lastAction.type === 'RUN_MISSION') {
      lastAction = null;
      const state = store.getState();
      const net = getAlgorithmNetwork(state);
      if (!net) {
        eventLog?.logEvent?.('mission', 'No road network loaded. Enable OSM and zoom in (≥7).');
        return;
      }

      const markers = Array.isArray(state.markers) ? state.markers : [];
      const waypointIds = Array.isArray(state.routeWaypointIds) ? state.routeWaypointIds : [];

      // Find start marker
      let startMarker = null;
      if (state.routeStartMarkerId) {
        startMarker = markers.find((m) => m.id === state.routeStartMarkerId);
      }
      if (!startMarker) {
        eventLog?.logEvent?.('mission', 'Set a Start marker first (click marker → Set as Start)');
        return;
      }

      if (waypointIds.length === 0) {
        eventLog?.logEvent?.('mission', 'Add at least one waypoint (click marker → Add Waypoint)');
        return;
      }

      // Get speed/fuel from start marker fields
      const speedKmh = Number(startMarker.fields?.speedKmh) || DEFAULT_SPEED_KMH;
      const fuelKm = Number(startMarker.fields?.fuelKm) || DEFAULT_FUEL_KM;
      eventLog?.logEvent?.('mission', `Facility: speed=${speedKmh} km/h, fuel=${fuelKm} km`);

      const adj = buildAdjacency(net);
      const byId = new Map((net.nodes ?? []).map((n) => [n.id, n]));

      // Snap start + all waypoints to nearest road node
      let startNodeId;
      try {
        startNodeId = nearestNodeId(net.nodes ?? [], startMarker.lat, startMarker.lng);
      } catch {
        eventLog?.logEvent?.('mission', 'Failed to snap start marker to road network');
        return;
      }
      if (!startNodeId) {
        eventLog?.logEvent?.('mission', 'Failed to snap start marker to road network');
        return;
      }

      const wpMarkers = waypointIds
        .map((id) => markers.find((m) => m.id === id))
        .filter((m) => m && Number.isFinite(m.lat) && Number.isFinite(m.lng));

      if (wpMarkers.length === 0) {
        eventLog?.logEvent?.('mission', 'No valid waypoint markers found');
        return;
      }

      const wpNodeIds = [];
      for (const wm of wpMarkers) {
        try {
          const nid = nearestNodeId(net.nodes ?? [], wm.lat, wm.lng);
          if (nid) wpNodeIds.push(nid);
          else {
            eventLog?.logEvent?.('mission', `Could not snap waypoint ${wm.id} to road`);
            return;
          }
        } catch {
          eventLog?.logEvent?.('mission', `Could not snap waypoint ${wm.id} to road`);
          return;
        }
      }

      // All points: index 0 = start, 1..n = waypoints
      const allNodeIds = [startNodeId, ...wpNodeIds];
      const n = allNodeIds.length;

      // Compute pairwise shortest distances and paths
      eventLog?.logEvent?.('mission', `Computing pairwise paths for ${n} points...`);
      const distMatrix = Array.from({ length: n }, () => new Array(n).fill(Infinity));
      const pathMatrix = Array.from({ length: n }, () => new Array(n).fill(null));

      for (let i = 0; i < n; i++) {
        distMatrix[i][i] = 0;
        pathMatrix[i][i] = [allNodeIds[i]];
        for (let j = i + 1; j < n; j++) {
          const res = dijkstra(adj, allNodeIds[i], allNodeIds[j]);
          distMatrix[i][j] = res.distance;
          distMatrix[j][i] = res.distance;
          pathMatrix[i][j] = res.path;
          pathMatrix[j][i] = res.path.length > 0 ? [...res.path].reverse() : [];
        }
      }

      // Compute auto-ordered visitation sequence
      const order = computeWaypointOrder(distMatrix);
      const orderedLabels = order.map((idx) => allNodeIds[idx]);
      eventLog?.logEvent?.('mission', `Auto-ordered: ${orderedLabels.join(' → ')}`);

      // Build concatenated path segments
      const segments = [];
      let anyUnreachable = false;
      for (let k = 0; k < order.length - 1; k++) {
        const fromIdx = order[k];
        const toIdx = order[k + 1];
        const path = pathMatrix[fromIdx][toIdx];
        const dist = distMatrix[fromIdx][toIdx];

        if (!path || path.length < 2 || !Number.isFinite(dist)) {
          eventLog?.logEvent?.('mission', `No route from ${allNodeIds[fromIdx]} to ${allNodeIds[toIdx]}`);
          anyUnreachable = true;
          break;
        }

        // waypointIdx refers to the index in wpMarkers (0-based)
        const wpIdx = toIdx - 1; // since allNodeIds[0] is start
        segments.push({ path, distanceKm: dist, waypointIdx: wpIdx });
      }

      if (anyUnreachable) {
        missionRouteLayer.clear();
        return;
      }

      // Compute total distance and ETA
      const totalDistanceKm = segments.reduce((sum, s) => sum + s.distanceKm, 0);
      const etaHours = speedKmh > 0 ? totalDistanceKm / speedKmh : Infinity;

      eventLog?.logEvent?.('mission',
        `Total distance: ${Math.round(totalDistanceKm)} km | ETA: ${(etaHours * 60).toFixed(1)} min (${etaHours.toFixed(2)} h)`
      );

      // Simulate mission with fuel constraint
      const djFn = (s, g) => dijkstra(adj, s, g);
      const missionResult = simulateMission(segments, fuelKm, speedKmh, djFn);

      // Store result
      store.dispatch({ type: 'SET_MISSION_RESULT', result: missionResult });

      // Set waypoint statuses
      const statuses = {};
      for (let i = 0; i < wpMarkers.length; i++) {
        statuses[wpMarkers[i].id] = missionResult.visitedWaypointIndices.includes(i)
          ? 'visited'
          : 'unvisited';
      }
      store.dispatch({ type: 'SET_WAYPOINT_STATUSES', statuses });

      // Convert node paths to latlng paths for rendering
      const traveledLatLngs = missionResult.traveledPaths.map((nodePath) =>
        nodePath
          .map((nid) => { const nd = byId.get(nid); return nd ? [nd.lat, nd.lng] : null; })
          .filter(Boolean)
      );

      let returnLatLngs = null;
      if (missionResult.returnPath) {
        returnLatLngs = missionResult.returnPath
          .map((nid) => { const nd = byId.get(nid); return nd ? [nd.lat, nd.lng] : null; })
          .filter(Boolean);
      }

      missionRouteLayer.render(traveledLatLngs, returnLatLngs);

      if (missionResult.aborted) {
        eventLog?.logEvent?.('mission',
          `⚠ MISSION ABORT at node ${missionResult.abortNodeId}. ` +
          `Visited: ${missionResult.visitedWaypointIndices.length}/${wpMarkers.length} waypoints. ` +
          `Returning to start (${Math.round(missionResult.returnDistanceKm)} km).`
        );
      } else {
        eventLog?.logEvent?.('mission',
          `✅ Mission complete! All ${wpMarkers.length} waypoints visited. ` +
          `Distance: ${Math.round(missionResult.totalDistanceKm)} km, ` +
          `ETA: ${(missionResult.etaHours * 60).toFixed(1)} min`
        );
      }

      // Open modal with mission summary
      dijkstraModal.open({
        title: missionResult.aborted ? '⚠ Mission Aborted' : '✅ Mission Complete',
        subtitle: `Distance: ${Math.round(missionResult.totalDistanceKm)} km | ETA: ${(missionResult.etaHours * 60).toFixed(1)} min | Speed: ${speedKmh} km/h | Fuel: ${fuelKm} km`,
        steps: segments.map((seg, i) => ({
          from: seg.path[0],
          to: seg.path[seg.path.length - 1],
          edgeId: `leg-${i + 1}`,
          status: missionResult.visitedWaypointIndices.includes(seg.waypointIdx) ? 'visited ✅' : 'missed ❌',
          cost: seg.distanceKm,
          cumulativeCost: segments.slice(0, i + 1).reduce((s, x) => s + x.distanceKm, 0),
        })),
        totalCost: missionResult.totalDistanceKm,
      });

      return;
    }

    if (lastAction.type !== 'RUN_DIJKSTRA') {
      lastAction = null;
      return;
    }

    lastAction = null;

    const state = store.getState();
    const net = getAlgorithmNetwork(state);
    if (!net) {
      dijkstraModal.close();
      return;
    }

    dijkstraModal.close();

    const adj = buildAdjacency(net);

    const markers = Array.isArray(state.markers) ? state.markers : [];

    // Use explicit route start/goal if set, fall back to legacy behavior
    let start;
    let goal;
    if (state.routeStartMarkerId) {
      start = markers.find((m) => m.id === state.routeStartMarkerId);
    }
    if (!start) {
      start = markers.find((m) => m.kind === 'helpCenter' && m.type === 'commandCenter');
    }
    if (state.routeGoalMarkerId) {
      goal = markers.find((m) => m.id === state.routeGoalMarkerId);
    }
    if (!goal) {
      goal = markers.find((m) => m.id === state.selectedMarkerId);
    }

    if (!start || !goal) {
      const hints = [];
      if (!start) hints.push('Set a Start marker (click a marker → "Set as Start", or place a Command Center)');
      if (!goal) hints.push('Set a Goal marker (click a marker → "Set as Goal", or select a marker)');
      eventLog?.logEvent?.('dijkstra', hints.join('. '));
      route.clear();
      return;
    }

    const byId = new Map((net.nodes ?? []).map((n) => [n.id, n]));

    let sId;
    let gId;
    try {
      sId = nearestNodeId(net.nodes ?? [], start.lat, start.lng);
      gId = nearestNodeId(net.nodes ?? [], goal.lat, goal.lng);
    } catch (err) {
      eventLog?.logEvent?.('dijkstra', 'Route failed: invalid marker coordinates');
      route.clear();
      return;
    }

    if (!sId || !gId) {
      eventLog?.logEvent?.('dijkstra', 'Route failed: could not snap markers to road nodes');
      route.clear();
      return;
    }

    eventLog?.logEvent?.(
      'dijkstra',
      `Snapped start → node ${sId}, goal → node ${gId}`
    );

    const res = dijkstra(adj, sId, gId);
    if (!Number.isFinite(res.distance) || res.path.length < 2) {
      eventLog?.logEvent?.('dijkstra', 'No route found');
      route.clear();
      return;
    }

    eventLog?.logEvent?.(
      'dijkstra',
      `Distance: ${Math.round(res.distance)} km, path nodes: ${res.path.length}`
    );

    // Compute ETA if start marker has speed info
    const speedKmh = Number(start.fields?.speedKmh) || DEFAULT_SPEED_KMH;
    const etaHours = speedKmh > 0 ? res.distance / speedKmh : Infinity;
    eventLog?.logEvent?.(
      'dijkstra',
      `ETA: ${(etaHours * 60).toFixed(1)} min (speed: ${speedKmh} km/h)`
    );

    const pathLatLngs = res.path
      .map((id) => {
        const n = byId.get(id);
        if (!n) return null;
        return [n.lat, n.lng];
      })
      .filter(Boolean);

    route.render(pathLatLngs);

    try {
      const { steps, totalCost } = routeStepsFromPath(adj, res.path);
      const edgeById = new Map((net.edges ?? []).map((e) => [e.id, e]));
      const enrichedSteps = steps.map((s) => ({
        ...s,
        status: s.edgeId ? edgeById.get(s.edgeId)?.status ?? null : null,
      }));

      dijkstraModal.open({
        title: 'Dijkstra Simulation',
        subtitle: `Costs: open=km, partial=5×km, blocked=∞. Steps: ${enrichedSteps.length}`,
        steps: enrichedSteps,
        totalCost,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      eventLog?.logEvent?.('dijkstra', `Simulation failed: ${message}`);
    }
  });

  // Log nearest road node when a marker is selected or set as route start/goal
  let prevSelectedId = null;
  let prevStartId = null;
  let prevGoalId = null;
  store.subscribe(() => {
    const s = store.getState();
    const net = getAlgorithmNetwork(s);
    const nodes = net?.nodes ?? [];
    const markers = Array.isArray(s.markers) ? s.markers : [];

    const checkAndLog = (field, prev, label) => {
      const id = s[field];
      if (id && id !== prev) {
        const m = markers.find((x) => x.id === id);
        if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng) && nodes.length > 0) {
          try {
            const nodeId = nearestNodeId(nodes, m.lat, m.lng);
            if (nodeId) {
              const node = nodes.find((n) => n.id === nodeId);
              const dx = m.lat - (node?.lat ?? 0);
              const dy = m.lng - (node?.lng ?? 0);
              const approxKm = Math.sqrt(dx * dx + dy * dy) * 111;
              eventLog?.logEvent?.(
                'snap',
                `${label} ${id} → nearest road node ${nodeId} (~${approxKm.toFixed(1)} km)`
              );
            }
          } catch (_snapErr) { /* non-critical: snap info is best-effort */ }
        }
      }
      return id;
    };

    prevSelectedId = checkAndLog('selectedMarkerId', prevSelectedId, 'Marker');
    prevStartId = checkAndLog('routeStartMarkerId', prevStartId, 'Start');
    prevGoalId = checkAndLog('routeGoalMarkerId', prevGoalId, 'Goal');
  });

  try {
    const network = await loadRoadNetwork();
    store.dispatch({ type: 'SET_ROAD_NETWORK', network });
    createMarkerLayers(map, store, eventLog);
    bindMapMarkerPlacement(map, store, eventLog);
    initFreehandDrawing(map, store, eventLog);

    const nodes = network?.nodes?.length ?? 0;
    const edges = network?.edges?.length ?? 0;
    const msg = `Loaded roads: ${nodes} nodes, ${edges} edges`;
    if (eventLog) eventLog.logEvent('data', msg);
    else console.log(msg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (eventLog) eventLog.logEvent('system', `Error: ${message}`);
    throw err;
  }
}

function boot() {
  main().catch((err) => {
    console.error(err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
