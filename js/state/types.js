/** @typedef {'disasterZone'|'helpCenter'|'resource'|'roadAction'} MarkerKind */
/** @typedef {'flood'|'earthquake'|'wildfire'|'cyclone'|'landslide'} DisasterType */
/** @typedef {'commandCenter'|'hospital'|'reliefCamp'|'helipad'|'evacPoint'} HelpCenterType */

/**
 * @typedef {Object} Marker
 * @property {string} id
 * @property {MarkerKind} kind
 * @property {string} type
 * @property {number} lat
 * @property {number} lng
 * @property {Object} fields
 */
