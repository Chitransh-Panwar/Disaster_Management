import {
  DISASTER_ZONES,
  HELP_CENTERS,
  RESOURCE_MARKERS,
} from '../domain/markerRegistry.js';
import { emojiIcon } from './icons.js';

export function createRoadLayer(map, store, eventLog) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating layers.');
  }

  const group = L.layerGroup().addTo(map);

  return {
    group,
    clear() {
      group.clearLayers();
    },
    render(network) {
      // Roads are hidden by default for performance; only algorithm outputs are shown.
      // Data is kept in state for algorithms to use.
      group.clearLayers();
    },
  };
}

export function createMarkerLayers(map, store, eventLog) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating layers.');
  }

  const CACHE_KEY = '__idrps_marker_layers_v2';
  const cached = map?.[CACHE_KEY];
  if (cached?.api) return cached.api;

  const markerGroup = L.layerGroup().addTo(map);
  const zoneGroup = L.layerGroup().addTo(map);
  const resourceGroup = L.layerGroup().addTo(map);

  function clear() {
    markerGroup.clearLayers();
    zoneGroup.clearLayers();
    resourceGroup.clearLayers();
  }

  function render() {
    clear();
    const state = store.getState();
    const markers = Array.isArray(state?.markers) ? state.markers : [];
    const activeTool = state?.activeTool;
    const highlightKind = activeTool && typeof activeTool === 'object' ? activeTool.kind : null;
    const waypointStatuses = state?.waypointStatuses ?? {};

    /** Determine background color override for waypoint status coloring. */
    function statusBg(markerId, defaultBg) {
      const st = waypointStatuses[markerId];
      if (st === 'visited') return '#16a34a'; // green
      if (st === 'unvisited') return '#dc2626'; // red
      return defaultBg;
    }

    function selectMarkerId(id) {
      store.dispatch({ type: 'SET_SELECTED_MARKER', markerId: id });
      eventLog?.logEvent?.('select', `Selected marker: ${id}`);
    }

    function createRouteButtons(markerId) {
      const div = document.createElement('div');
      div.style.marginTop = '4px';

      const startBtn = document.createElement('button');
      startBtn.textContent = '🟢 Set as Start';
      startBtn.style.marginRight = '6px';
      startBtn.addEventListener('click', () => {
        store.dispatch({ type: 'SET_ROUTE_START', markerId });
        eventLog?.logEvent?.('route', `Route start set: ${markerId}`);
        map.closePopup();
      });

      const goalBtn = document.createElement('button');
      goalBtn.textContent = '🔴 Set as Goal';
      goalBtn.style.marginRight = '6px';
      goalBtn.addEventListener('click', () => {
        store.dispatch({ type: 'SET_ROUTE_GOAL', markerId });
        eventLog?.logEvent?.('route', `Route goal set: ${markerId}`);
        map.closePopup();
      });

      const wpBtn = document.createElement('button');
      wpBtn.textContent = '📍 Add Waypoint';
      wpBtn.style.marginRight = '6px';
      wpBtn.addEventListener('click', () => {
        store.dispatch({ type: 'ADD_WAYPOINT', markerId });
        eventLog?.logEvent?.('route', `Waypoint added: ${markerId}`);
        map.closePopup();
      });

      const rmWpBtn = document.createElement('button');
      rmWpBtn.textContent = '🗑 Remove WP';
      rmWpBtn.style.marginRight = '6px';
      rmWpBtn.addEventListener('click', () => {
        store.dispatch({ type: 'REMOVE_WAYPOINT', markerId });
        eventLog?.logEvent?.('route', `Waypoint removed: ${markerId}`);
        map.closePopup();
      });

      const clearBtn = document.createElement('button');
      clearBtn.textContent = '❌ Clear Plan';
      clearBtn.addEventListener('click', () => {
        store.dispatch({ type: 'CLEAR_WAYPOINTS' });
        eventLog?.logEvent?.('route', 'Route plan cleared');
        map.closePopup();
      });

      div.appendChild(startBtn);
      div.appendChild(goalBtn);
      div.appendChild(document.createElement('br'));
      div.appendChild(wpBtn);
      div.appendChild(rmWpBtn);
      div.appendChild(clearBtn);
      return div;
    }

    function isNear(a, b, eps = 1e-5) {
      return Math.abs(a - b) <= eps;
    }

    function handleMarkerClick(ev, fallbackId) {
      const latlng = ev?.latlng;
      if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) {
        selectMarkerId(fallbackId);
        return;
      }

      const stateNow = store.getState();
      const all = Array.isArray(stateNow?.markers) ? stateNow.markers : [];
      const overlaps = all
        .filter((x) => x && typeof x === 'object')
        .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
        .filter((x) => isNear(x.lat, latlng.lat) && isNear(x.lng, latlng.lng));

      if (overlaps.length <= 1) {
        selectMarkerId(fallbackId);

        const wrap = document.createElement('div');
        const label = document.createElement('div');
        label.style.marginBottom = '6px';
        const m = all.find((x) => x.id === fallbackId);
        label.textContent = m
          ? `${m.kind ?? 'marker'}:${m.type ?? ''} (${m.id})`
          : `Marker ${fallbackId}`;
        wrap.appendChild(label);
        wrap.appendChild(createRouteButtons(fallbackId));

        L.popup().setLatLng(latlng).setContent(wrap).openOn(map);
        return;
      }

      const wrap = document.createElement('div');
      const title = document.createElement('div');
      title.style.marginBottom = '6px';
      title.textContent = `Select marker (${overlaps.length} here)`;
      wrap.appendChild(title);

      for (const o of overlaps) {
        const row = document.createElement('div');
        row.style.marginBottom = '6px';

        const btn = document.createElement('button');
        btn.style.display = 'inline-block';
        btn.style.marginRight = '6px';
        btn.textContent = `${o.kind ?? 'marker'}:${o.type ?? ''} (${o.id})`;
        btn.addEventListener('click', () => {
          selectMarkerId(o.id);
          map.closePopup();
        });
        row.appendChild(btn);
        row.appendChild(createRouteButtons(o.id));
        wrap.appendChild(row);
      }

      L.popup().setLatLng(latlng).setContent(wrap).openOn(map);
    }

    for (const m of markers) {
      if (!m || typeof m !== 'object') continue;
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;

      if (m.kind === 'disasterZone') {
        const def = DISASTER_ZONES[m.type];
        if (!def) continue;

        // Render as polygon if marker has polygon data, otherwise fall back to circle
        if (Array.isArray(m.polygon) && m.polygon.length >= 3) {
          L.polygon(m.polygon, {
            color: def.color,
            fillColor: def.color,
            fillOpacity: 0.18,
            weight: 2,
            bubblingMouseEvents: false,
          }).addTo(zoneGroup);
        } else {
          const radiusKm =
            m.type === 'earthquake'
              ? Number(m.fields?.magnitude ?? 0) * 5
              : def.defaultRadiusKm;
          if (!Number.isFinite(radiusKm) || radiusKm <= 0) continue;

          L.circle([m.lat, m.lng], {
            radius: radiusKm * 1000,
            color: def.color,
            fillColor: def.color,
            fillOpacity: 0.18,
            bubblingMouseEvents: false,
          }).addTo(zoneGroup);
        }

        const emoji = String(def.label ?? '').split(' ').pop() || '📍';
        const marker = L.marker([m.lat, m.lng], {
          icon: emojiIcon(emoji, def.color, { highlight: highlightKind === 'disasterZone' }),
          bubblingMouseEvents: false,
        });
        marker.on('click', (ev) => handleMarkerClick(ev, m.id));
        marker.addTo(markerGroup);
      }

      if (m.kind === 'helpCenter') {
        const def = HELP_CENTERS[m.type];
        if (!def) continue;

        const marker = L.marker([m.lat, m.lng], {
          icon: emojiIcon(def.emoji, statusBg(m.id, '#1f8a5b'), { highlight: highlightKind === 'helpCenter' }),
          bubblingMouseEvents: false,
        });
        marker.on('click', (ev) => handleMarkerClick(ev, m.id));
        marker.addTo(markerGroup);
      }

      if (m.kind === 'resourceMarker') {
        const def = RESOURCE_MARKERS[m.type];
        if (!def) continue;

        const marker = L.marker([m.lat, m.lng], {
          icon: emojiIcon(def.emoji, statusBg(m.id, '#2457d6'), { highlight: highlightKind === 'resourceMarker' }),
          bubblingMouseEvents: false,
        });
        marker.on('click', (ev) => handleMarkerClick(ev, m.id));
        marker.addTo(markerGroup);
      }
    }

    const resources = Array.isArray(state?.resources) ? state.resources : [];
    for (const r of resources) {
      if (!r || typeof r !== 'object') continue;
      if (!Number.isFinite(r.baseLat) || !Number.isFinite(r.baseLng)) continue;

      const t = String(r.resourceType ?? '').toLowerCase();
      const emoji = t.includes('helicopter')
        ? '🚁'
        : t.includes('drone')
          ? '🛸'
          : t.includes('boat') || t.includes('raft')
            ? '🛥'
            : '📦';

      const m = L.marker([r.baseLat, r.baseLng], {
        icon: emojiIcon(emoji, '#2457d6'),
        bubblingMouseEvents: false,
      });

      m.on('click', () => {
        const label = r.resourceName ?? r.id;
        eventLog?.logEvent?.('resource', `Resource: ${label}`);
      });

      m.addTo(resourceGroup);
    }
  }

  const unsubscribe = store.subscribe(render);
  render();

  const api = { render, clear };
  if (map && typeof map === 'object') map[CACHE_KEY] = { api, unsubscribe };
  return api;
}

