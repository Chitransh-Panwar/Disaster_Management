import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMission } from '../js/algo/missionSim.js';

test('simulateMission completes when fuel is sufficient', () => {
  const segments = [
    { path: ['A', 'B'], distanceKm: 10, waypointIdx: 0 },
    { path: ['B', 'C'], distanceKm: 15, waypointIdx: 1 },
  ];
  const result = simulateMission(segments, 100, 50, null);
  assert.equal(result.aborted, false);
  assert.equal(result.totalDistanceKm, 25);
  assert.equal(result.etaHours, 0.5); // 25/50
  assert.deepEqual(result.visitedWaypointIndices, [0, 1]);
  assert.deepEqual(result.unvisitedWaypointIndices, []);
  assert.equal(result.returnPath, null);
});

test('simulateMission aborts when fuel runs out', () => {
  const segments = [
    { path: ['A', 'B'], distanceKm: 10, waypointIdx: 0 },
    { path: ['B', 'C'], distanceKm: 20, waypointIdx: 1 },
    { path: ['C', 'D'], distanceKm: 30, waypointIdx: 2 },
  ];

  const mockDijkstra = (start, goal) => {
    // Return path from B back to A
    if (start === 'B' && goal === 'A') {
      return { distance: 10, path: ['B', 'A'] };
    }
    return { distance: Infinity, path: [] };
  };

  // Fuel = 25 km, enough for leg 0 (10km) but not leg 1 (20km with 15km remaining)
  const result = simulateMission(segments, 25, 60, mockDijkstra);
  assert.equal(result.aborted, true);
  assert.deepEqual(result.visitedWaypointIndices, [0]);
  assert.deepEqual(result.unvisitedWaypointIndices, [1, 2]);
  assert.equal(result.abortNodeId, 'B');
  assert.deepEqual(result.returnPath, ['B', 'A']);
  assert.equal(result.returnDistanceKm, 10);
  assert.equal(result.totalDistanceKm, 20); // 10 traveled + 10 return
});

test('simulateMission aborts on first segment if fuel < first leg', () => {
  const segments = [
    { path: ['A', 'B'], distanceKm: 50, waypointIdx: 0 },
  ];
  const mockDijkstra = () => ({ distance: Infinity, path: [] });

  const result = simulateMission(segments, 10, 40, mockDijkstra);
  assert.equal(result.aborted, true);
  assert.deepEqual(result.visitedWaypointIndices, []);
  assert.deepEqual(result.unvisitedWaypointIndices, [0]);
  assert.equal(result.abortNodeId, 'A');
});

test('simulateMission handles zero speed gracefully', () => {
  const segments = [
    { path: ['A', 'B'], distanceKm: 10, waypointIdx: 0 },
  ];
  const result = simulateMission(segments, 100, 0, null);
  assert.equal(result.aborted, false);
  assert.equal(result.etaHours, Infinity);
});
