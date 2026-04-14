export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];

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
 * @param {object} opts
 * @param {object} opts.bbox
 * @param {boolean} [opts.includeRoads=true]
 * @param {boolean} [opts.includeHospitals=false]
 * @param {boolean} [opts.includePolice=false]
 * @param {boolean} [opts.includePois] - Legacy flag: when true, enables all POI types
 */
export function buildOverpassQuery({ bbox, includeRoads = true, includePois, includeHospitals = false, includePolice = false } = {}) {
  const { s, w, n, e } = normalizeBbox(bbox);
  const bboxStr = `(${s},${w},${n},${e})`;

  // Legacy: if includePois is explicitly true, enable all POI types
  const hospitals = includePois === true ? true : includeHospitals;
  const police = includePois === true ? true : includePolice;

  const parts = [];
  if (includeRoads) {
    parts.push(
      `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"]${bboxStr};`
    );
  }

  if (hospitals) {
    parts.push(`node["amenity"="hospital"]${bboxStr};`);
  }
  if (police) {
    parts.push(`node["amenity"="police"]${bboxStr};`);
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

export function createOverpassClient({ fetchFn = fetch, endpoints = OVERPASS_ENDPOINTS, nowFn = Date.now } = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn must be a function');
  }

  const cache = new Map();
  let cooldownUntil = 0;
  let endpointIndex = 0;

  function getCooldownRemaining() {
    const rem = cooldownUntil - nowFn();
    return rem > 0 ? rem : 0;
  }

  function isOnCooldown() {
    return getCooldownRemaining() > 0;
  }

  function setCooldown(ms) {
    const until = nowFn() + ms;
    if (until > cooldownUntil) cooldownUntil = until;
  }

  function runQuery(query, { signal } = {}) {
    if (typeof query !== 'string' || query.trim().length === 0) {
      return Promise.reject(new Error('query must be a non-empty string'));
    }

    if (isOnCooldown()) {
      const secs = Math.ceil(getCooldownRemaining() / 1000);
      return Promise.reject(new Error(`Overpass rate-limited. Retry in ${secs}s.`));
    }

    const cached = cache.get(query);
    if (cached) return cached;

    const url = (endpoints && endpoints.length > 0)
      ? endpoints[endpointIndex % endpoints.length]
      : OVERPASS_ENDPOINTS[0];

    const body = new URLSearchParams({ data: query }).toString();

    const p = fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal,
    })
      .then(async (res) => {
        if (res.status === 429) {
          setCooldown(60000);
          endpointIndex++;
          throw new Error('Overpass rate-limited (429). Cooling down for 60s.');
        }
        if (res.status === 503) {
          setCooldown(30000);
          endpointIndex++;
          throw new Error('Overpass unavailable (503). Cooling down for 30s.');
        }
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

  return { runQuery, isOnCooldown, getCooldownRemaining };
}
