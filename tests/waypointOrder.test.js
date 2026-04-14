import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nearestNeighborOrder,
  pathCost,
  twoOptImprove,
  computeWaypointOrder,
} from '../js/algo/waypointOrder.js';

test('nearestNeighborOrder returns [0] for single point', () => {
  assert.deepEqual(nearestNeighborOrder([[0]]), [0]);
});

test('nearestNeighborOrder returns [] for empty matrix', () => {
  assert.deepEqual(nearestNeighborOrder([]), []);
});

test('nearestNeighborOrder visits all points', () => {
  // 0->1 = 1, 0->2 = 10, 1->2 = 2
  const dm = [
    [0, 1, 10],
    [1, 0, 2],
    [10, 2, 0],
  ];
  const order = nearestNeighborOrder(dm);
  assert.equal(order[0], 0); // starts at 0
  assert.equal(order.length, 3);
  assert.deepEqual(new Set(order), new Set([0, 1, 2]));
});

test('nearestNeighborOrder picks nearest first', () => {
  // 0->1 = 5, 0->2 = 2, 0->3 = 10
  const dm = [
    [0, 5, 2, 10],
    [5, 0, 3, 1],
    [2, 3, 0, 4],
    [10, 1, 4, 0],
  ];
  const order = nearestNeighborOrder(dm);
  assert.equal(order[0], 0);
  assert.equal(order[1], 2); // nearest to 0
});

test('pathCost computes correct total', () => {
  const dm = [
    [0, 3, 7],
    [3, 0, 2],
    [7, 2, 0],
  ];
  assert.equal(pathCost(dm, [0, 1, 2]), 5); // 3 + 2
  assert.equal(pathCost(dm, [0, 2, 1]), 9); // 7 + 2
});

test('twoOptImprove does not worsen solution', () => {
  const dm = [
    [0, 1, 10, 20],
    [1, 0, 1, 10],
    [10, 1, 0, 1],
    [20, 10, 1, 0],
  ];
  const order = [0, 1, 2, 3];
  const costBefore = pathCost(dm, order);
  twoOptImprove(dm, order);
  const costAfter = pathCost(dm, order);
  assert.ok(costAfter <= costBefore + 1e-9);
  assert.equal(order[0], 0); // start stays fixed
});

test('computeWaypointOrder returns valid order', () => {
  const dm = [
    [0, 2, 9, 10],
    [2, 0, 6, 4],
    [9, 6, 0, 8],
    [10, 4, 8, 0],
  ];
  const order = computeWaypointOrder(dm);
  assert.equal(order[0], 0);
  assert.equal(order.length, 4);
  assert.deepEqual(new Set(order), new Set([0, 1, 2, 3]));
});
