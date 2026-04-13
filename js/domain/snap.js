export function nearestNodeId(nodes, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('nearestNodeId requires finite lat/lng');
  }

  let best = null;
  let bestD = Infinity;

  for (const n of nodes ?? []) {
    if (!n || typeof n.id !== 'string' || n.id.length === 0) continue;
    if (!Number.isFinite(n.lat) || !Number.isFinite(n.lng)) continue;

    const dx = lat - n.lat;
    const dy = lng - n.lng;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }

  return best;
}
