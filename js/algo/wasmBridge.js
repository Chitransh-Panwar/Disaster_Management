/**
 * wasmBridge.js – load the Emscripten-generated WASM module and expose
 * thin wrappers for every C++ algorithm exported from cpp/algo.cpp.
 *
 * Usage
 * ─────
 *   import { initWasm, getWasmModule } from './wasmBridge.js';
 *
 *   // Call once at app startup (async):
 *   await initWasm();
 *
 *   // Then individual algo files check getWasmModule() !== null and call in.
 *
 * If the WASM artifacts are not present (e.g. not yet built with
 * build_wasm.sh) initWasm() silently resolves and getWasmModule() returns
 * null – all algo modules fall back to their pure-JS implementations.
 */

let _mod = null;          // Emscripten module instance (or null)
let _initPromise = null;  // singleton init promise

/**
 * Initialize the WASM module.  Safe to call multiple times – only runs once.
 * @returns {Promise<boolean>}  true if WASM loaded, false if unavailable/error
 */
export async function initWasm() {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      // Dynamic import so the app still loads when the file doesn't exist yet.
      const { default: createAlgoModule } = await import('./wasm/algo_module.js');
      _mod = await createAlgoModule();
      return true;
    } catch {
      // WASM not built yet or failed to load – use JS fallbacks silently.
      _mod = null;
      return false;
    }
  })();

  return _initPromise;
}

/**
 * Returns the Emscripten module instance, or null if WASM is unavailable.
 * @returns {object|null}
 */
export function getWasmModule() {
  return _mod;
}

/* ──────────────────────────────────────────────────────────────────────────
   Helper – call a string-in / string-out C export via ccall.
────────────────────────────────────────────────────────────────────────── */
function callJson(fnName, inputObj) {
  const input = JSON.stringify(inputObj);
  const raw = _mod.ccall(fnName, 'string', ['string'], [input]);
  const result = JSON.parse(raw);
  if (result && typeof result.error === 'string') {
    throw new Error(`WASM ${fnName}: ${result.error}`);
  }
  return result;
}

/* ──────────────────────────────────────────────────────────────────────────
   Dijkstra
────────────────────────────────────────────────────────────────────────── */

/**
 * @param {Object} graph  – { nodeId: [{to, w}, …], … }
 * @param {string} start
 * @param {string} goal
 * @returns {{ distance: number, path: string[] }}
 */
export function wasmDijkstra(graph, start, goal) {
  const r = callJson('dijkstra_json', { graph, start, goal });
  return {
    distance: r.distance === null ? Infinity : r.distance,
    path: r.path ?? [],
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   BFS levels
────────────────────────────────────────────────────────────────────────── */

/**
 * @param {Object} adj    – { nodeId: [{to}, …], … }
 * @param {string} start
 * @returns {Map<string, number>}
 */
export function wasmBfsLevels(adj, start) {
  const r = callJson('bfs_levels_json', { adj, start });
  return new Map(Object.entries(r));
}

/* ──────────────────────────────────────────────────────────────────────────
   Tarjan bridges
────────────────────────────────────────────────────────────────────────── */

/**
 * @param {Object} adj  – { nodeId: [{to, edgeId}, …], … }
 * @returns {string[]}
 */
export function wasmFindBridges(adj) {
  const r = callJson('find_bridges_json', { adj });
  return r.bridges ?? [];
}

/* ──────────────────────────────────────────────────────────────────────────
   Bounded knapsack
────────────────────────────────────────────────────────────────────────── */

/**
 * @param {Array<{id,weight,value,quantity}>} items
 * @param {number} maxWeight
 * @returns {{ maxValue: number, chosen: Object }}
 */
export function wasmBoundedKnapsack(items, maxWeight) {
  return callJson('bounded_knapsack_json', { items, maxWeight });
}

/* ──────────────────────────────────────────────────────────────────────────
   Waypoint order
────────────────────────────────────────────────────────────────────────── */

/**
 * @param {number[][]} distMatrix
 * @returns {number[]}
 */
export function wasmComputeWaypointOrder(distMatrix) {
  const raw = _mod.ccall('compute_waypoint_order_json', 'string',
    ['string'], [JSON.stringify(distMatrix)]);
  return JSON.parse(raw);
}

/* ──────────────────────────────────────────────────────────────────────────
   Mission simulation
────────────────────────────────────────────────────────────────────────── */

/**
 * @param {Array<{path,distanceKm,waypointIdx}>} segments
 * @param {number} fuelKm
 * @param {number} speedKmh
 * @param {Object} adj   – adjacency list (for return-path Dijkstra)
 * @returns {Object}     – MissionResult
 */
export function wasmSimulateMission(segments, fuelKm, speedKmh, adj) {
  const r = callJson('simulate_mission_json', { segments, fuelKm, speedKmh, adj });
  return {
    aborted: r.aborted,
    totalDistanceKm: r.totalDistanceKm,
    etaHours: r.etaHours === null ? Infinity : r.etaHours,
    traveledPaths: r.traveledPaths,
    returnPath: r.returnPath,
    returnDistanceKm: r.returnDistanceKm,
    visitedWaypointIndices: r.visitedWaypointIndices,
    unvisitedWaypointIndices: r.unvisitedWaypointIndices,
    abortNodeId: r.abortNodeId,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   DSU  (instance-based, mirrors the JS DSU class API)
────────────────────────────────────────────────────────────────────────── */

/**
 * Thin JS wrapper around the C++ DSU exposed via integer handles.
 */
export class WasmDSU {
  #handle;

  constructor(items) {
    this.#handle = _mod.ccall('dsu_create', 'number',
      ['string'], [JSON.stringify(Array.from(items))]);
  }

  find(x) {
    return _mod.ccall('dsu_find', 'string', ['number', 'string'], [this.#handle, x]);
  }

  union(a, b) {
    return _mod.ccall('dsu_union', 'number',
      ['number', 'string', 'string'], [this.#handle, a, b]) === 1;
  }

  components() {
    return _mod.ccall('dsu_components', 'number', ['number'], [this.#handle]);
  }

  destroy() {
    _mod.ccall('dsu_destroy', null, ['number'], [this.#handle]);
  }
}
