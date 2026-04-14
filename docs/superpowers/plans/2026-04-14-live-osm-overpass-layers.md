# Live OSM Roads/POIs + Dijkstra Simulation (IDRPS v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the “bundled JSON-only” road/POI experience with **live, selectable OSM roads + auto-loaded POIs (hospital/police/helipad)** in the current viewport (Overpass API), plus resource markers, persistent tool highlighting, overlap selection UX, and a Dijkstra “simulation” modal.

**Architecture:** Add pure domain modules for Overpass querying + conversion (unit-testable in Node), add Leaflet layers for OSM roads/POIs/resources, extend reducer/persistence for OSM state + overrides, and wire `app.js` effects to fetch on `moveend` and show a Dijkstra modal.

**Tech Stack:** Vanilla JS (ES modules), Leaflet, Overpass API (JSON), Node built-in test runner (`node --test`), localStorage.

---

## Repository file map (create/modify)

**State + persistence**
- Modify: `js/state/reducer.js` — add OSM state fields + actions.
- Modify: `js/state/storage.js` — persist OSM overrides + resources (so map markers survive refresh).

**Domain (pure, unit-testable)**
- Create: `js/domain/overpass.js` — build Overpass QL + fetch with AbortController + caching + throttling helpers.
- Create: `js/domain/osmRoads.js` — convert Overpass JSON → `{nodes, edges}` with stable segment ids.
- Create: `js/domain/osmPois.js` — convert Overpass JSON → POI array.
- Create: `js/domain/routeSteps.js` — derive a step list (edge-by-edge) for Dijkstra modal.

**Map (Leaflet layers + interactions)**
- Create: `js/map/osmLayers.js` — render OSM roads + POIs, road click popup to set status override.
- Modify: `js/map/layers.js` — render `state.resources` as map markers; add highlight support.

**UI (modal)**
- Create: `js/ui/dijkstraModal.js` — DOM-only modal (open/close/render steps).
- Modify: `index.html` — add modal root container.
- Modify: `css/styles.css` — modal styles + icon highlight styles.

**App wiring**
- Modify: `js/app.js` — add viewport-driven Overpass fetching, choose road source for algorithms, show Dijkstra modal.

**Tests**
- Create: `tests/overpass.test.js`
- Create: `tests/osmRoads.test.js`
- Create: `tests/osmPois.test.js`
- Create: `tests/routeSteps.test.js`
- Modify: `tests/reducer.test.js` — reducer additions for OSM state.
- Create: `tests/fixtures/overpass.sample.json`

---

## Local run + test commands

- Run locally: `python3 -m http.server 8000` → open `http://localhost:8000/`
- Run unit tests: `node --test tests/*.test.js`

---

## Task 0: Prep + baseline verification

**Files:** none

- [ ] **Step 1: Create a dedicated worktree (recommended)**

```bash
# from repo root
cd /Users/anushkapanwar/Downloads/chitransh/CP/CP_project
mkdir -p ../worktrees
git worktree add ../worktrees/idrps-osm-live -b feat/osm-live-map
cd ../worktrees/idrps-osm-live
```

- [ ] **Step 2: Verify tests pass before changes**

Run: `node --test tests/*.test.js`
Expected: PASS (all existing suites)

- [ ] **Step 3: Commit nothing**

No-op; this is just a checkpoint.

---

## Task 1: Extend reducer + persistence for OSM + resources

**Files:**
- Modify: `js/state/reducer.js`
- Modify: `js/state/storage.js`
- Modify: `tests/reducer.test.js`

### Why
We need state for OSM enablement, fetched network/POIs, fetch status, and a distinct override map (`osmEdgeOverrides`) keyed by stable segment ids. Also, resource markers become visible on the map, so persisting `resources` is now important.

- [ ] **Step 1: Write failing reducer tests for new OSM fields**

