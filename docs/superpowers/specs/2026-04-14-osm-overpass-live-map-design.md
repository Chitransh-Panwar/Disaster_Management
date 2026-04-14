# IDRPS v2 — Live OSM Roads/POIs + Simulation UX (Design)

## Summary
We will enhance IDRPS to use **real OpenStreetMap (OSM) roads and facilities** in the current map view by querying the **Overpass API**, rendering them as interactive Leaflet layers, and integrating them with existing road-status overrides and algorithm demos.

This design covers the user-requested improvements:
1) Roads already shown on map are selectable (block/partial/open)
2) Resources registered in the form appear on the map
3) Selecting a tool highlights all matching items on the map
4) Running an algorithm (Dijkstra) opens a popup/modal simulation
5) Multiple facilities can exist at the same location; selection UX supports overlap
6) Hospitals/police/helipads are pre-shown (auto-loaded) without manual marking

## Goals / Success Criteria
- **Road selection:** user can click an OSM road polyline and set status (blocked/partial/open).
- **Live data:** roads + POIs auto-refresh based on viewport (with throttling + caching).
- **Highlighting:** tool selection visually emphasizes matching map items.
- **Simulation:** Dijkstra run opens a modal showing a step-by-step route summary and cost accumulation.
- **Overlap handling:** clicking a stack of items shows a list to pick one.
- Preserve existing app stability and keep algorithm modules unit-testable in Node.

## Non-goals
- Loading *all roads in India at once* (not feasible via Overpass; rate limits + huge data).
- Offline operation for the live OSM layer (the existing bundled `data/india_roads.json` remains as fallback).
- Perfect real-time traffic modeling or turn-by-turn navigation.

## Constraints / Assumptions
- **Internet required** for Overpass fetch.
- Auto-refresh must be **throttled** to reduce request volume.
- Data volume must be bounded: we will query **major roads only** (e.g., motorway/trunk/primary/secondary).

## UX / Product Behavior
### 1) Auto-loading roads and POIs
- On map `moveend` (pan/zoom complete), schedule a fetch after an idle delay (e.g., 1200ms).
- If another moveend occurs before delay, reset timer.
- Fetch only when:
  - zoom is above a minimum threshold (e.g., `zoom >= 7`), and
  - bounds area is below a maximum threshold (to prevent huge bbox queries).

### 2) Road status selection
- OSM roads are rendered as polylines.
- Clicking a road opens a Leaflet popup with 3 actions:
  - **Block** (red + dashed)
  - **Partial** (orange)
  - **Open** (blue)
- Selected status is stored as an **override** keyed by a stable segment id.

### 3) POIs shown by default
- POIs (hospitals, police stations, helipads) are queried from Overpass for the current bbox.
- POIs render as emoji markers with category color.

### 4) Resource markers
- When a resource is added via the Resource Form, a **resource marker** is shown at its pinned base location.
- Clicking the marker selects it and can show details.

### 5) Tool highlighting
- While a tool is selected (persisting), matching map items are visually emphasized:
  - larger icon and/or glow ring
  - higher z-index
- Applies to:
  - user markers (help centers/resources/zones)
  - Overpass POIs

### 6) Overlapping items
- Clicking on a position where multiple items overlap opens a popup list:
  - each row: emoji + label + type
  - selecting a row selects that item

### 7) Dijkstra simulation modal
- Clicking “Dijkstra ▶” triggers:
  - route computation (same rules as today, but using current road graph source)
  - a **center modal** opens showing:
    - chosen start + goal
    - total distance/cost
    - step list: segment-by-segment summary and cumulative cost

Out of scope for this change: route animation playback (can be added later once the modal is stable).

## Architecture Changes
### New domain modules
- `js/domain/overpass.js`
  - Builds Overpass QL query strings.
  - Fetches JSON with `AbortController`.
  - Implements caching by `{bbox, zoom, filters}`.
  - Throttle helper for auto-refresh.

- `js/domain/osmRoads.js`
  - Converts Overpass response → `osmNetwork`:
    - `nodes`: `{ id, lat, lng }`
    - `edges`: `{ id, from, to, km, status }`
  - Limits to major highways; simplifies geometry if needed.
  - Produces stable segment ids (see below).

- `js/domain/osmPois.js`
  - Converts Overpass nodes/ways to POI markers with categories:
    - hospital, police, helipad

### Map layers
- `js/map/osmLayers.js`
  - Renders OSM roads and POIs.
  - Applies override styling.
  - Handles click → popup actions.

- Extend existing `js/map/layers.js`
  - Add rendering for `state.resources` as map markers.
  - Add highlight styling support.

### State model additions (in reducer + persistence)
Add:
- `osmEnabled: boolean` (default true)
- `osmRoadNetwork: null | {nodes, edges}`
- `osmPois: Array<...>`
- `osmEdgeOverrides: Record<string, 'open'|'partial'|'blocked'>`
- `osmFetchStatus: { loading:boolean, error:string|null, lastAt:number|null }`
- `mapHighlight: { kind: string|null, type: string|null }`

### Stable segment IDs
Overpass returns ways with geometries. We need a stable id for a clickable edge segment.
- Segment id format:
  - `way:<wayId>:<i>` where `i` is the index between consecutive geometry points.
- Node ids:
  - prefer OSM node ids if available; otherwise `coord:<lat>,<lng>` (rounded).

## Algorithm integration
- Dijkstra should use the active road graph source:
  1) If OSM roads loaded and valid → build adjacency from `osmRoadNetwork`.
  2) Else fallback to bundled `state.roadNetwork`.

Road status overrides affect adjacency weights just like today:
- `blocked` → removed
- `partial` → weight multiplier (e.g., ×5)

## Error Handling
- Overpass failures:
  - keep last successful data
  - show error in Event Log
- Rate limiting / huge bbox:
  - if bbox too large or zoom too low, do not fetch; show hint (“Zoom in to load roads”).

## Testing Strategy
- Node unit tests (pure functions):
  - Overpass response → network conversion (small fixture JSON)
  - stable segment id generation
  - reducer transitions for OSM data, overrides, highlight state
- Browser smoke checks:
  - zoom/pan triggers fetch and renders roads
  - road click toggles status
  - POIs appear
  - resource form creates map marker
  - Dijkstra opens modal with step list

## Rollout Plan (High-level)
1) Implement Overpass fetch + conversion + rendering (roads).
2) Add overrides and road click actions.
3) Add POIs.
4) Add resource markers.
5) Add highlight system.
6) Add overlap picker.
7) Add Dijkstra simulation modal.

---

## Open Questions (resolved)
- Roads source: Overpass (major roads)
- Refresh: auto on viewport changes (throttled)
- POIs: auto-load with roads
- Highlight: persists while tool selected
- Simulation UI: centered modal
- Overlap handling: popup list