export function createRouteLayer(map) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating layers.');
  }

  const group = L.layerGroup().addTo(map);
  return {
    clear() {
      group.clearLayers();
    },
    render(pathLatLngs) {
      group.clearLayers();
      if (!pathLatLngs || pathLatLngs.length < 2) return;
      L.polyline(pathLatLngs, { color: '#000000', weight: 5 }).addTo(group);
    },
  };
}

/**
 * Layer that renders only bridge edges (from Tarjan) in black.
 */
export function createBridgeLayer(map) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating layers.');
  }

  const group = L.layerGroup().addTo(map);
  return {
    clear() {
      group.clearLayers();
    },
    /**
     * @param {string[]} bridgeEdgeIds
     * @param {{ nodes: Array, edges: Array }} network
     */
    render(bridgeEdgeIds, network) {
      group.clearLayers();
      if (!bridgeEdgeIds || !bridgeEdgeIds.length || !network) return;

      const ids = new Set(bridgeEdgeIds);
      const byId = new Map((network.nodes ?? []).map((n) => [n.id, n]));

      for (const e of network.edges ?? []) {
        if (!ids.has(e.id)) continue;
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;

        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
          color: '#000000',
          weight: 5,
          bubblingMouseEvents: false,
        }).addTo(group);
      }
    },
  };
}

