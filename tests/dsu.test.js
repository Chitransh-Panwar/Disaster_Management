import test from 'node:test';
import assert from 'node:assert/strict';
import { DSU } from '../js/algo/dsu.js';

test('dsu counts components', () => {
  const dsu = new DSU(['A', 'B', 'C']);
  dsu.union('A', 'B');
  assert.equal(dsu.components(), 2);
});
