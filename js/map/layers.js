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
      group.clearLayers();
      const byId = new Map((network?.nodes ?? []).map((n) => [n.id, n]));
      const bridgeIds = new Set(store?.getState?.().bridgeEdgeIds ?? []);

      for (const e of network?.edges ?? []) {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;

        const isBridge = bridgeIds.has(e.id);
        const color = isBridge
          ? '#ffd400'
          : e.status === 'blocked'
            ? '#ff3b3b'
            : e.status === 'partial'
              ? '#ff9f1a'
              : '#66b3ff';
        const dash = e.status === 'blocked' ? '6 6' : null;

        const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
          color,
          weight: 4,
          dashArray: dash,
          bubblingMouseEvents: false,
        });

        line.on('click', () => {
          const state = store.getState();
          const current = state.edgeOverrides?.[e.id] ?? e.status;

          const wrap = document.createElement('div');
          wrap.innerHTML = `<div style="margin-bottom:6px">${e.id} (${current})</div>`;

          const mk = (label, status) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.marginRight = '6px';
            b.addEventListener('click', () => {
              store.dispatch({ type: 'APPLY_EDGE_OVERRIDE', edgeId: e.id, status });
              eventLog?.logEvent?.('road', `${e.id} → ${status}`);
              map.closePopup();
            });
            return b;
          };

          wrap.appendChild(mk('Block ❌', 'blocked'));
          wrap.appendChild(mk('Partial ⚠', 'partial'));
          wrap.appendChild(mk('Open ✅', 'open'));

          const center = line.getBounds().getCenter();
          L.popup().setLatLng(center).setContent(wrap).openOn(map);
        });

        line.addTo(group);
      }
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

    for (const m of markers) {
      if (!m || typeof m !== 'object') continue;
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;

      if (m.kind === 'disasterZone') {
        const def = DISASTER_ZONES[m.type];
        if (!def) continue;

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

        const emoji = String(def.label ?? '').split(' ').pop() || '📍';
        const marker = L.marker([m.lat, m.lng], {
          icon: emojiIcon(emoji, def.color),
          bubblingMouseEvents: false,
        });
        marker.on('click', () => {
          store.dispatch({ type: 'SET_SELECTED_MARKER', markerId: m.id });
          eventLog?.logEvent?.('select', `Selected marker: ${m.id}`);
        });
        marker.addTo(markerGroup);
      }

      if (m.kind === 'helpCenter') {
        const def = HELP_CENTERS[m.type];
        if (!def) continue;

        const marker = L.marker([m.lat, m.lng], {
          icon: emojiIcon(def.emoji, '#1f8a5b'),
          bubblingMouseEvents: false,
        });
        marker.on('click', () => {
          store.dispatch({ type: 'SET_SELECTED_MARKER', markerId: m.id });
          eventLog?.logEvent?.('select', `Selected marker: ${m.id}`);
        });
        marker.addTo(markerGroup);
      }

      if (m.kind === 'resourceMarker') {
        const def = RESOURCE_MARKERS[m.type];
        if (!def) continue;

        const marker = L.marker([m.lat, m.lng], {
          icon: emojiIcon(def.emoji, '#2457d6'),
          bubblingMouseEvents: false,
        });
        marker.on('click', () => {
          store.dispatch({ type: 'SET_SELECTED_MARKER', markerId: m.id });
          eventLog?.logEvent?.('select', `Selected marker: ${m.id}`);
        });
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
      L.polyline(pathLatLngs, { color: '#3b82f6', weight: 5 }).addTo(group);
    },
  };
}
