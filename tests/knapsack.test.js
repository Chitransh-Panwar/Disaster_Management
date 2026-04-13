import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedKnapsack } from '../js/algo/knapsack.js';

test('boundedKnapsack chooses optimal counts', () => {
  const items = [
    { id: 'heli', weight: 5, value: 10, quantity: 2 },
    { id: 'boat', weight: 4, value: 7, quantity: 3 },
  ];

  const res = boundedKnapsack(items, 10);

  assert.equal(res.maxValue, 20);
  assert.deepEqual(res.chosen, { heli: 2 });
});

test('boundedKnapsack uses combination when best', () => {
  const items = [
    { id: 'A', weight: 6, value: 12, quantity: 1 },
    { id: 'B', weight: 4, value: 8, quantity: 2 },
  ];

  const res = boundedKnapsack(items, 10);

  // Choose A(6,12) + B(4,8) = (10,20)
  assert.equal(res.maxValue, 20);
  assert.deepEqual(res.chosen, { A: 1, B: 1 });
});

test('boundedKnapsack throws on invalid maxWeight', () => {
  assert.throws(() => boundedKnapsack([], -1), /maxWeight/);
});
