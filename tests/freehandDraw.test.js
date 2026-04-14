import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyPoints, polygonCentroid } from '../js/map/freehandDraw.js';

test('simplifyPoints returns input when fewer than 3 points', () => {
  const pts = [[0, 0], [1, 1]];
  const result = simplifyPoints(pts, 0.001);
  assert.deepEqual(result, pts);
});

test('simplifyPoints reduces collinear points to endpoints', () => {
  // Perfectly collinear points along a line
  const pts = [[0, 0], [0.5, 0.5], [1, 1]];
  const result = simplifyPoints(pts, 0.001);
  assert.deepEqual(result, [[0, 0], [1, 1]]);
});

test('simplifyPoints keeps vertices that deviate beyond epsilon', () => {
  // L-shaped path: the corner point deviates a lot from the start-end line
  const pts = [[0, 0], [0, 1], [1, 1]];
  const result = simplifyPoints(pts, 0.001);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], [0, 0]);
  assert.deepEqual(result[1], [0, 1]);
  assert.deepEqual(result[2], [1, 1]);
});

test('simplifyPoints handles empty/null gracefully', () => {
  assert.deepEqual(simplifyPoints([], 0.001), []);
  assert.deepEqual(simplifyPoints(null, 0.001), []);
});

test('polygonCentroid computes average of points', () => {
  const pts = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const c = polygonCentroid(pts);
  assert.equal(c.lat, 1);
  assert.equal(c.lng, 1);
});

test('polygonCentroid returns 0,0 for empty array', () => {
  const c = polygonCentroid([]);
  assert.equal(c.lat, 0);
  assert.equal(c.lng, 0);
});

test('polygonCentroid handles single point', () => {
  const c = polygonCentroid([[10, 20]]);
  assert.equal(c.lat, 10);
  assert.equal(c.lng, 20);
});
