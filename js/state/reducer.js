export function createInitialState() {
  return {
    activeTool: { kind: 'disasterZone', type: 'flood' },
    activeScenarioId: null,
    markers: [],
    selectedMarkerId: null,
    routeStartMarkerId: null,
    routeGoalMarkerId: null,

    // Multi-waypoint mission planning
    routeWaypointIds: [],
    waypointStatuses: {},   // { [markerId]: 'visited' | 'unvisited' }
    missionResult: null,

    roadNetwork: null,
    edgeOverrides: {},

    // Live OSM layers
    osmEnabled: true,
    osmRoadNetwork: null,
    osmPois: [],
    osmEdgeOverrides: {},
    osmFetchStatus: { loading: false, error: null, lastAt: null },

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
  if (typeof persisted.osmEnabled === 'boolean') {
    out.osmEnabled = persisted.osmEnabled;
  }
  if (persisted.osmEdgeOverrides && typeof persisted.osmEdgeOverrides === 'object') {
    const clean = Object.create(null);
    for (const [k, v] of Object.entries(persisted.osmEdgeOverrides)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (v === 'open' || v === 'partial' || v === 'blocked') clean[k] = v;
    }
    out.osmEdgeOverrides = clean;
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
  if (persisted.routeStartMarkerId === null || typeof persisted.routeStartMarkerId === 'string') {
    out.routeStartMarkerId = persisted.routeStartMarkerId;
  }
  if (persisted.routeGoalMarkerId === null || typeof persisted.routeGoalMarkerId === 'string') {
    out.routeGoalMarkerId = persisted.routeGoalMarkerId;
  }
  if (Array.isArray(persisted.routeWaypointIds)) {
    out.routeWaypointIds = persisted.routeWaypointIds.filter((id) => typeof id === 'string');
  }
  if (persisted.waypointStatuses && typeof persisted.waypointStatuses === 'object') {
    out.waypointStatuses = persisted.waypointStatuses;
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
    case 'SET_ROUTE_START':
      return { ...state, routeStartMarkerId: action.markerId ?? null };
    case 'SET_ROUTE_GOAL':
      return { ...state, routeGoalMarkerId: action.markerId ?? null };
    case 'SET_ROAD_NETWORK':
      return { ...state, roadNetwork: action.network };
    case 'APPLY_EDGE_OVERRIDE': {
      const edgeId = action.edgeId;
      const status = action.status;
      if (typeof edgeId !== 'string' || edgeId.length === 0) return state;
      if (edgeId === '__proto__' || edgeId === 'constructor' || edgeId === 'prototype') return state;
      if (status !== 'open' && status !== 'partial' && status !== 'blocked') return state;
      return {
        ...state,
        edgeOverrides: { ...state.edgeOverrides, [edgeId]: status },
      };
    }
    case 'SET_OSM_ENABLED':
      return { ...state, osmEnabled: Boolean(action.enabled) };
    case 'OSM_FETCH_START':
      return {
        ...state,
        osmFetchStatus: { ...state.osmFetchStatus, loading: true, error: null },
      };
    case 'OSM_FETCH_ERROR':
      return {
        ...state,
        osmFetchStatus: {
          ...state.osmFetchStatus,
          loading: false,
          error: String(action.error ?? 'Unknown error'),
        },
      };
    case 'OSM_FETCH_SUCCESS': {
      const lastAt = Number.isFinite(action.at) ? action.at : Date.now();
      return {
        ...state,
        osmRoadNetwork: action.network,
        osmPois: Array.isArray(action.pois) ? action.pois : [],
        osmFetchStatus: { loading: false, error: null, lastAt },
      };
    }
    case 'APPLY_OSM_EDGE_OVERRIDE': {
      const edgeId = action.edgeId;
      const status = action.status;
      if (typeof edgeId !== 'string' || edgeId.length === 0) return state;
      if (edgeId === '__proto__' || edgeId === 'constructor' || edgeId === 'prototype') return state;
      if (status !== 'open' && status !== 'partial' && status !== 'blocked') return state;
      return {
        ...state,
        osmEdgeOverrides: { ...state.osmEdgeOverrides, [edgeId]: status },
      };
    }
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
        routeStartMarkerId: null,
        routeGoalMarkerId: null,
        routeWaypointIds: [],
        waypointStatuses: {},
        missionResult: null,
      };
    case 'ADD_WAYPOINT': {
      const wId = action.markerId;
      if (typeof wId !== 'string' || wId.length === 0) return state;
      if (state.routeWaypointIds.includes(wId)) return state;
      return { ...state, routeWaypointIds: [...state.routeWaypointIds, wId] };
    }
    case 'REMOVE_WAYPOINT': {
      const rId = action.markerId;
      if (typeof rId !== 'string') return state;
      return { ...state, routeWaypointIds: state.routeWaypointIds.filter((id) => id !== rId) };
    }
    case 'CLEAR_WAYPOINTS':
      return { ...state, routeWaypointIds: [], waypointStatuses: {}, missionResult: null };
    case 'SET_WAYPOINT_STATUSES':
      return { ...state, waypointStatuses: action.statuses ?? {} };
    case 'SET_MISSION_RESULT':
      return { ...state, missionResult: action.result ?? null };
    case 'RUN_DIJKSTRA':
    case 'RUN_DSU':
    case 'RUN_TARJAN':
    case 'RUN_BFS':
    case 'RUN_KNAPSACK':
    case 'RUN_MISSION':
      return state; // handled by effects
    case 'RESET_ALL':
      return {
        ...state,
        markers: [],
        edgeOverrides: {},
        selectedMarkerId: null,
        routeStartMarkerId: null,
        routeGoalMarkerId: null,
        routeWaypointIds: [],
        waypointStatuses: {},
        missionResult: null,
      };
    default:
      return state;
  }
}
