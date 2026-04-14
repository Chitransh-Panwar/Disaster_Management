/**
 * Waypoint ordering heuristics.
 *
 * Given a distance matrix between points, computes a good visitation order
 * starting from a fixed start index (0) using nearest-neighbor + 2-opt.
 */

/**
 * Nearest-neighbor heuristic starting from index 0.
 *
 * @param {number[][]} distMatrix  – distMatrix[i][j] = distance from point i to point j
 * @returns {number[]} ordered indices (always starts with 0)
 */
export function nearestNeighborOrder(distMatrix) {
  const n = distMatrix.length;
  if (n <= 1) return n === 1 ? [0] : [];

  const visited = new Set([0]);
  const order = [0];

  while (order.length < n) {
    const cur = order[order.length - 1];
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const d = distMatrix[cur][j];
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }

    if (bestIdx === -1) break; // unreachable points
    visited.add(bestIdx);
    order.push(bestIdx);
  }

  return order;
}

/**
 * Compute total path cost for a given order (open path, no return to start).
 *
 * @param {number[][]} distMatrix
 * @param {number[]} order
 * @returns {number}
 */
export function pathCost(distMatrix, order) {
  let cost = 0;
  for (let i = 0; i < order.length - 1; i++) {
    cost += distMatrix[order[i]][order[i + 1]];
  }
  return cost;
}

/**
 * 2-opt local improvement on the order (keeps index 0 fixed as start).
 *
 * @param {number[][]} distMatrix
 * @param {number[]} order  – mutable; modified in place
 * @param {number} [maxIter=100]
 * @returns {number[]} improved order (same array reference)
 */
export function twoOptImprove(distMatrix, order, maxIter = 100) {
  const n = order.length;
  if (n <= 3) return order; // nothing to improve

  let improved = true;
  let iter = 0;

  while (improved && iter < maxIter) {
    improved = false;
    iter++;

    // Keep index 0 fixed (start); reverse sub-segments from i=1..n-1
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before =
          distMatrix[order[i - 1]][order[i]] +
          (j + 1 < n ? distMatrix[order[j]][order[j + 1]] : 0);
        const after =
          distMatrix[order[i - 1]][order[j]] +
          (j + 1 < n ? distMatrix[order[i]][order[j + 1]] : 0);

        if (after < before - 1e-9) {
          // Reverse segment [i..j]
          let left = i;
          let right = j;
          while (left < right) {
            const tmp = order[left];
            order[left] = order[right];
            order[right] = tmp;
            left++;
            right--;
          }
          improved = true;
        }
      }
    }
  }

  return order;
}

/**
 * Compute a good waypoint visitation order.
 *
 * @param {number[][]} distMatrix – symmetric distance matrix; index 0 = start
 * @returns {number[]} ordered indices starting with 0
 */
export function computeWaypointOrder(distMatrix) {
  const order = nearestNeighborOrder(distMatrix);
  twoOptImprove(distMatrix, order);
  return order;
}
