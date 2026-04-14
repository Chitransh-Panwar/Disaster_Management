import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, throttleMs } from '../js/domain/overpass.js';

test('buildOverpassQuery includes out:json, timeout, bbox, and required filters', () => {
  const q = buildOverpassQuery({
    bbox: { s: 1, w: 2, n: 3, e: 4 },
    includeRoads: true,
    includePois: true,
  });

  assert.ok(q.includes('[out:json]'));
  assert.ok(q.includes('[timeout:25]'));
  assert.ok(q.includes('(1,2,3,4)'));

  assert.match(
    q,
    /way\[\"highway\"~\"\^\(motorway\|trunk\|primary\|secondary\|tertiary\|unclassified\|residential\)\$\"\]/
  );

  assert.ok(q.includes('node["amenity"="hospital"]'));
  assert.ok(q.includes('node["amenity"="police"]'));
  assert.ok(q.includes('node["aeroway"="helipad"]'));

  assert.ok(q.trimEnd().endsWith('out body geom;'));
});

test('buildOverpassQuery omits way filter when includeRoads is false', () => {
  const q = buildOverpassQuery({
    bbox: { s: 1, w: 2, n: 3, e: 4 },
    includeRoads: false,
    includePois: true,
  });

  assert.doesNotMatch(q, /way\[\"highway\"/);
  assert.ok(q.includes('node["amenity"="hospital"]'));
});

test('buildOverpassQuery omits POI node filters when includePois is false', () => {
  const q = buildOverpassQuery({
    bbox: { s: 1, w: 2, n: 3, e: 4 },
    includeRoads: true,
    includePois: false,
  });

  assert.match(q, /way\[\"highway\"/);
  assert.ok(!q.includes('node["amenity"="hospital"]'));
  assert.ok(!q.includes('node["amenity"="police"]'));
  assert.ok(!q.includes('node["aeroway"="helipad"]'));
});

test('buildOverpassQuery throws when bbox array contains NaN', () => {
  assert.throws(
    () => buildOverpassQuery({ bbox: [1, 2, Number.NaN, 4] }),
    /bbox must provide finite numbers/i,
  );
});

test('throttleMs(fn, waitMs) calls fn once after waitMs of inactivity', async () => {
  let calls = 0;
  let lastArg;

  const fn = (arg) => {
    calls += 1;
    lastArg = arg;
  };

  const throttled = throttleMs(fn, 20);
  throttled(1);
  throttled(2);

  // Ensure it doesn't fire synchronously
  assert.equal(calls, 0);

  await new Promise((r) => setTimeout(r, 35));
  assert.equal(calls, 1);
  assert.equal(lastArg, 2);
});
