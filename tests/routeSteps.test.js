import test from 'node:test';
import assert from 'node:assert/strict';
import { routeStepsFromPath } from '../js/domain/routeSteps.js';

test('routeStepsFromPath returns per-edge steps with cumulative + total cost', () => {
  const adj = {
    A: [{ to: 'B', w: 2, edgeId: 'e1' }],
    B: [{ to: 'C', w: 3, edgeId: 'e2' }],
  };

  const { steps, totalCost } = routeStepsFromPath(adj, ['A', 'B', 'C']);
  assert.equal(totalCost, 5);
  assert.equal(steps.length, 2);

  assert.deepEqual(steps[0], {
    from: 'A',
    to: 'B',
    edgeId: 'e1',
    cost: 2,
    cumulativeCost: 2,
  });

  assert.deepEqual(steps[1], {
    from: 'B',
    to: 'C',
    edgeId: 'e2',
    cost: 3,
    cumulativeCost: 5,
  });
});

test('routeStepsFromPath throws when path implies missing edge', () => {
  assert.throws(
    () => routeStepsFromPath({ A: [] }, ['A', 'B']),
    /missing edge/i
  );
});
