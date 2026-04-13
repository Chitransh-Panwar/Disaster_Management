const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_EDGE_STATUS = new Set(['open', 'partial', 'blocked']);

function isSafeKey(k) {
  return typeof k === 'string' && k.length > 0 && !UNSAFE_KEYS.has(k);
}

export async function loadScenario(id) {
  let res;
  try {
    res = await fetch(`data/scenarios/${id}.json`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed scenario ${id}: ${msg}`);
  }

  if (!res.ok) throw new Error(`Failed scenario ${id}: ${res.status}`);

  try {
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed scenario ${id}: invalid JSON (${msg})`);
  }
}

export function scenarioToStatePayload(s) {
  const edgeOverrides = Object.create(null);

  for (const o of s.edgeOverrides ?? []) {
    const edgeId = o?.edgeId;
    const status = o?.status;
    if (!isSafeKey(edgeId)) continue;
    if (!ALLOWED_EDGE_STATUS.has(status)) continue;
    edgeOverrides[edgeId] = status;
  }

  return {
    scenarioId: s.id,
    markers: s.markers ?? [],
    edgeOverrides,
  };
}
