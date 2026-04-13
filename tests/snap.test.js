import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestNodeId } from '../js/domain/snap.js';

test('nearestNodeId returns closest node id', () => {
  const nodes = [
    { id: 'A', lat: 0, lng: 0 },
    { id: 'B', lat: 10, lng: 10 },
  ];
  assert.equal(nearestNodeId(nodes, 0.1, 0.1), 'A');
  assert.equal(nearestNodeId(nodes, 9.9, 10.2), 'B');
});

test('nearestNodeId returns null when nodes empty', () => {
  assert.equal(nearestNodeId([], 0, 0), null);
});

test('nearestNodeId throws on non-finite lat/lng', () => {
  assert.throws(() => nearestNodeId([{ id: 'A', lat: 0, lng: 0 }], NaN, 0), /finite/);
});
