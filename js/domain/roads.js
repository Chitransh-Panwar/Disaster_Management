export async function loadRoadNetwork(url = 'data/india_roads.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load road network: ${res.status}`);
  const json = await res.json();
  return json;
}

export function buildAdjacency(network) {
  const adj = Object.create(null);

  for (const n of network.nodes ?? []) {
    if (typeof n?.id !== 'string' || n.id.length === 0) {
      throw new Error('Road node id must be a non-empty string');
    }
    adj[n.id] = [];
  }

  for (const e of network.edges ?? []) {
    if (e.status === 'blocked') continue;

    if (typeof e?.from !== 'string' || typeof e?.to !== 'string') {
      throw new Error(`Road edge endpoints must be strings (edgeId=${e?.id ?? 'unknown'})`);
    }

    if (!adj[e.from] || !adj[e.to]) {
      throw new Error(`Unknown node id in edge ${e?.id ?? 'unknown'}: ${e.from} -> ${e.to}`);
    }

    if (!Number.isFinite(e.km) || e.km < 0) {
      throw new Error(`Road edge km must be a non-negative finite number (edgeId=${e?.id ?? 'unknown'})`);
    }

    const w = e.km * (e.status === 'partial' ? 5 : 1);
    adj[e.from].push({ to: e.to, w, edgeId: e.id });
    adj[e.to].push({ to: e.from, w, edgeId: e.id });
  }

  return adj;
}

export function applyEdgeOverrides(network, edgeOverrides) {
  const edges = (network.edges ?? []).map((e) => {
    const overridden = edgeOverrides?.[e.id];
    return overridden ? { ...e, status: overridden } : e;
  });
  return { ...network, edges };
}
