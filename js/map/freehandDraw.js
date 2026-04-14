import { DISASTER_ZONES } from '../domain/markerRegistry.js';

/**
 * Simplify a polyline using the Ramer-Douglas-Peucker algorithm.
 * @param {Array<[number,number]>} points
 * @param {number} epsilon - tolerance in degrees
 * @returns {Array<[number,number]>}
 */
export function simplifyPoints(points, epsilon = 0.0005) {
  if (!Array.isArray(points) || points.length < 3) return Array.isArray(points) ? points : [];

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPoints(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const [px, py] = point;
  const [ax, ay] = lineStart;
  const [bx, by] = lineEnd;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Compute centroid of a polygon.
 * @param {Array<[number,number]>} points - [[lat,lng], ...]
 * @returns {{lat: number, lng: number}}
 */
export function polygonCentroid(points) {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  let latSum = 0;
  let lngSum = 0;
  for (const [lat, lng] of points) {
    latSum += lat;
    lngSum += lng;
  }
  return { lat: latSum / points.length, lng: lngSum / points.length };
}

/**
 * Initialize freehand polygon drawing for disaster zones on the Leaflet map.
 * When the active tool is a disasterZone type, the user can draw a freehand
 * polygon instead of placing a point marker.
 */
export function initFreehandDrawing(map, store, eventLog) {
  if (typeof L === 'undefined') return;

  const KEY = '__idrps_freehand_draw_v1';
  if (map?.[KEY]) return;
  if (map && typeof map === 'object') map[KEY] = true;

  let drawing = false;
  let points = [];
  let previewLine = null;
  const THROTTLE_MS = 30;
  let lastMoveTime = 0;

  const mapEl = map.getContainer();

  function startDrawing(e) {
    const tool = store.getState().activeTool;
    if (!tool || tool.kind !== 'disasterZone') return;
    if (!DISASTER_ZONES[tool.type]) return;

    // Prevent default map drag during drawing
    map.dragging.disable();

    drawing = true;
    points = [[e.latlng.lat, e.latlng.lng]];
    lastMoveTime = 0;

    mapEl.style.cursor = 'crosshair';

    // Create a preview polyline
    previewLine = L.polyline([], {
      color: DISASTER_ZONES[tool.type]?.color ?? '#FF0000',
      weight: 3,
      dashArray: '5 5',
      fillOpacity: 0,
    }).addTo(map);

    previewLine.setLatLngs(points);
  }

  function moveDrawing(e) {
    if (!drawing) return;

    const now = Date.now();
    if (now - lastMoveTime < THROTTLE_MS) return;
    lastMoveTime = now;

    points.push([e.latlng.lat, e.latlng.lng]);
    if (previewLine) {
      previewLine.setLatLngs(points);
    }
  }

  function finishDrawing() {
    if (!drawing) return;
    drawing = false;

    map.dragging.enable();
    mapEl.style.cursor = '';

    if (previewLine) {
      map.removeLayer(previewLine);
      previewLine = null;
    }

    if (points.length < 3) {
      eventLog?.logEvent?.('hint', 'Draw a larger area (at least 3 points needed)');
      points = [];
      return;
    }

    const simplified = simplifyPoints(points, 0.0005);
    const tool = store.getState().activeTool;
    if (!tool || tool.kind !== 'disasterZone' || !DISASTER_ZONES[tool.type]) {
      points = [];
      return;
    }

    const centroid = polygonCentroid(simplified);
    const id = `${tool.kind}-${Date.now()}`;

    store.dispatch({
      type: 'ADD_MARKER',
      marker: {
        id,
        kind: tool.kind,
        type: tool.type,
        lat: centroid.lat,
        lng: centroid.lng,
        polygon: simplified,
        fields: {},
      },
    });

    eventLog?.logEvent?.('marker', `Drew disaster area ${tool.type} (${id}) with ${simplified.length} vertices`);
    points = [];
  }

  function cancelDrawing() {
    if (!drawing) return;
    drawing = false;

    map.dragging.enable();
    mapEl.style.cursor = '';

    if (previewLine) {
      map.removeLayer(previewLine);
      previewLine = null;
    }

    points = [];
    eventLog?.logEvent?.('hint', 'Drawing cancelled');
  }

  // Override the default map click handler: if active tool is disasterZone,
  // use mousedown/mousemove/mouseup for freehand drawing instead.
  map.on('mousedown', (e) => {
    const tool = store.getState().activeTool;
    if (!tool || tool.kind !== 'disasterZone') return;
    if (!DISASTER_ZONES[tool.type]) return;

    // Only start on left button
    if (e.originalEvent && e.originalEvent.button !== 0) return;

    startDrawing(e);
  });

  map.on('mousemove', (e) => {
    if (!drawing) {
      // Show crosshair cursor when disaster zone tool is active
      const tool = store.getState().activeTool;
      if (tool && tool.kind === 'disasterZone' && DISASTER_ZONES[tool.type]) {
        mapEl.style.cursor = 'crosshair';
      } else if (mapEl.style.cursor === 'crosshair') {
        mapEl.style.cursor = '';
      }
      return;
    }
    moveDrawing(e);
  });

  map.on('mouseup', () => {
    if (!drawing) return;
    finishDrawing();
  });

  // Esc to cancel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawing) {
      cancelDrawing();
    }
  });
}