/**
 * Layer that renders DSU connected component edges containing a given node in black.
 */
export function createComponentLayer(map) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating layers.');
  }

  const group = L.layerGroup().addTo(map);
  return {
    clear() {
      group.clearLayers();
    },
    /**
     * Highlight the connected component containing `rootNodeId`.
     *
     * @param {string} rootNodeId
     * @param {{ nodes: Array, edges: Array }} network
     * @param {import('../algo/dsu.js').DSU} dsu
     */
    render(rootNodeId, network, dsu) {
      group.clearLayers();
      if (!rootNodeId || !network || !dsu) return;

      let rootComp;
      try {
        rootComp = dsu.find(rootNodeId);
      } catch {
        return; // unknown node
      }

      const byId = new Map((network.nodes ?? []).map((n) => [n.id, n]));

      for (const e of network.edges ?? []) {
        if (e.status === 'blocked') continue;
        let fromComp;
        try {
          fromComp = dsu.find(e.from);
        } catch {
          continue;
        }
        if (fromComp !== rootComp) continue;

        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;

        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
          color: '#000000',
          weight: 4,
          bubblingMouseEvents: false,
        }).addTo(group);
      }
    },
  };
}

/**
 * Layer for rendering multi-segment mission routes (traveled + return paths).
 */
export function createMissionRouteLayer(map) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating layers.');
  }

  const group = L.layerGroup().addTo(map);
  return {
    clear() {
      group.clearLayers();
    },
    /**
     * @param {Array<[number,number][]>} traveledPaths  – array of latlng arrays for completed legs
     * @param {[number,number][]|null} returnPath       – latlng array for return-to-start (if aborted)
     */
    render(traveledPaths, returnPath) {
      group.clearLayers();

      for (const path of traveledPaths ?? []) {
        if (!path || path.length < 2) continue;
        L.polyline(path, { color: '#000000', weight: 5 }).addTo(group);
      }

      if (returnPath && returnPath.length >= 2) {
        L.polyline(returnPath, {
          color: '#dc2626',
          weight: 4,
          dashArray: '8 6',
        }).addTo(group);
      }
    },
  };
}
