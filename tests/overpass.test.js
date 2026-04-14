import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery } from '../js/domain/overpass.js';

test('buildOverpassQuery includes out:json, bbox, and required filters', () => {
  const q = buildOverpassQuery({
    bbox: { s: 1, w: 2, n: 3, e: 4 },
    includeRoads: true,
    includePois: true,
  });

  assert.ok(q.includes('[out:json]'));
  assert.ok(q.includes('(1,2,3,4)'));

  assert.match(q, /way\[\"highway\"~\"\^\(motorway\|trunk\|primary\|secondary\)\$\"\]/);

  assert.ok(q.includes('node["amenity"="hospital"]'));
  assert.ok(q.includes('node["amenity"="police"]'));
  assert.ok(q.includes('node["aeroway"="helipad"]'));
});
