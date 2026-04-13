import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStats } from '../js/ui/stats.js';

test('renderStats renders components and counts', () => {
  const targetEl = { innerHTML: '' };
  const state = {
    stats: { components: 3 },
    edgeOverrides: { E1: 'blocked', E2: 'open', E3: 'blocked' },
    markers: [{ id: 'm1' }, { id: 'm2' }],
  };

  renderStats(targetEl, state);

  assert.match(targetEl.innerHTML, /DSU components:\s*<b>3<\/b>/);
  assert.match(targetEl.innerHTML, /Blocked edges:\s*<b>2<\/b>/);
  assert.match(targetEl.innerHTML, /Markers:\s*<b>2<\/b>/);
});