Add to `tests/reducer.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reducer } from '../js/state/reducer.js';

test('reducer initial state includes OSM fields', () => {
  const s0 = createInitialState();
  assert.equal(s0.osmEnabled, true);
  assert.equal(s0.osmRoadNetwork, null);
  assert.deepEqual(s0.osmPois, []);
  assert.deepEqual(s0.osmEdgeOverrides, {});
  assert.deepEqual(s0.osmFetchStatus, { loading: false, error: null, lastAt: null });
});

test('reducer can store OSM fetch results', () => {
  const s0 = createInitialState();

  const network = {
    nodes: [{ id: 'n1', lat: 1, lng: 2 }],
    edges: [{ id: 'way:1:0', from: 'n1', to: 'n1', km: 0, status: 'open' }],
  };

  const s1 = reducer(s0, { type: 'OSM_FETCH_SUCCESS', network, pois: [{ id: 'p1', kind: 'hospital', lat: 1, lng: 2, label: 'Hosp' }] });
  assert.equal(s1.osmFetchStatus.loading, false);
  assert.equal(s1.osmFetchStatus.error, null);
  assert.ok(typeof s1.osmFetchStatus.lastAt === 'number');
  assert.equal(s1.osmRoadNetwork.nodes.length, 1);
  assert.equal(s1.osmPois.length, 1);
});

test('reducer applies osm edge override', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'APPLY_OSM_EDGE_OVERRIDE', edgeId: 'way:10:4', status: 'blocked' });
  assert.equal(s1.osmEdgeOverrides['way:10:4'], 'blocked');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/reducer.test.js`
Expected: FAIL with missing fields / unknown action types.

- [ ] **Step 3: Implement reducer changes**

In `js/state/reducer.js`, update `createInitialState()` to include:

```js
osmEnabled: true,
osmRoadNetwork: null,
osmPois: [],
osmEdgeOverrides: {},
osmFetchStatus: { loading: false, error: null, lastAt: null },
```

Add reducer cases:

```js
case 'SET_OSM_ENABLED':
  return { ...state, osmEnabled: Boolean(action.enabled) };
case 'OSM_FETCH_START':
  return { ...state, osmFetchStatus: { ...state.osmFetchStatus, loading: true, error: null } };
case 'OSM_FETCH_ERROR':
  return { ...state, osmFetchStatus: { loading: false, error: String(action.error ?? 'Unknown error'), lastAt: state.osmFetchStatus.lastAt } };
case 'OSM_FETCH_SUCCESS':
  return {
    ...state,
    osmRoadNetwork: action.network,
    osmPois: Array.isArray(action.pois) ? action.pois : [],
    osmFetchStatus: { loading: false, error: null, lastAt: Date.now() },
  };
case 'APPLY_OSM_EDGE_OVERRIDE':
  return { ...state, osmEdgeOverrides: { ...state.osmEdgeOverrides, [action.edgeId]: action.status } };
```

- [ ] **Step 4: Update persistence to include new fields**

In `js/state/storage.js`, extend the `minimal` object in `saveState()`:

```js
const minimal = {
  markers: state.markers,
  edgeOverrides: state.edgeOverrides,
  activeScenarioId: state.activeScenarioId,
  activeTool: state.activeTool,
  resources: state.resources,
  resourceBudget: state.resourceBudget,
  osmEnabled: state.osmEnabled,
  osmEdgeOverrides: state.osmEdgeOverrides,
};
```

In `sanitizePersistedState()` inside `js/state/reducer.js`, accept these fields:

```js
if (typeof persisted.osmEnabled === 'boolean') out.osmEnabled = persisted.osmEnabled;
if (persisted.osmEdgeOverrides && typeof persisted.osmEdgeOverrides === 'object') {
  const clean = Object.create(null);
  for (const [k, v] of Object.entries(persisted.osmEdgeOverrides)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v === 'open' || v === 'partial' || v === 'blocked') clean[k] = v;
  }
  out.osmEdgeOverrides = clean;
}
if (Array.isArray(persisted.resources)) out.resources = persisted.resources;
if (Number.isInteger(persisted.resourceBudget) && persisted.resourceBudget >= 0) out.resourceBudget = persisted.resourceBudget;
```

