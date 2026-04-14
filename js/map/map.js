import { MAP_DEFAULT, DEFAULT_SPEED_KMH, DEFAULT_FUEL_KM } from '../config.js';
import {
  DISASTER_ZONES,
  HELP_CENTERS,
  RESOURCE_MARKERS,
  ROAD_ACTIONS,
} from '../domain/markerRegistry.js';

export function initMap(mapElId = 'map') {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before app.js.');
  }

  if (!document.getElementById(mapElId)) {
    throw new Error(`Map container "#${mapElId}" not found.`);
  }

  const map = L.map(mapElId, { zoomControl: true }).setView(
    MAP_DEFAULT.center,
    MAP_DEFAULT.zoom
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  return map;
}

function isValidTool(tool) {
  if (!tool || typeof tool !== 'object') return false;
  if (typeof tool.kind !== 'string' || typeof tool.type !== 'string') return false;

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  if (tool.kind === 'disasterZone') return hasOwn(DISASTER_ZONES, tool.type);
  if (tool.kind === 'helpCenter') return hasOwn(HELP_CENTERS, tool.type);
  if (tool.kind === 'resourceMarker') return hasOwn(RESOURCE_MARKERS, tool.type);
  if (tool.kind === 'roadAction') return hasOwn(ROAD_ACTIONS, tool.type);

  return false;
}

export function bindMapMarkerPlacement(map, store, eventLog) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before binding map handlers.');
  }

  const KEY = '__idrps_bind_map_marker_placement_v2';
  if (map?.[KEY]) return;

  const handler = (ev) => {
    const tool = store.getState().activeTool;
    if (!isValidTool(tool)) return;

    if (tool.kind === 'roadAction') {
      eventLog?.logEvent('hint', 'Road actions are applied by clicking a road polyline');
      return;
    }

    const id = `${tool.kind}-${Date.now()}`;

    // Minimal popup form: one “Confirm” button. Later tasks extend per-marker fields.
    const html = document.createElement('div');
    html.innerHTML = `<div style="margin-bottom:8px">Add ${tool.kind}:${tool.type} here?</div>`;

    // Speed/fuel fields for facility (helpCenter) markers
    let speedInput = null;
    let fuelInput = null;
    if (tool.kind === 'helpCenter') {
      const speedRow = document.createElement('div');
      speedRow.style.marginBottom = '4px';
      speedRow.innerHTML = '<label>Speed (km/h): </label>';
      speedInput = document.createElement('input');
      speedInput.type = 'number';
      speedInput.value = String(DEFAULT_SPEED_KMH);
      speedInput.style.width = '60px';
      speedRow.appendChild(speedInput);
      html.appendChild(speedRow);

      const fuelRow = document.createElement('div');
      fuelRow.style.marginBottom = '4px';
      fuelRow.innerHTML = '<label>Fuel range (km): </label>';
      fuelInput = document.createElement('input');
      fuelInput.type = 'number';
      fuelInput.value = String(DEFAULT_FUEL_KM);
      fuelInput.style.width = '60px';
      fuelRow.appendChild(fuelInput);
      html.appendChild(fuelRow);
    }

    const btn = document.createElement('button');
    btn.textContent = 'Add marker';
    btn.addEventListener('click', () => {
      const fields = {};
      if (speedInput) fields.speedKmh = Number(speedInput.value) || DEFAULT_SPEED_KMH;
      if (fuelInput) fields.fuelKm = Number(fuelInput.value) || DEFAULT_FUEL_KM;
      store.dispatch({
        type: 'ADD_MARKER',
        marker: {
          id,
          kind: tool.kind,
          type: tool.type,
          lat: ev.latlng.lat,
          lng: ev.latlng.lng,
          fields,
        },
      });
      eventLog?.logEvent('marker', `Added ${tool.kind}:${tool.type} (${id})`);
      map.closePopup();
    });

    html.appendChild(btn);

    L.popup().setLatLng(ev.latlng).setContent(html).openOn(map);
  };

  if (map && typeof map === 'object') map[KEY] = handler;
  map.on('click', handler);
}
