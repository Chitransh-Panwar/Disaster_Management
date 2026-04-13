export function createInitialState() {
  return {
    activeTool: { kind: 'disasterZone', type: 'flood' },
    activeScenarioId: null,
    markers: [],
    selectedMarkerId: null,
    roadNetwork: null,
    edgeOverrides: {},
    bridgeEdgeIds: [],
    stats: { components: null },
    resources: [],
    resourceBudget: 100,
    knapsackResult: null,
  };
}

export function sanitizePersistedState(persisted) {
  if (!persisted || typeof persisted !== 'object') return null;

  /** @type {Record<string, any>} */
  const out = {};
  if (persisted.activeScenarioId === null || typeof persisted.activeScenarioId === 'string') {
    out.activeScenarioId = persisted.activeScenarioId;
  }
  if (persisted.activeTool && typeof persisted.activeTool === 'object') {
    out.activeTool = persisted.activeTool;
  }
  if (Array.isArray(persisted.markers)) {
    out.markers = persisted.markers;
  }
  if (persisted.edgeOverrides && typeof persisted.edgeOverrides === 'object') {
    const clean = Object.create(null);
    for (const [k, v] of Object.entries(persisted.edgeOverrides)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (v === 'open' || v === 'partial' || v === 'blocked') clean[k] = v;
    }
    out.edgeOverrides = clean;
  }
  if (persisted.bridgeEdgeIds && Array.isArray(persisted.bridgeEdgeIds)) {
    out.bridgeEdgeIds = persisted.bridgeEdgeIds;
  }
  if (persisted.stats && typeof persisted.stats === 'object') {
    out.stats = persisted.stats;
  }
  if (Array.isArray(persisted.resources)) {
    out.resources = persisted.resources;
  }
  if (Number.isInteger(persisted.resourceBudget) && persisted.resourceBudget >= 0) {
    out.resourceBudget = persisted.resourceBudget;
  }
  if (persisted.knapsackResult && typeof persisted.knapsackResult === 'object') {
    out.knapsackResult = persisted.knapsackResult;
  }
  return out;
}

export function reducer(state, action) {
  if (!state) return createInitialState();

  switch (action.type) {
    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.tool };
    case 'ADD_MARKER':
      return { ...state, markers: [...state.markers, action.marker] };
    case 'SET_SELECTED_MARKER':
      return { ...state, selectedMarkerId: action.markerId };
    case 'SET_ROAD_NETWORK':
      return { ...state, roadNetwork: action.network };
    case 'APPLY_EDGE_OVERRIDE':
      return {
        ...state,
        edgeOverrides: { ...state.edgeOverrides, [action.edgeId]: action.status },
      };
    case 'SET_STATS':
      return { ...state, stats: { ...state.stats, ...action.stats } };
    case 'SET_BRIDGES':
      return { ...state, bridgeEdgeIds: action.edgeIds };
    case 'SET_RESOURCE_BUDGET':
      return { ...state, resourceBudget: action.budget };
    case 'ADD_RESOURCE':
      return { ...state, resources: [...state.resources, action.resource] };
    case 'REMOVE_RESOURCE':
      return { ...state, resources: state.resources.filter((r) => r.id !== action.resourceId) };
    case 'SET_KNAPSACK_RESULT':
      return { ...state, knapsackResult: action.result };
    case 'LOAD_SCENARIO':
      return {
        ...state,
        activeScenarioId: action.scenarioId,
        markers: action.markers,
        edgeOverrides: action.edgeOverrides,
        selectedMarkerId: null,
      };
    case 'RUN_DIJKSTRA':
    case 'RUN_DSU':
    case 'RUN_TARJAN':
    case 'RUN_BFS':
    case 'RUN_KNAPSACK':
      return state; // handled by effects
    case 'RESET_ALL':
      return {
        ...state,
        markers: [],
        edgeOverrides: {},
        selectedMarkerId: null,
      };
    default:
      return state;
  }
}
