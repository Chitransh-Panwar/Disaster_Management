const KEY = 'idrps:v2:state';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    const minimal = {
      markers: state.markers,
      edgeOverrides: state.edgeOverrides,
      activeScenarioId: state.activeScenarioId,
      activeTool: state.activeTool,
      resources: state.resources,
      resourceBudget: state.resourceBudget,
      osmEnabled: state.osmEnabled,
      osmEdgeOverrides: state.osmEdgeOverrides,
    };
    localStorage.setItem(KEY, JSON.stringify(minimal));
  } catch {
    // Persistence should never crash the app (quota / private mode / disabled storage).
  }
}
