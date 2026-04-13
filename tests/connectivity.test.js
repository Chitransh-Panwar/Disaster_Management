import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRoadComponents } from '../js/domain/connectivity.js';

test('computeRoadComponents ignores blocked edges', () => {
  const network = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    edges: [
      { id: 'E1', from: 'A', to: 'B', status: 'open' },
      { id: 'E2', from: 'B', to: 'C', status: 'blocked' },
    ],
  };

  assert.equal(computeRoadComponents(network), 2);
});
