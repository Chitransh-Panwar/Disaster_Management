const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function normalizeBbox(bbox) {
  if (Array.isArray(bbox) && bbox.length === 4) {
    const [s, w, n, e] = bbox;
    return { s, w, n, e };
  }

  const b = bbox && typeof bbox === 'object' ? bbox : {};
  const s = b.south ?? b.s;
  const w = b.west ?? b.w;
  const n = b.north ?? b.n;
  const e = b.east ?? b.e;

  if (![s, w, n, e].every((v) => Number.isFinite(v))) {
    throw new Error('bbox must provide finite numbers: s,w,n,e');
  }

  return { s, w, n, e };
}

/**
 * Build an Overpass QL query.
 * bbox is formatted in Overpass order: (south,west,north,east)
 */
export function buildOverpassQuery({ bbox, includeRoads = true, includePois = true } = {}) {
  const { s, w, n, e } = normalizeBbox(bbox);
  const bboxStr = `(${s},${w},${n},${e})`;

  const parts = [];
  if (includeRoads) {
    parts.push(`way["highway"~"^(motorway|trunk|primary|secondary)$"]${bboxStr};`);
  }

  if (includePois) {
    parts.push(`node["amenity"="hospital"]${bboxStr};`);
    parts.push(`node["amenity"="police"]${bboxStr};`);
    parts.push(`node["aeroway"="helipad"]${bboxStr};`);
  }

  const union = parts.join('\n  ');
  return `[out:json];\n(\n  ${union}\n);\nout body;\n>;\nout skel qt;`;
}

/**
 * A small debounce-like helper.
 * Returns a function that resolves after `ms` of quiet time.
 * If called again before the timer fires, the timer is reset.
 */
export function throttleMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error('ms must be a non-negative finite number');
  }

  let timer = null;
  /** @type {Array<() => void>} */
  let resolvers = [];

  return function wait() {
    return new Promise((resolve) => {
      resolvers.push(resolve);

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const rs = resolvers;
        resolvers = [];
        for (const r of rs) r();
      }, ms);
    });
  };
}

export function createOverpassClient({ fetchFn = fetch } = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn must be a function');
  }

  const cache = new Map();

  function runQuery(query, { signal } = {}) {
    if (typeof query !== 'string' || query.trim().length === 0) {
      return Promise.reject(new Error('query must be a non-empty string'));
    }

    const cached = cache.get(query);
    if (cached) return cached;

    const body = new URLSearchParams({ data: query }).toString();

    const p = fetchFn(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Overpass error: ${res.status}`);
        }
        return res.json();
      })
      .catch((err) => {
        cache.delete(query);
        throw err;
      });

    cache.set(query, p);
    return p;
  }

  return { runQuery };
}