- [ ] **Step 5: Run full test suite**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/state/reducer.js js/state/storage.js tests/reducer.test.js
git commit -m "feat(state): add OSM fields and persist resources" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Add Overpass query builder + fetch wrapper (domain)

**Files:**
- Create: `js/domain/overpass.js`
- Create: `tests/overpass.test.js`

- [ ] **Step 1: Write failing unit tests for query builder**

Create `tests/overpass.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery } from '../js/domain/overpass.js';

test('buildOverpassQuery includes bbox and road filters', () => {
  const q = buildOverpassQuery({
    bbox: { s: 10, w: 20, n: 11, e: 21 },
    includeRoads: true,
    includePois: true,
  });
  assert.match(q, /\[out:json\]/);
  assert.match(q, /way\[highway~"/);
  assert.match(q, /node\[amenity="hospital"\]/);
  assert.match(q, /\(10,20,11,21\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/overpass.test.js`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `js/domain/overpass.js`**

Create `js/domain/overpass.js`:

```js
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export function clampBbox(bbox) {
  return {
    s: Number(bbox.s),
    w: Number(bbox.w),
    n: Number(bbox.n),
    e: Number(bbox.e),
  };
}

export function buildOverpassQuery({ bbox, includeRoads, includePois }) {
  const b = clampBbox(bbox);
  const bboxStr = `(${b.s},${b.w},${b.n},${b.e})`;

  const parts = ['[out:json][timeout:25];('];

  if (includeRoads) {
    // Major roads only for performance.
    parts.push(
      `way[highway~"^(motorway|trunk|primary|secondary)$"]${bboxStr};`,
      '>;'
    );
  }

  if (includePois) {
    parts.push(
      `node[amenity="hospital"]${bboxStr};`,
      `node[amenity="police"]${bboxStr};`,
      `node[aeroway="helipad"]${bboxStr};`
    );
  }

  parts.push(');out body geom;');
  return parts.join('');
}

export function createOverpassClient({ fetchFn = fetch } = {}) {
  /** @type {Map<string, any>} */
  const cache = new Map();

  async function runQuery(query, { signal } = {}) {
    if (cache.has(query)) return cache.get(query);

    const res = await fetchFn(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ data: query }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`Overpass error: ${res.status}`);
    }

    const json = await res.json();
    cache.set(query, json);
    return json;
  }

  return { runQuery };
}

export function throttleMs(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, waitMs);
  };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/overpass.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/domain/overpass.js tests/overpass.test.js
git commit -m "feat(domain): add Overpass query builder" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Convert Overpass response → OSM road network (stable segment ids)

**Files:**
- Create: `js/domain/osmRoads.js`
- Create: `tests/osmRoads.test.js`
- Create: `tests/fixtures/overpass.sample.json`

- [ ] **Step 1: Add a small Overpass fixture**

Create `tests/fixtures/overpass.sample.json` (minimal shape used by converter):

```json
{
  "elements": [
    {
      "type": "way",
      "id": 100,
      "tags": {"highway": "primary", "name": "Sample Rd"},
      "geometry": [
        {"lat": 10.0, "lon": 20.0},
        {"lat": 10.1, "lon": 20.1},
        {"lat": 10.2, "lon": 20.2}
      ]
    }
  ]
}
```

- [ ] **Step 2: Write failing converter tests**

Create `tests/osmRoads.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overpassToRoadNetwork } from '../js/domain/osmRoads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('overpassToRoadNetwork creates nodes + stable segment edges', () => {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures/overpass.sample.json'), 'utf8');
  const json = JSON.parse(raw);

  const net = overpassToRoadNetwork(json);
  assert.ok(net.nodes.length >= 3);
  assert.equal(net.edges.length, 2);

  assert.equal(net.edges[0].id, 'way:100:0');
  assert.equal(net.edges[1].id, 'way:100:1');
  assert.equal(net.edges[0].status, 'open');
  assert.ok(Number.isFinite(net.edges[0].km));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/osmRoads.test.js`
Expected: FAIL (module missing)

- [ ] **Step 4: Implement `js/domain/osmRoads.js`**

Create `js/domain/osmRoads.js`:

```js
function toNodeId(lat, lon) {
  const rLat = Math.round(lat * 1e6) / 1e6;
  const rLon = Math.round(lon * 1e6) / 1e6;
  return `coord:${rLat},${rLon}`;
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLon = (bLon - aLon) * Math.PI / 180;
  const sa = Math.sin(dLat / 2);
  const sb = Math.sin(dLon / 2);
  const x = sa * sa + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * sb * sb;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function overpassToRoadNetwork(overpassJson) {
  const elements = Array.isArray(overpassJson?.elements) ? overpassJson.elements : [];

  /** @type {Map<string, {id:string, lat:number, lng:number}>} */
  const nodesById = new Map();
  /** @type {Array<any>} */
  const edges = [];

  for (const el of elements) {
    if (el?.type !== 'way') continue;
    const wayId = el.id;
    const geom = Array.isArray(el.geometry) ? el.geometry : [];
    if (!Number.isInteger(wayId) || geom.length < 2) continue;

    for (let i = 0; i < geom.length; i++) {
      const p = geom[i];
      const lat = Number(p?.lat);
      const lon = Number(p?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const id = toNodeId(lat, lon);
      if (!nodesById.has(id)) nodesById.set(id, { id, lat, lng: lon });

      if (i === 0) continue;
      const prev = geom[i - 1];
      const aLat = Number(prev?.lat);
      const aLon = Number(prev?.lon);
      if (!Number.isFinite(aLat) || !Number.isFinite(aLon)) continue;

      const from = toNodeId(aLat, aLon);
      const to = id;
      const km = haversineKm(aLat, aLon, lat, lon);
      edges.push({ id: `way:${wayId}:${i - 1}`, from, to, km, status: 'open', wayId });
    }
  }

  return { nodes: Array.from(nodesById.values()), edges };
}
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/osmRoads.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/domain/osmRoads.js tests/osmRoads.test.js tests/fixtures/overpass.sample.json
git commit -m "feat(domain): convert Overpass ways to road network" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Convert Overpass response → POIs (hospital/police/helipad)

**Files:**
- Create: `js/domain/osmPois.js`
- Create: `tests/osmPois.test.js`

- [ ] **Step 1: Write failing POI converter test**

Create `tests/osmPois.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { overpassToPois } from '../js/domain/osmPois.js';

test('overpassToPois maps amenities to categories', () => {
  const json = {
    elements: [
      { type: 'node', id: 1, lat: 10, lon: 20, tags: { amenity: 'hospital', name: 'City Hosp' } },
      { type: 'node', id: 2, lat: 11, lon: 21, tags: { amenity: 'police' } },
      { type: 'node', id: 3, lat: 12, lon: 22, tags: { aeroway: 'helipad' } },
    ],
  };

  const pois = overpassToPois(json);
  assert.equal(pois.length, 3);
  assert.deepEqual(pois.map((p) => p.kind), ['hospital', 'police', 'helipad']);
  assert.equal(pois[0].label, 'City Hosp');
});
```

- [ ] **Step 2: Implement `js/domain/osmPois.js`**

Create `js/domain/osmPois.js`:

```js
export function overpassToPois(overpassJson) {
  const elements = Array.isArray(overpassJson?.elements) ? overpassJson.elements : [];
  const out = [];

  for (const el of elements) {
    if (el?.type !== 'node') continue;
    const lat = Number(el.lat);
    const lon = Number(el.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tags = el.tags && typeof el.tags === 'object' ? el.tags : {};
    const amenity = tags.amenity;
    const aeroway = tags.aeroway;

    let kind = null;
    if (amenity === 'hospital') kind = 'hospital';
    if (amenity === 'police') kind = 'police';
    if (aeroway === 'helipad') kind = 'helipad';
    if (!kind) continue;

    const label = typeof tags.name === 'string' ? tags.name : kind;
    out.push({
      id: `poi:${kind}:${el.id}`,
      kind,
      lat,
      lng: lon,
      label,
    });
  }

  return out;
}
```

- [ ] **Step 3: Run tests**

Run: `node --test tests/osmPois.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add js/domain/osmPois.js tests/osmPois.test.js
git commit -m "feat(domain): convert Overpass nodes to POIs" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Render OSM roads + POIs as Leaflet layers (click to override)

**Files:**
- Create: `js/map/osmLayers.js`
- Modify: `js/app.js`

- [ ] **Step 1: Implement `js/map/osmLayers.js`**

Create `js/map/osmLayers.js`:

```js
import { emojiIcon } from './icons.js';

export function createOsmLayers(map, store, eventLog) {
  if (typeof L === 'undefined') throw new Error('Leaflet (L) missing');

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
      const color = status === 'blocked' ? '#ff3b3b' : status === 'partial' ? '#ff9f1a' : '#66b3ff';
      const dash = status === 'blocked' ? '6 6' : null;

      const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color,
        weight: 4,
        dashArray: dash,
        bubblingMouseEvents: false,
      });

      line.on('click', () => {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div style="margin-bottom:6px">${e.id} (${status})</div>`;

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
      const emoji = p.kind === 'hospital' ? '🏥' : p.kind === 'police' ? '👮' : '🚁';
      const bg = p.kind === 'hospital' ? '#1f8a5b' : p.kind === 'police' ? '#8b5cf6' : '#2457d6';

      const m = L.marker([p.lat, p.lng], {
        icon: emojiIcon(emoji, bg),
        bubblingMouseEvents: false,
      });
      m.on('click', () => {
        eventLog?.logEvent?.('poi', `${p.kind}: ${p.label ?? p.id}`);
      });
      m.addTo(poiGroup);
    }
  }

  return { clear, renderRoads, renderPois, roadGroup, poiGroup };
}
```

- [ ] **Step 2: Wire OSM rendering into `js/app.js` via a store subscription**

In `js/app.js`, after `const roads = createRoadLayer(...)`, add:

```js
import { createOsmLayers } from './map/osmLayers.js';

const osmLayers = createOsmLayers(map, store, eventLog);
store.subscribe(() => {
  const s = store.getState();
  if (!s.osmEnabled) {
    osmLayers.clear();
    return;
  }
  osmLayers.renderRoads(s.osmRoadNetwork, s.osmEdgeOverrides);
  osmLayers.renderPois(s.osmPois);
});
```

- [ ] **Step 3: Commit**

```bash
git add js/map/osmLayers.js js/app.js
git commit -m "feat(map): render OSM roads and POIs" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Fetch Overpass data on viewport changes (throttle + abort)

**Files:**
- Modify: `js/app.js`
- (Uses): `js/domain/overpass.js`, `js/domain/osmRoads.js`, `js/domain/osmPois.js`

- [ ] **Step 1: Add viewport guards (zoom + bbox area) and throttled moveend handler**

In `js/app.js`, near map init, add:

```js
import { buildOverpassQuery, createOverpassClient, throttleMs } from './domain/overpass.js';
import { overpassToRoadNetwork } from './domain/osmRoads.js';
import { overpassToPois } from './domain/osmPois.js';

const overpass = createOverpassClient();
let inflight = null;

function boundsToBbox(bounds) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return { s: sw.lat, w: sw.lng, n: ne.lat, e: ne.lng };
}

async function refreshOsm() {
  const s = store.getState();
  if (!s.osmEnabled) return;

  const zoom = map.getZoom();
  if (zoom < 7) {
    eventLog?.logEvent?.('hint', 'Zoom in to load live OSM roads/POIs');
    return;
  }

  const bbox = boundsToBbox(map.getBounds());
  const area = Math.abs((bbox.n - bbox.s) * (bbox.e - bbox.w));
  if (area > 6) {
    eventLog?.logEvent?.('hint', 'Viewport too large for Overpass; zoom in further');
    return;
  }

  if (inflight) inflight.abort();
  inflight = new AbortController();

  store.dispatch({ type: 'OSM_FETCH_START' });

  try {
    const q = buildOverpassQuery({ bbox, includeRoads: true, includePois: true });
    const json = await overpass.runQuery(q, { signal: inflight.signal });

    const network = overpassToRoadNetwork(json);
    const pois = overpassToPois(json);

    store.dispatch({ type: 'OSM_FETCH_SUCCESS', network, pois });
    eventLog?.logEvent?.('data', `OSM loaded: ${network.nodes.length} nodes, ${network.edges.length} edges, ${pois.length} POIs`);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    store.dispatch({ type: 'OSM_FETCH_ERROR', error: err instanceof Error ? err.message : String(err) });
    eventLog?.logEvent?.('system', `OSM fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const refreshOsmThrottled = throttleMs(refreshOsm, 1200);
map.on('moveend', refreshOsmThrottled);
refreshOsmThrottled();
```

- [ ] **Step 2: Manual smoke check**

Run: `python3 -m http.server 8000`
Expected:
- Pan/zoom triggers “OSM loaded …” in log (zoomed in)
- Roads + POIs appear

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(osm): fetch Overpass data on viewport changes" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Render resources from the Resource Form as map markers

**Files:**
- Modify: `js/map/layers.js`

- [ ] **Step 1: Implement resource marker rendering from `state.resources`**

In `createMarkerLayers()` in `js/map/layers.js`, add a third layer group:

```js
const resourceGroup = L.layerGroup().addTo(map);
```

Update `clear()` to also clear `resourceGroup`.

Then, inside `render()` after reading `state`, add:

```js
const resources = Array.isArray(state?.resources) ? state.resources : [];
for (const r of resources) {
  if (!r || typeof r !== 'object') continue;
  if (!Number.isFinite(r.baseLat) || !Number.isFinite(r.baseLng)) continue;

  const emoji = String(r.resourceType ?? '').toLowerCase().includes('helicopter') ? '🚁' : '📦';
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
```

- [ ] **Step 2: Manual smoke check**

Expected:
- Add resource in form
- A marker appears at pinned base location

- [ ] **Step 3: Commit**

```bash
git add js/map/layers.js
git commit -m "feat(map): render resources as markers" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Tool highlighting (persist while tool selected)

**Files:**
- Modify: `js/map/icons.js`
- Modify: `css/styles.css`
- Modify: `js/map/layers.js`
- Modify: `js/map/osmLayers.js`

- [ ] **Step 1: Add highlight CSS**

Append to `css/styles.css`:

```css
.idrps-icon.idrps-icon--highlight {
  filter: drop-shadow(0 0 10px rgba(102,170,255,0.8));
  transform: scale(1.15);
}
```

- [ ] **Step 2: Extend `emojiIcon` to accept an optional className**

In `js/map/icons.js`:

```js
export function emojiIcon(emoji, bg = '#122443', { className = '' } = {}) {
  // ...
  return L.divIcon({
    className: `idrps-icon ${className}`.trim(),
    html: `...`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
```

- [ ] **Step 3: Apply highlight when activeTool matches kind/type**

In `createMarkerLayers()` and in `createOsmLayers()`, compute:

```js
const tool = store.getState().activeTool;
const highlightKind = tool?.kind;
const highlightType = tool?.type;
```

Then pass `{ className: 'idrps-icon--highlight' }` when the marker’s kind/type matches.

- [ ] **Step 4: Manual smoke check**

Expected: selecting e.g. “Hospital 🏥” tool highlights all hospital markers/POIs.

- [ ] **Step 5: Commit**

```bash
git add css/styles.css js/map/icons.js js/map/layers.js js/map/osmLayers.js
git commit -m "feat(ui): highlight map items by selected tool" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Overlap selection popup (multiple facilities at same location)

**Files:**
- Create: `js/map/overlapPicker.js`
- Modify: `js/map/layers.js`
- Modify: `js/map/osmLayers.js`

- [ ] **Step 1: Create overlap picker helper**

Create `js/map/overlapPicker.js`:

```js
export function openOverlapPopup(map, latlng, items, { onPick } = {}) {
  if (typeof L === 'undefined') throw new Error('Leaflet (L) missing');
  if (!Array.isArray(items) || items.length <= 1) return false;

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div style="margin-bottom:6px"><b>Multiple items here</b></div>`;

  for (const it of items) {
    const btn = document.createElement('button');
    btn.style.display = 'block';
    btn.style.margin = '4px 0';
    btn.textContent = `${it.emoji ?? '📍'} ${it.label ?? it.id}`;
    btn.addEventListener('click', () => {
      onPick?.(it);
      map.closePopup();
    });
    wrap.appendChild(btn);
  }

  L.popup().setLatLng(latlng).setContent(wrap).openOn(map);
  return true;
}
```

- [ ] **Step 2: Use overlap picker on marker click**

In both `layers.js` marker click handlers and `osmLayers.js` POI marker click handlers:
- Build `itemsAtLatLng` by scanning the relevant state arrays for exact matching `{lat,lng}` (or within a tiny epsilon).
- If `openOverlapPopup()` returns true, do not proceed with the single-item action.

- [ ] **Step 3: Manual smoke check**

Expected: if 2+ POIs/markers/resources share identical coords, clicking shows a list.

- [ ] **Step 4: Commit**

```bash
git add js/map/overlapPicker.js js/map/layers.js js/map/osmLayers.js
git commit -m "feat(map): add overlap selection popup" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Dijkstra simulation modal (center popup with step list + cumulative cost)

**Files:**
- Create: `js/domain/routeSteps.js`
- Create: `tests/routeSteps.test.js`
- Create: `js/ui/dijkstraModal.js`
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `js/app.js`

- [ ] **Step 1: Write failing unit test for route step derivation**

Create `tests/routeSteps.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToSteps } from '../js/domain/routeSteps.js';

test('pathToSteps returns step list with cumulative weights', () => {
  const adj = {
    A: [{ to: 'B', w: 2, edgeId: 'E1' }],
    B: [{ to: 'C', w: 3, edgeId: 'E2' }],
    C: [],
  };
  const steps = pathToSteps(adj, ['A', 'B', 'C']);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].edgeId, 'E1');
  assert.equal(steps[1].cumulative, 5);
});
```

- [ ] **Step 2: Implement `js/domain/routeSteps.js`**

Create `js/domain/routeSteps.js`:

```js
export function pathToSteps(adj, path) {
  const steps = [];
  let cumulative = 0;

  for (let i = 0; i < (path?.length ?? 0) - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const edges = adj?.[from] ?? [];
    const e = edges.find((x) => x?.to === to);
    if (!e) throw new Error(`Missing edge for step: ${from} -> ${to}`);
    cumulative += e.w;
    steps.push({ from, to, w: e.w, edgeId: e.edgeId ?? null, cumulative });
  }

  return steps;
}
```

- [ ] **Step 3: Implement modal UI**

Create `js/ui/dijkstraModal.js`:

```js
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.appendChild(c);
  return node;
}

export function createDijkstraModal(rootEl) {
  const overlay = el('div', { className: 'idrps-modal-overlay', hidden: true });
  const modal = el('div', { className: 'idrps-modal' });
  const header = el('div', { className: 'idrps-modal__header' });
  const title = el('div', { className: 'idrps-modal__title', textContent: 'Dijkstra Simulation' });
  const close = el('button', { className: 'idrps-modal__close', textContent: '✕' });
  const body = el('div', { className: 'idrps-modal__body' });

  function hide() {
    overlay.hidden = true;
    body.innerHTML = '';
  }

  close.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  header.appendChild(title);
  header.appendChild(close);
  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  rootEl.appendChild(overlay);

  function show({ startLabel, goalLabel, distanceKm, steps }) {
    overlay.hidden = false;
    body.innerHTML = '';

    body.appendChild(el('div', {
      className: 'idrps-modal__meta',
      innerHTML: `<div><b>Start:</b> ${startLabel}</div><div><b>Goal:</b> ${goalLabel}</div><div><b>Total:</b> ${Math.round(distanceKm)} km</div>`,
    }));

    const list = el('ol', { className: 'idrps-modal__steps' });
    for (const s of steps ?? []) {
      list.appendChild(el('li', {
        innerHTML: `<b>${s.from}</b> → <b>${s.to}</b> (${Math.round(s.w)} km) <span class="idrps-muted">cum=${Math.round(s.cumulative)} km</span>`,
      }));
    }
    body.appendChild(list);
  }

  return { show, hide };
}
```

- [ ] **Step 4: Add modal root to `index.html`**

Just before `</body>` add:

```html
<div id="modalRoot"></div>
```

- [ ] **Step 5: Add modal CSS**

Append to `css/styles.css`:

```css
.idrps-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.idrps-modal {
  width: min(720px, 100%);
  max-height: min(80vh, 800px);
  overflow: auto;
  background: rgba(8, 17, 30, 0.98);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
}

.idrps-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.idrps-modal__title { font-weight: 700; }

.idrps-modal__close {
  background: transparent;
  color: var(--panel-text);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
}

.idrps-modal__body { padding: 12px 14px; color: var(--panel-text); }
.idrps-modal__meta { display: grid; gap: 4px; margin-bottom: 10px; }
.idrps-modal__steps { margin: 0; padding-left: 18px; }
.idrps-muted { color: var(--muted); font-size: 12px; }
```

- [ ] **Step 6: Wire modal into `RUN_DIJKSTRA` effect**

In `js/app.js`:

```js
import { createDijkstraModal } from './ui/dijkstraModal.js';
import { pathToSteps } from './domain/routeSteps.js';

const modalRoot = document.getElementById('modalRoot');
const dijkstraModal = modalRoot ? createDijkstraModal(modalRoot) : null;
```

Then, in the existing `RUN_DIJKSTRA` handler after `const res = dijkstra(...)`, add:

```js
const steps = pathToSteps(adj, res.path);
dijkstraModal?.show({
  startLabel: start.id,
  goalLabel: goal.id,
  distanceKm: res.distance,
  steps,
});
```

- [ ] **Step 7: Run tests**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 8: Manual smoke check**

Expected: clicking “Dijkstra ▶” opens modal with step list and total.

- [ ] **Step 9: Commit**

```bash
git add js/domain/routeSteps.js tests/routeSteps.test.js js/ui/dijkstraModal.js index.html css/styles.css js/app.js
git commit -m "feat(ui): add Dijkstra simulation modal" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Use OSM road graph for algorithms when available (fallback preserved)

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Choose active network in RUN_* handlers**

In `RUN_DIJKSTRA`, `RUN_TARJAN`, `RUN_DSU`, `RUN_BFS` blocks, replace uses of `state.roadNetwork` with:

```js
const baseNet = state.osmEnabled && state.osmRoadNetwork ? state.osmRoadNetwork : state.roadNetwork;
const overrides = state.osmEnabled && state.osmRoadNetwork ? state.osmEdgeOverrides : state.edgeOverrides;
const net = applyEdgeOverrides(baseNet, overrides);
```

- [ ] **Step 2: Manual smoke check**

Expected:
- When live OSM is loaded, Dijkstra uses that graph.
- If OSM disabled or not loaded, algorithms work with bundled `data/india_roads.json`.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(algo): prefer live OSM graph when available" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Plan self-review checklist (author)

- Spec coverage:
  - Live roads selectable: Tasks 3,5,6
  - POIs auto: Tasks 4,5,6
  - Resources show markers: Task 7 (+ Task 1 persistence)
  - Tool highlighting: Task 8
  - Overlap selection: Task 9
  - Dijkstra modal simulation: Task 10
  - Algorithm uses active graph source: Task 11
- Placeholder scan: no TBD/TODO references.
- Naming consistency: action names and state keys match across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-14-live-osm-overpass-layers.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
