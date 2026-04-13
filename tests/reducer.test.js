import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reducer } from '../js/state/reducer.js';

test('reducer SET_STATS merges stats', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'SET_STATS', stats: { components: 7 } });
  assert.equal(s1.stats.components, 7);
});

test('reducer SET_BRIDGES stores bridge edge ids', () => {
  const s0 = createInitialState();
  assert.deepEqual(s0.bridgeEdgeIds, []);
  const s1 = reducer(s0, { type: 'SET_BRIDGES', edgeIds: ['E1', 'E2'] });
  assert.deepEqual(s1.bridgeEdgeIds, ['E1', 'E2']);
});

test('reducer stores resources and budget', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'SET_RESOURCE_BUDGET', budget: 100 });
  assert.equal(s1.resourceBudget, 100);

  const r = {
    id: 'res-1',
    resourceType: 'Rescue Helicopter',
    resourceName: 'IAF Mi-17',
    quantity: 2,
    capacityPerUnit: 20,
    costPerUnit: 50,
    baseLat: 28.6,
    baseLng: 77.2,
    status: 'available',
    notes: '',
  };

  const s2 = reducer(s1, { type: 'ADD_RESOURCE', resource: r });
  assert.equal(s2.resources.length, 1);
  assert.equal(s2.resources[0].id, 'res-1');
});

test('reducer stores knapsack result', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'SET_KNAPSACK_RESULT', result: { maxValue: 7, chosen: { X: 1 } } });
  assert.equal(s1.knapsackResult.maxValue, 7);
  assert.deepEqual(s1.knapsackResult.chosen, { X: 1 });
});
