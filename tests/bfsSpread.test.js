import test from 'node:test';
import assert from 'node:assert/strict';
import { bfsLevels } from '../js/algo/bfsSpread.js';

test('bfs returns levels', () => {
  const adj = { A: [{ to: 'B' }], B: [{ to: 'C' }], C: [] };
  const levels = bfsLevels(adj, 'A');
  assert.equal(levels.get('A'), 0);
  assert.equal(levels.get('B'), 1);
  assert.equal(levels.get('C'), 2);
});

test('bfs does not loop on cycles', () => {
  const adj = { A: [{ to: 'B' }], B: [{ to: 'A' }] };
  const levels = bfsLevels(adj, 'A');
  assert.equal(levels.get('A'), 0);
  assert.equal(levels.get('B'), 1);
  assert.equal(levels.size, 2);
});
