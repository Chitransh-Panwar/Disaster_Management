import test from 'node:test';
import assert from 'node:assert/strict';
import { dijkstra } from '../js/algo/dijkstra.js';

test('dijkstra returns shortest path and distance', () => {
  const graph = {
    A: [{ to: 'B', w: 1 }, { to: 'C', w: 5 }],
    B: [{ to: 'C', w: 1 }],
    C: [],
  };

  const res = dijkstra(graph, 'A', 'C');
  assert.equal(res.distance, 2);
  assert.deepEqual(res.path, ['A', 'B', 'C']);
});

test('dijkstra returns 0 distance when start === goal', () => {
  const graph = { A: [{ to: 'B', w: 2 }], B: [] };
  const res = dijkstra(graph, 'A', 'A');
  assert.equal(res.distance, 0);
  assert.deepEqual(res.path, ['A']);
});

test('dijkstra returns Infinity and empty path when unreachable', () => {
  const graph = { A: [{ to: 'B', w: 1 }], B: [], C: [] };
  const res = dijkstra(graph, 'A', 'C');
  assert.equal(res.distance, Infinity);
  assert.deepEqual(res.path, []);
});

test('dijkstra throws on negative weights', () => {
  const graph = { A: [{ to: 'B', w: -1 }], B: [] };
  assert.throws(() => dijkstra(graph, 'A', 'B'), /non-negative/);
});

test('dijkstra throws on non-finite weights', () => {
  const graph = { A: [{ to: 'B', w: Number.NaN }], B: [] };
  assert.throws(() => dijkstra(graph, 'A', 'B'), /finite/);
});
