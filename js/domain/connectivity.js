import { DSU } from '../algo/dsu.js';

export function computeRoadComponents(network) {
  const nodes = network?.nodes ?? [];
  const edges = network?.edges ?? [];

  const ids = [];
  for (const n of nodes) {
    if (n && typeof n.id === 'string') ids.push(n.id);
  }

  const dsu = new DSU(ids);

  for (const e of edges) {
    if (!e || e.status === 'blocked') continue;
    if (typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    dsu.union(e.from, e.to);
  }

  return dsu.components();
}
