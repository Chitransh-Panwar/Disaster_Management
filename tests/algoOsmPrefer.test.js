import test from 'node:test';
import assert from 'node:assert/strict';
import * as roads from '../js/domain/roads.js';

test('getAlgorithmNetwork prefers OSM network when enabled and loaded', () => {
  assert.equal(typeof roads.getAlgorithmNetwork, 'function');

  const base = {
    nodes: [
      { id: 'A', lat: 0, lng: 0 },
      { id: 'B', lat: 0, lng: 1 },
    ],
    edges: [{ id: 'E1', from: 'A', to: 'B', km: 2, status: 'open' }],
  };

  const osm = {
    nodes: [
      { id: 'OA', lat: 10, lng: 10 },
      { id: 'OB', lat: 10, lng: 11 },
    ],
    edges: [{ id: 'OE1', from: 'OA', to: 'OB', km: 1, status: 'open' }],
  };

  const state = {
    roadNetwork: base,
    edgeOverrides: { E1: 'blocked' },
    osmEnabled: true,
    osmRoadNetwork: osm,
    osmEdgeOverrides: { OE1: 'partial' },
  };

  const net = roads.getAlgorithmNetwork(state);
  assert.equal(net.edges[0].id, 'OE1');
  assert.equal(net.edges[0].status, 'partial');
});

test('getAlgorithmNetwork falls back to base network when OSM network is missing/empty', () => {
  assert.equal(typeof roads.getAlgorithmNetwork, 'function');

  const base = {
    nodes: [
      { id: 'A', lat: 0, lng: 0 },
      { id: 'B', lat: 0, lng: 1 },
    ],
    edges: [{ id: 'E1', from: 'A', to: 'B', km: 2, status: 'open' }],
  };

  const state = {
    roadNetwork: base,
    edgeOverrides: { E1: 'blocked' },
    osmEnabled: true,
    osmRoadNetwork: { nodes: [], edges: [] },
    osmEdgeOverrides: { E1: 'open' },
  };

  const net = roads.getAlgorithmNetwork(state);
  assert.equal(net.edges[0].id, 'E1');
  assert.equal(net.edges[0].status, 'blocked');
});
