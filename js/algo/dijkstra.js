/**
 * dijkstra.js
 *
 * When the WASM module is loaded (via initWasm() in app.js) the exported
 * dijkstra() function delegates to the C++ implementation compiled in
 * cpp/algo.cpp.  If the WASM module is unavailable (e.g. not yet built) the
 * pure-JavaScript fallback below is used transparently.
 */

import { getWasmModule, wasmDijkstra } from './wasmBridge.js';

/* ─── Pure-JS fallback implementation ─────────────────────────────────────── */

function dijkstra_js(graph, start, goal) {
  if (start === goal) {
    return { distance: 0, path: [start] };
  }

  const nodes = new Set();
  for (const [from, edges] of Object.entries(graph ?? {})) {
    nodes.add(from);
    for (const e of edges ?? []) nodes.add(e.to);
  }
  nodes.add(start);
  nodes.add(goal);

  const dist = Object.create(null);
  const prev = Object.create(null);
  for (const n of nodes) dist[n] = Infinity;
  dist[start] = 0;

  const visited = new Set();
  const pq = [{ node: start, dist: 0 }];

  while (pq.length) {
    let minIdx = 0;
    for (let i = 1; i < pq.length; i++) {
      if (pq[i].dist < pq[minIdx].dist) minIdx = i;
    }

    const { node: cur, dist: curDist } = pq.splice(minIdx, 1)[0];
    if (visited.has(cur)) continue;
    visited.add(cur);

    if (cur === goal) break;
    if (curDist !== dist[cur]) continue;

    const edges = graph?.[cur] ?? [];
    for (const e of edges) {
      const to = e?.to;
      const w = e?.w;

      if (typeof to !== 'string' || to.length === 0) {
        throw new Error('Dijkstra edge "to" must be a non-empty string');
      }

      if (!Number.isFinite(w) || w < 0) {
        throw new Error('Dijkstra requires non-negative finite weights');
      }

      const nextDist = curDist + w;
      if (nextDist < (dist[to] ?? Infinity)) {
        dist[to] = nextDist;
        prev[to] = cur;
        pq.push({ node: to, dist: nextDist });
      }
    }
  }

  const distance = dist[goal] ?? Infinity;
  if (!Number.isFinite(distance)) return { distance: Infinity, path: [] };

  const path = [];
  let cur = goal;
  while (cur !== undefined) {
    path.push(cur);
    if (cur === start) break;
    cur = prev[cur];
  }

  if (path[path.length - 1] !== start) return { distance: Infinity, path: [] };
  path.reverse();
  return { distance, path };
}

/* ─── Public export: WASM when available, JS otherwise ─────────────────────── */

export function dijkstra(graph, start, goal) {
  if (getWasmModule()) {
    return wasmDijkstra(graph, start, goal);
  }
  return dijkstra_js(graph, start, goal);
}
