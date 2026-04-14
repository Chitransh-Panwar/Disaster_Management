import { emojiIcon } from './icons.js';

export function createOsmLayers(map, store, eventLog) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating OSM layers.');
  }

  const roadGroup = L.layerGroup().addTo(map);
  const poiGroup = L.layerGroup().addTo(map);

  function clear() {
    roadGroup.clearLayers();
    poiGroup.clearLayers();
  }

  function renderRoads(network, overrides) {
    roadGroup.clearLayers();
    if (!network) return;

    const byId = new Map((network.nodes ?? []).map((n) => [n.id, n]));

    for (const e of network.edges ?? []) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;

      const status = overrides?.[e.id] ?? e.status;
      const color =
        status === 'blocked'
          ? '#ff3b3b'
          : status === 'partial'
            ? '#ff9f1a'
            : '#66b3ff';
      const dash = status === 'blocked' ? '6 6' : null;

      const line = L.polyline(
        [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
        {
          color,
          weight: 4,
          dashArray: dash,
          bubblingMouseEvents: false,
        }
      );

      line.on('click', () => {
        const state = store.getState();
        const current = state.osmEdgeOverrides?.[e.id] ?? e.status;

        const wrap = document.createElement('div');

        const title = document.createElement('div');
        title.style.marginBottom = '6px';
        title.textContent = `${e.id} (${current})`;
        wrap.appendChild(title);

        const mk = (label, s) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.style.marginRight = '6px';
          btn.addEventListener('click', () => {
            store.dispatch({ type: 'APPLY_OSM_EDGE_OVERRIDE', edgeId: e.id, status: s });
            eventLog?.logEvent?.('road', `${e.id} → ${s}`);
            map.closePopup();
          });
          return btn;
        };

        wrap.appendChild(mk('Block ❌', 'blocked'));
        wrap.appendChild(mk('Partial ⚠', 'partial'));
        wrap.appendChild(mk('Open ✅', 'open'));

        L.popup().setLatLng(line.getBounds().getCenter()).setContent(wrap).openOn(map);
      });

      line.addTo(roadGroup);
    }
  }

  function renderPois(pois) {
    poiGroup.clearLayers();

    for (const p of pois ?? []) {
      if (!p || typeof p !== 'object') continue;
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;

      const emoji = p.kind === 'hospital' ? '🏥' : p.kind === 'police' ? '👮' : '🚁';
      const bg = p.kind === 'hospital' ? '#1f8a5b' : p.kind === 'police' ? '#8b5cf6' : '#2457d6';

      const m = L.marker([p.lat, p.lng], {
        icon: emojiIcon(emoji, bg),
        bubblingMouseEvents: false,
      });

      m.on('click', () => {
        const label = typeof p.label === 'string' && p.label.length ? p.label : p.id;
        eventLog?.logEvent?.('poi', `${p.kind}: ${label}`);
      });

      m.addTo(poiGroup);
    }
  }

  return { clear, renderRoads, renderPois, roadGroup, poiGroup };
}
