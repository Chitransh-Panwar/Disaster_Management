import { bindMapMarkerPlacement, initMap } from './map/map.js';
import { createMarkerLayers, createRoadLayer, createRouteLayer } from './map/layers.js';
import { createOsmLayers } from './map/osmLayers.js';
import { buildOverpassQuery, createOverpassClient, throttleMs } from './domain/overpass.js';
import { overpassToRoadNetwork } from './domain/osmRoads.js';
import { overpassToPois } from './domain/osmPois.js';
import { computeRoadComponents } from './domain/connectivity.js';
import { applyEdgeOverrides, buildAdjacency, getAlgorithmNetwork, loadRoadNetwork } from './domain/roads.js';
import { nearestNodeId } from './domain/snap.js';
import { bfsLevels } from './algo/bfsSpread.js';
import { boundedKnapsack } from './algo/knapsack.js';
import { dijkstra } from './algo/dijkstra.js';
import { findBridgeEdgeIds } from './algo/tarjanBridges.js';
import { routeStepsFromPath } from './domain/routeSteps.js';
import { loadScenario, scenarioToStatePayload } from './domain/scenarios.js';
import { createDijkstraModal } from './ui/dijkstraModal.js';
import { initPanels } from './ui/panels.js';
import { createEventLog } from './ui/eventLog.js';
import { renderLeftTools } from './ui/leftTools.js';
import { initResourceTab } from './ui/resourceForm.js';
import { renderStats } from './ui/stats.js';
import { createStore } from './state/store.js';
import { createInitialState, reducer, sanitizePersistedState } from './state/reducer.js';
import { loadState, saveState } from './state/storage.js';


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
  store.subscribe(() => {
    const s = store.getState();
    if (!s.osmEnabled) {
      osmLayers.clear();
      return;
    }
    osmLayers.renderRoads(s.osmRoadNetwork, s.osmEdgeOverrides);
    osmLayers.renderPois(s.osmPois);
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
      const q = buildOverpassQuery({ bbox, includeRoads: true, includePois: true });
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

  const refreshOsmThrottled = throttleMs(refreshOsm, 1200);
  map.on('moveend', refreshOsmThrottled);
  refreshOsmThrottled();

  const route = createRouteLayer(map);

  let lastAction = null;
  const baseDispatch = store.dispatch;
  store.dispatch = (action) => {
    lastAction = action;
    return baseDispatch(action);
  };

  store.subscribe(() => {
    if (!lastAction) return;

    if (lastAction.type === 'RUN_DSU') {
      lastAction = null;
      const state = store.getState();
      const net = getAlgorithmNetwork(state);
      if (!net) {
        eventLog?.logEvent?.('dsu', 'No road network loaded');
        return;
      }

      const components = computeRoadComponents(net);
      store.dispatch({ type: 'SET_STATS', stats: { components } });
      eventLog?.logEvent?.('dsu', `Components: ${components}`);
      return;
    }

    if (lastAction.type === 'RUN_TARJAN') {
      lastAction = null;
      const state = store.getState();
      const net = getAlgorithmNetwork(state);
      if (!net) {
        eventLog?.logEvent?.('tarjan', 'No road network loaded');
        return;
      }

      const adj = buildAdjacency(net);
      const edgeIds = findBridgeEdgeIds(adj);
      store.dispatch({ type: 'SET_BRIDGES', edgeIds });
      eventLog?.logEvent?.('tarjan', `Bridges: ${edgeIds.length}`);
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
