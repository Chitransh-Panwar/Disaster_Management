import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRoadComponents, pointInPolygon, pointInCircle, pointInAnyDisasterArea, filterNetworkToDisasterAreas } from '../js/domain/connectivity.js';

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

test('pointInPolygon returns true for point inside polygon', () => {
  const polygon = [[0, 0], [0, 10], [10, 10], [10, 0]];
  assert.equal(pointInPolygon(5, 5, polygon), true);
});

test('pointInPolygon returns false for point outside polygon', () => {
  const polygon = [[0, 0], [0, 10], [10, 10], [10, 0]];
  assert.equal(pointInPolygon(15, 15, polygon), false);
});

test('pointInPolygon returns false for degenerate polygon', () => {
  assert.equal(pointInPolygon(5, 5, [[0, 0], [1, 1]]), false);
  assert.equal(pointInPolygon(5, 5, null), false);
});

test('pointInCircle returns true for point inside circle', () => {
  assert.equal(pointInCircle(28.6, 77.2, 28.6, 77.2, 10), true);
  assert.equal(pointInCircle(28.65, 77.25, 28.6, 77.2, 10), true);
});

test('pointInCircle returns false for point far outside circle', () => {
  assert.equal(pointInCircle(30.0, 77.2, 28.6, 77.2, 10), false);
});

test('pointInAnyDisasterArea with polygon disaster area', () => {
  const markers = [{
    kind: 'disasterZone',
    type: 'flood',
    lat: 5,
    lng: 5,
    polygon: [[0, 0], [0, 10], [10, 10], [10, 0]],
    fields: {},
  }];
  assert.equal(pointInAnyDisasterArea(5, 5, markers), true);
  assert.equal(pointInAnyDisasterArea(15, 15, markers), false);
});

test('pointInAnyDisasterArea with circle disaster area', () => {
  const markers = [{
    kind: 'disasterZone',
    type: 'flood',
    lat: 28.6,
    lng: 77.2,
    fields: {},
  }];
  // flood has defaultRadiusKm=10; a nearby point should be inside
  assert.equal(pointInAnyDisasterArea(28.6, 77.2, markers), true);
  // a far-away point should be outside
  assert.equal(pointInAnyDisasterArea(40.0, 77.2, markers), false);
});

test('filterNetworkToDisasterAreas returns null if no disaster markers', () => {
  const net = { nodes: [{ id: 'A', lat: 5, lng: 5 }], edges: [] };
  const result = filterNetworkToDisasterAreas(net, []);
  assert.equal(result.network, null);
  assert.ok(result.message.includes('No disaster areas'));
});

test('filterNetworkToDisasterAreas filters nodes to disaster zone', () => {
  const net = {
    nodes: [
      { id: 'A', lat: 5, lng: 5 },
      { id: 'B', lat: 50, lng: 50 },
      { id: 'C', lat: 7, lng: 7 },
    ],
    edges: [
      { id: 'E1', from: 'A', to: 'C', status: 'open', km: 1 },
      { id: 'E2', from: 'A', to: 'B', status: 'open', km: 1 },
    ],
  };
  const markers = [{
    kind: 'disasterZone',
    type: 'flood',
    lat: 5,
    lng: 5,
    polygon: [[0, 0], [0, 10], [10, 10], [10, 0]],
    fields: {},
  }];

  const result = filterNetworkToDisasterAreas(net, markers);
  assert.ok(result.network);
  assert.equal(result.message, null);
  // Only A and C should remain (B is at 50,50 which is outside polygon)
  assert.equal(result.network.nodes.length, 2);
  assert.deepEqual(result.network.nodes.map((n) => n.id).sort(), ['A', 'C']);
  // Only E1 should remain (E2 connects to B which is outside)
  assert.equal(result.network.edges.length, 1);
  assert.equal(result.network.edges[0].id, 'E1');
});
