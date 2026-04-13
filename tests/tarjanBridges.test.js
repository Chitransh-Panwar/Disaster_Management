import test from 'node:test';
import assert from 'node:assert/strict';
import { findBridgeEdgeIds } from '../js/algo/tarjanBridges.js';

test('tarjan finds bridge edges', () => {
  const adj = {
    A: [{ to: 'B', w: 1, edgeId: 'E1' }],
    B: [
      { to: 'A', w: 1, edgeId: 'E1' },
      { to: 'C', w: 1, edgeId: 'E2' },
      { to: 'D', w: 1, edgeId: 'E3' },
    ],
    C: [{ to: 'B', w: 1, edgeId: 'E2' }, { to: 'D', w: 1, edgeId: 'E4' }],
    D: [{ to: 'B', w: 1, edgeId: 'E3' }, { to: 'C', w: 1, edgeId: 'E4' }],
  };
  assert.deepEqual(findBridgeEdgeIds(adj).sort(), ['E1']);
});
