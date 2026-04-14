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
    // Roads are hidden by default for performance; only algorithm outputs are shown.
    // OSM data is kept in state for algorithms to use.
    roadGroup.clearLayers();
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
