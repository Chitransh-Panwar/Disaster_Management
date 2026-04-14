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

test('createInitialState includes OSM defaults', () => {
  const s0 = createInitialState();
  assert.equal(s0.osmEnabled, true);
  assert.equal(s0.osmRoadNetwork, null);
  assert.deepEqual(s0.osmPois, []);
  assert.deepEqual(s0.osmEdgeOverrides, {});
  assert.deepEqual(s0.osmFetchStatus, { loading: false, error: null, lastAt: null });
});

test('reducer OSM_FETCH_SUCCESS stores network + pois and sets lastAt', () => {
  const s0 = createInitialState();
  const network = { nodes: { N1: { id: 'N1' } }, edges: [] };
  const pois = [{ id: 'P1', name: 'Shelter' }];

  const s1 = reducer(s0, { type: 'OSM_FETCH_SUCCESS', network, pois, at: 123 });
  assert.equal(s1.osmRoadNetwork, network);
  assert.equal(s1.osmPois, pois);
  assert.equal(typeof s1.osmFetchStatus.lastAt, 'number');
  assert.equal(s1.osmFetchStatus.lastAt, 123);
  assert.equal(s1.osmFetchStatus.loading, false);
  assert.equal(s1.osmFetchStatus.error, null);
});

test('reducer SET_OSM_ENABLED coerces enabled to boolean', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'SET_OSM_ENABLED', enabled: 'yes' });
  assert.equal(s1.osmEnabled, true);

  const s2 = reducer(s1, { type: 'SET_OSM_ENABLED', enabled: 0 });
  assert.equal(s2.osmEnabled, false);
});

test('reducer OSM_FETCH_SUCCESS guards pois as array', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'OSM_FETCH_SUCCESS', network: null, pois: null, at: 1 });
  assert.deepEqual(s1.osmPois, []);
});

test('reducer OSM_FETCH_ERROR stringifies error', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'OSM_FETCH_ERROR', error: { message: 'Boom' } });
  assert.equal(s1.osmFetchStatus.loading, false);
  assert.equal(typeof s1.osmFetchStatus.error, 'string');
  assert.equal(s1.osmFetchStatus.error, '[object Object]');

  const s2 = reducer(s0, { type: 'OSM_FETCH_ERROR', error: null });
  assert.equal(s2.osmFetchStatus.error, 'Unknown error');
});

test('reducer APPLY_OSM_EDGE_OVERRIDE stores status in osmEdgeOverrides', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'APPLY_OSM_EDGE_OVERRIDE', edgeId: 'E42', status: 'blocked' });
  assert.equal(s1.osmEdgeOverrides.E42, 'blocked');
});
