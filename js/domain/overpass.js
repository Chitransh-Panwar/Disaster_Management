const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function normalizeBbox(bbox) {
  if (Array.isArray(bbox) && bbox.length === 4) {
    const [s, w, n, e] = bbox;
    if (![s, w, n, e].every((v) => Number.isFinite(v))) {
      throw new Error('bbox must provide finite numbers: s,w,n,e');
    }
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
  return `[out:json][timeout:25];\n(\n  ${union}\n);\nout body geom;`;
}

/**
 * Debounce calls to `fn` by `waitMs`.
 * Returns a function that resets its timer on each call; after `waitMs` of
 * inactivity it calls fn(...args) using the most recent args.
 */
export function throttleMs(fn, waitMs) {
  if (typeof fn !== 'function') {
    throw new Error('fn must be a function');
  }
  if (!Number.isFinite(waitMs) || waitMs < 0) {
    throw new Error('waitMs must be a non-negative finite number');
  }

  let timer = null;
  let lastArgs = null;
  let lastThis = null;

  return function throttled(...args) {
    lastArgs = args;
    lastThis = this;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(lastThis, lastArgs ?? []);
    }, waitMs);
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
