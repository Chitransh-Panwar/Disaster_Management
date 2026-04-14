/**
 * Build an edge-by-edge step list from a Dijkstra path.
 *
 * @param {Record<string, Array<{to:string, w:number, edgeId?:string}>>} adj
 * @param {string[]} path
 */
export function routeStepsFromPath(adj, path) {
  if (!Array.isArray(path)) {
    throw new Error('routeStepsFromPath: path must be an array');
  }
  if (path.length < 2) return { steps: [], totalCost: 0 };

  const steps = [];
  let totalCost = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i];
    const to = path[i + 1];

    const edges = adj?.[from] ?? [];
    const edge = (edges ?? []).find((e) => e && e.to === to);
    if (!edge) {
      throw new Error(`routeStepsFromPath: missing edge ${from} -> ${to}`);
    }

    const cost = edge.w;
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error('routeStepsFromPath: step cost must be a non-negative finite number');
    }

    totalCost += cost;

    steps.push({
      from,
      to,
      edgeId: typeof edge.edgeId === 'string' ? edge.edgeId : null,
      cost,
      cumulativeCost: totalCost,
    });
  }

  return { steps, totalCost };
}
