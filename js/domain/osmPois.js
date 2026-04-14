function poiKindFromTags(tags) {
  const amenity = tags?.amenity;
  if (amenity === 'hospital') return 'hospital';
  if (amenity === 'police') return 'police';

  const aeroway = tags?.aeroway;
  if (aeroway === 'helipad') return 'helipad';

  return null;
}

/**
 * Convert Overpass JSON to POIs: [{id, kind, lat, lng, label}]
 */
export function overpassToPois(overpassJson) {
  if (!overpassJson || typeof overpassJson !== 'object') {
    throw new Error('overpassToPois: overpassJson must be an object');
  }
  if (!Array.isArray(overpassJson.elements)) {
    throw new Error('overpassToPois: elements must be an array');
  }

  const pois = [];

  for (const el of overpassJson.elements) {
    if (!el || typeof el !== 'object') continue;
    if (el.type !== 'node') continue;

    const kind = poiKindFromTags(el.tags);
    if (!kind) continue;

    if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;

    const id = el.id;
    if (!Number.isInteger(id) || id <= 0) continue;

    const label = typeof el.tags?.name === 'string' && el.tags.name.length > 0 ? el.tags.name : kind;

    pois.push({
      id: `node:${id}`,
      kind,
      lat: el.lat,
      lng: el.lon,
      label,
    });
  }

  return pois;
}
