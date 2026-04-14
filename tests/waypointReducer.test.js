import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reducer, sanitizePersistedState } from '../js/state/reducer.js';

test('createInitialState includes waypoint fields', () => {
  const s0 = createInitialState();
  assert.deepEqual(s0.routeWaypointIds, []);
  assert.deepEqual(s0.waypointStatuses, {});
  assert.equal(s0.missionResult, null);
});

test('reducer ADD_WAYPOINT adds marker id to routeWaypointIds', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'ADD_WAYPOINT', markerId: 'wp-1' });
  assert.deepEqual(s1.routeWaypointIds, ['wp-1']);
});

test('reducer ADD_WAYPOINT prevents duplicates', () => {
  let s = createInitialState();
  s = reducer(s, { type: 'ADD_WAYPOINT', markerId: 'wp-1' });
  s = reducer(s, { type: 'ADD_WAYPOINT', markerId: 'wp-1' });
  assert.deepEqual(s.routeWaypointIds, ['wp-1']);
});

test('reducer ADD_WAYPOINT ignores non-string markerId', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'ADD_WAYPOINT', markerId: 123 });
  assert.equal(s1, s0);
});

test('reducer REMOVE_WAYPOINT removes marker id', () => {
  let s = createInitialState();
  s = reducer(s, { type: 'ADD_WAYPOINT', markerId: 'wp-1' });
  s = reducer(s, { type: 'ADD_WAYPOINT', markerId: 'wp-2' });
  s = reducer(s, { type: 'REMOVE_WAYPOINT', markerId: 'wp-1' });
  assert.deepEqual(s.routeWaypointIds, ['wp-2']);
});

test('reducer CLEAR_WAYPOINTS resets waypoint state', () => {
  let s = createInitialState();
  s = reducer(s, { type: 'ADD_WAYPOINT', markerId: 'wp-1' });
  s = reducer(s, { type: 'SET_WAYPOINT_STATUSES', statuses: { 'wp-1': 'visited' } });
  s = reducer(s, { type: 'SET_MISSION_RESULT', result: { aborted: false } });
  s = reducer(s, { type: 'CLEAR_WAYPOINTS' });
  assert.deepEqual(s.routeWaypointIds, []);
  assert.deepEqual(s.waypointStatuses, {});
  assert.equal(s.missionResult, null);
});

test('reducer SET_WAYPOINT_STATUSES stores statuses', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'SET_WAYPOINT_STATUSES', statuses: { a: 'visited', b: 'unvisited' } });
  assert.deepEqual(s1.waypointStatuses, { a: 'visited', b: 'unvisited' });
});

test('reducer SET_MISSION_RESULT stores result', () => {
  const s0 = createInitialState();
  const result = { aborted: false, totalDistanceKm: 50 };
  const s1 = reducer(s0, { type: 'SET_MISSION_RESULT', result });
  assert.deepEqual(s1.missionResult, result);
});

test('reducer RESET_ALL clears waypoint fields', () => {
  let s = createInitialState();
  s = reducer(s, { type: 'ADD_WAYPOINT', markerId: 'wp-1' });
  s = reducer(s, { type: 'SET_MISSION_RESULT', result: { aborted: true } });
  s = reducer(s, { type: 'RESET_ALL' });
  assert.deepEqual(s.routeWaypointIds, []);
  assert.deepEqual(s.waypointStatuses, {});
  assert.equal(s.missionResult, null);
});

test('reducer LOAD_SCENARIO clears waypoint fields', () => {
  let s = createInitialState();
  s = reducer(s, { type: 'ADD_WAYPOINT', markerId: 'wp-1' });
  s = reducer(s, { type: 'LOAD_SCENARIO', scenarioId: 's1', markers: [], edgeOverrides: {} });
  assert.deepEqual(s.routeWaypointIds, []);
  assert.deepEqual(s.waypointStatuses, {});
  assert.equal(s.missionResult, null);
});

test('reducer RUN_MISSION returns state unchanged (handled by effects)', () => {
  const s0 = createInitialState();
  const s1 = reducer(s0, { type: 'RUN_MISSION' });
  assert.equal(s1, s0);
});

test('sanitizePersistedState preserves routeWaypointIds', () => {
  const out = sanitizePersistedState({
    routeWaypointIds: ['a', 'b'],
  });
  assert.deepEqual(out.routeWaypointIds, ['a', 'b']);
});

test('sanitizePersistedState filters non-string waypoint ids', () => {
  const out = sanitizePersistedState({
    routeWaypointIds: ['a', 123, null, 'b'],
  });
  assert.deepEqual(out.routeWaypointIds, ['a', 'b']);
});
