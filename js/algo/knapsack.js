/**
 * knapsack.js
 *
 * Bounded knapsack via binary splitting → 0/1 DP.
 *
 * When the WASM module is available the C++ implementation (cpp/algo.cpp) is
 * used.  Otherwise the pure-JavaScript fallback below is used transparently.
 */

import { getWasmModule, wasmBoundedKnapsack } from './wasmBridge.js';

/* ─── Pure-JS fallback implementation ─────────────────────────────────────── */

function boundedKnapsack_js(items, maxWeight) {
  if (!Number.isInteger(maxWeight) || maxWeight < 0) {
    throw new Error('Knapsack maxWeight must be a non-negative integer');
  }

  const baseItems = Array.isArray(items) ? items : [];

  /** @type {Array<{id:string, weight:number, value:number, count:number}>} */
  const split = [];

  for (const it of baseItems) {
    const id = it?.id;
    const w = it?.weight;
    const v = it?.value;
    const q = it?.quantity;

    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Knapsack item id must be a non-empty string');
    }
    if (!Number.isInteger(w) || w <= 0) {
      throw new Error('Knapsack item weight must be a positive integer');
    }
    if (!Number.isInteger(v) || v < 0) {
      throw new Error('Knapsack item value must be a non-negative integer');
    }
    if (!Number.isInteger(q) || q < 0) {
      throw new Error('Knapsack item quantity must be a non-negative integer');
    }

    let left = q;
    let k = 1;
    while (left > 0) {
      const take = Math.min(k, left);
      split.push({ id, weight: w * take, value: v * take, count: take });
      left -= take;
      k *= 2;
    }
  }

  const dp = new Array(maxWeight + 1).fill(0);
  const prevW = new Array(maxWeight + 1).fill(-1);
  const prevI = new Array(maxWeight + 1).fill(-1);

  for (let i = 0; i < split.length; i++) {
    const si = split[i];
    for (let W = maxWeight; W >= si.weight; W--) {
      const cand = dp[W - si.weight] + si.value;
      if (cand > dp[W]) {
        dp[W] = cand;
        prevW[W] = W - si.weight;
        prevI[W] = i;
      }
    }
  }

  let bestW = 0;
  for (let W = 1; W <= maxWeight; W++) {
    if (dp[W] > dp[bestW]) bestW = W;
    else if (dp[W] === dp[bestW] && W < bestW) bestW = W;
  }

  const chosen = Object.create(null);
  let curW = bestW;
  while (curW >= 0 && prevI[curW] !== -1) {
    const si = split[prevI[curW]];
    chosen[si.id] = (chosen[si.id] ?? 0) + si.count;
    curW = prevW[curW];
  }

  // Convert to plain object without zeros
  const outChosen = {};
  for (const [k, v] of Object.entries(chosen)) {
    if (v > 0) outChosen[k] = v;
  }

  return { maxValue: dp[bestW], chosen: outChosen };
}

/* ─── Public export: WASM when available, JS otherwise ─────────────────────── */

export function boundedKnapsack(items, maxWeight) {
  if (getWasmModule()) {
    return wasmBoundedKnapsack(items, maxWeight);
  }
  return boundedKnapsack_js(items, maxWeight);
}
