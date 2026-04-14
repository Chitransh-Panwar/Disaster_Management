import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overpassToPois } from '../js/domain/osmPois.js';

function loadFixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('overpassToPois converts hospital/police/helipad nodes into POIs', () => {
  const sample = loadFixture('overpass.pois.sample.json');
  const pois = overpassToPois(sample);

  assert.ok(Array.isArray(pois));
  assert.equal(pois.length, 3);

  const kinds = new Set(pois.map((p) => p.kind));
  assert.ok(kinds.has('hospital'));
  assert.ok(kinds.has('police'));
  assert.ok(kinds.has('helipad'));

  const hospital = pois.find((p) => p.kind === 'hospital');
  assert.equal(hospital.label, 'City Hospital');
  assert.ok(hospital.id.startsWith('node:'));
});

test('overpassToPois throws on invalid input', () => {
  assert.throws(() => overpassToPois(null), /overpass/i);
  assert.throws(() => overpassToPois({}), /elements/i);
});
