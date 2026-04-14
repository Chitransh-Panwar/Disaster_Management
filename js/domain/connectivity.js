import { DSU } from '../algo/dsu.js';
import { DISASTER_ZONES } from './markerRegistry.js';

/**
 * Check if a point is inside a polygon using ray-casting algorithm.
 * @param {number} lat
 * @param {number} lng
 * @param {Array<[number, number]>} polygon - array of [lat, lng] pairs
 * @returns {boolean}
 */
export function pointInPolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if a point is inside a circle defined by center + radius in km.
 * Uses haversine-like squared-distance approximation for small areas.
 * @param {number} lat
 * @param {number} lng
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {number} radiusKm
 * @returns {boolean}
 */
export function pointInCircle(lat, lng, centerLat, centerLng, radiusKm) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat - centerLat) * Math.PI) / 180;
  const dLng = ((lng - centerLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((centerLat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return dist <= radiusKm;
}

/**
 * Returns true if the point (lat, lng) lies within any of the given disaster markers.
 * Supports polygon-based and circle-based disaster areas.
 * @param {number} lat
 * @param {number} lng
 * @param {Array<Object>} disasterMarkers
 * @returns {boolean}
 */
export function pointInAnyDisasterArea(lat, lng, disasterMarkers) {
  for (const m of disasterMarkers) {
    // Prefer polygon if available
    if (Array.isArray(m.polygon) && m.polygon.length >= 3) {
      if (pointInPolygon(lat, lng, m.polygon)) return true;
    } else {
      // Fall back to circle
      const def = DISASTER_ZONES[m.type];
      if (!def) continue;
      const radiusKm =
        m.type === 'earthquake'
          ? Number(m.fields?.magnitude ?? 0) * 5
          : def.defaultRadiusKm;
      if (!Number.isFinite(radiusKm) || radiusKm <= 0) continue;
      if (pointInCircle(lat, lng, m.lat, m.lng, radiusKm)) return true;
    }
  }
  return false;
}

/**
 * Filter a road network to only include nodes and edges that lie within
 * the union of all disaster areas. Returns null if no disaster areas exist.
 * @param {{ nodes: Array, edges: Array }} network
 * @param {Array<Object>} markers - all markers from state
 * @returns {{ network: { nodes: Array, edges: Array }, message: string|null }}
 */
export function filterNetworkToDisasterAreas(network, markers) {
  const disasterMarkers = (markers ?? []).filter(
    (m) => m && m.kind === 'disasterZone' && Number.isFinite(m.lat) && Number.isFinite(m.lng),
  );

  if (disasterMarkers.length === 0) {
    return { network: null, message: 'No disaster areas exist – add at least one disaster zone before running this algorithm.' };
  }

  const nodes = (network?.nodes ?? []).filter(
    (n) => n && Number.isFinite(n.lat) && Number.isFinite(n.lng) && pointInAnyDisasterArea(n.lat, n.lng, disasterMarkers),
  );

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges = (network?.edges ?? []).filter(
    (e) => e && nodeIds.has(e.from) && nodeIds.has(e.to),
  );

  if (nodes.length === 0) {
    return { network: null, message: 'No road network nodes found within disaster areas.' };
  }

  return { network: { nodes, edges }, message: null };
}

export function computeRoadComponents(network) {
  const nodes = network?.nodes ?? [];
  const edges = network?.edges ?? [];

  const ids = [];
  for (const n of nodes) {
    if (n && typeof n.id === 'string') ids.push(n.id);
  }

  const dsu = new DSU(ids);

  for (const e of edges) {
    if (!e || e.status === 'blocked') continue;
    if (typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    dsu.union(e.from, e.to);
  }

  return dsu.components();
}
