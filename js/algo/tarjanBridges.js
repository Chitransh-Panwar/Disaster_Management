export function findBridgeEdgeIds(adj) {
  const disc = new Map();
  const low = new Map();
  let time = 0;
  const bridges = new Set();

  function dfs(u, parent) {
    time += 1;
    disc.set(u, time);
    low.set(u, time);

    for (const e of adj?.[u] ?? []) {
      const v = e?.to;
      if (typeof v !== 'string') continue;

      if (!disc.has(v)) {
        dfs(v, u);
        low.set(u, Math.min(low.get(u), low.get(v)));
        if (low.get(v) > disc.get(u)) bridges.add(e.edgeId);
      } else if (v !== parent) {
        low.set(u, Math.min(low.get(u), disc.get(v)));
      }
    }
  }

  for (const u of Object.keys(adj ?? {})) {
    if (!disc.has(u)) dfs(u, null);
  }

  return Array.from(bridges);
}
