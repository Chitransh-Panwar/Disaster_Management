function assertFiniteNumber(x, label) {
  if (!Number.isFinite(x)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

function nodeIdForLatLng(lat, lng) {
  // Stable id by rounded coordinate; good enough for viewport-sized networks.
  return `p:${round6(lat)},${round6(lng)}`;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);

  const h =
    s1 * s1 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Convert Overpass JSON response to the app's internal road network shape.
 *
 * Output matches the existing bundled `roadNetwork` shape:
 * - nodes: [{id, lat, lng}]
 * - edges: [{id, from, to, km, status}]
 */
export function overpassToRoadNetwork(overpassJson) {
  if (!overpassJson || typeof overpassJson !== 'object') {
    throw new Error('overpassToRoadNetwork: overpassJson must be an object');
  }
  if (!Array.isArray(overpassJson.elements)) {
    throw new Error('overpassToRoadNetwork: elements must be an array');
  }

  const nodesById = new Map();
  const edges = [];

  for (const el of overpassJson.elements) {
    if (!el || typeof el !== 'object') continue;
    if (el.type !== 'way') continue;
    if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;

    const wayId = el.id;
    if (!Number.isInteger(wayId) || wayId <= 0) continue;

    for (let i = 0; i < el.geometry.length - 1; i += 1) {
      const a = el.geometry[i];
      const b = el.geometry[i + 1];
      if (!a || !b) continue;

      const aLat = a.lat;
      const aLng = a.lon;
      const bLat = b.lat;
      const bLng = b.lon;

      // Skip malformed points; Overpass data can be noisy.
      if (!Number.isFinite(aLat) || !Number.isFinite(aLng) || !Number.isFinite(bLat) || !Number.isFinite(bLng)) {
        continue;
      }

      const fromId = nodeIdForLatLng(aLat, aLng);
      const toId = nodeIdForLatLng(bLat, bLng);

      if (!nodesById.has(fromId)) {
        nodesById.set(fromId, { id: fromId, lat: round6(aLat), lng: round6(aLng) });
      }
      if (!nodesById.has(toId)) {
        nodesById.set(toId, { id: toId, lat: round6(bLat), lng: round6(bLng) });
      }

      const km = haversineKm(aLat, aLng, bLat, bLng);
      assertFiniteNumber(km, 'edge km');
      if (km <= 0) continue;

      edges.push({
        id: `way:${wayId}:${i}`,
        from: fromId,
        to: toId,
        km,
        status: 'open',
      });
    }
  }

  return { nodes: Array.from(nodesById.values()), edges };
}
