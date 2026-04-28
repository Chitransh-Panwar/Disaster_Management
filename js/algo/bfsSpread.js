/**
 * bfsSpread.js
 *
 * BFS level-spread from a source node.
 *
 * When the WASM module is available the C++ implementation (cpp/algo.cpp) is
 * used.  Otherwise the pure-JavaScript fallback below is used transparently.
 */

import { getWasmModule, wasmBfsLevels } from './wasmBridge.js';

/* ─── Pure-JS fallback implementation ─────────────────────────────────────── */

function bfsLevels_js(adj, start) {
  if (typeof start !== 'string' || start.length === 0) {
    throw new Error('BFS start must be a non-empty string');
  }

  const q = [start];
  const levels = new Map([[start, 0]]);

  while (q.length) {
    const u = q.shift();
    const lu = levels.get(u);
    for (const e of (adj?.[u] ?? [])) {
      const v = e?.to;
      if (typeof v !== 'string' || v.length === 0) continue;
      if (levels.has(v)) continue;
      levels.set(v, lu + 1);
      q.push(v);
    }
  }

  return levels;
}

/* ─── Public export: WASM when available, JS otherwise ─────────────────────── */

export function bfsLevels(adj, start) {
  if (getWasmModule()) {
    return wasmBfsLevels(adj, start);
  }
  return bfsLevels_js(adj, start);
}
