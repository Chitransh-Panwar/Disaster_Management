import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overpassToRoadNetwork } from '../js/domain/osmRoads.js';

function loadFixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('overpassToRoadNetwork converts ways with geometry into {nodes, edges}', () => {
  const sample = loadFixture('overpass.sample.json');
  const net = overpassToRoadNetwork(sample);

  assert.ok(Array.isArray(net.nodes));
  assert.ok(Array.isArray(net.edges));

  // way 1001 yields 2 segments, way 1002 yields 1 segment; way 1003 has no geometry and is ignored
  assert.equal(net.edges.length, 3);
  assert.ok(net.edges.some((e) => e.id === 'way:1001:0'));
  assert.ok(net.edges.some((e) => e.id === 'way:1001:1'));
  assert.ok(net.edges.some((e) => e.id === 'way:1002:0'));

  for (const e of net.edges) {
    assert.equal(e.status, 'open');
    assert.ok(Number.isFinite(e.km));
    assert.ok(e.km > 0);
    assert.ok(typeof e.from === 'string' && e.from.length > 0);
    assert.ok(typeof e.to === 'string' && e.to.length > 0);
  }

  // The shared coordinate (28.01, 77.01) should map to a single node id.
  const shared = net.nodes.filter((n) => n.lat === 28.01 && n.lng === 77.01);
  assert.equal(shared.length, 1);
});

test('overpassToRoadNetwork throws on invalid input', () => {
  assert.throws(() => overpassToRoadNetwork(null), /overpass/i);
  assert.throws(() => overpassToRoadNetwork({}), /elements/i);
});
