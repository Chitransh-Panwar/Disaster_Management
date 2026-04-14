import {
  DISASTER_ZONES,
  HELP_CENTERS,
  RESOURCE_MARKERS,
  ROAD_ACTIONS,
} from '../domain/markerRegistry.js';

const GROUPS = [
  ['DISASTER ZONES', 'disasterZone', DISASTER_ZONES],
  ['HELP CENTERS', 'helpCenter', HELP_CENTERS],
  ['RESOURCES', 'resourceMarker', RESOURCE_MARKERS],
  ['ROAD STATUS', 'roadAction', ROAD_ACTIONS],
];

const ALGORITHMS = [
  ['Dijkstra ▶', 'RUN_DIJKSTRA'],
  ["Tarjan's ▶", 'RUN_TARJAN'],
  ['BFS Spread ▶', 'RUN_BFS'],
  ['DSU Check ▶', 'RUN_DSU'],
  ['Knapsack ▶', 'RUN_KNAPSACK'],
  ['Run Mission ▶', 'RUN_MISSION'],
];

function createButton(label, onClick, type = 'button') {
  const btn = document.createElement('button');
  btn.type = type;
  btn.className = 'tool-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderGroup(sectionTitle, kind, registry, store, eventLog) {
  const section = document.createElement('section');
  section.className = 'tool-group';

  const heading = document.createElement('h3');
  heading.className = 'tool-group__title';
  heading.textContent = sectionTitle;
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'tool-group__items';

  Object.entries(registry).forEach(([type, config]) => {
    const label = config?.label ?? type;
    const button = createButton(label, () => {
      store?.dispatch?.({
        type: 'SET_ACTIVE_TOOL',
        tool: { kind, type },
      });
      eventLog?.logEvent?.('tool', `Selected: ${label}`);
    });
    list.appendChild(button);
  });

  section.appendChild(list);
  return section;
}

function renderAlgorithms(store) {
  const section = document.createElement('section');
  section.className = 'tool-group';

  const heading = document.createElement('h3');
  heading.className = 'tool-group__title';
  heading.textContent = 'ALGORITHMS';
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'tool-group__items';

  ALGORITHMS.forEach(([label, actionType]) => {
    list.appendChild(
      createButton(label, () => {
        store?.dispatch?.({ type: actionType });
      })
    );
  });

  list.appendChild(
    createButton('Reset ↺', () => {
      store?.dispatch?.({ type: 'RESET_ALL' });
    })
  );

  section.appendChild(list);
  return section;
}

export function renderLeftTools(targetEl, store, eventLog) {
  if (!targetEl) return;

  targetEl.innerHTML = '';

  GROUPS.forEach(([title, kind, registry]) => {
    targetEl.appendChild(renderGroup(title, kind, registry, store, eventLog));
  });

  targetEl.appendChild(renderAlgorithms(store));

  // Waypoint count display
  const wpInfo = document.createElement('div');
  wpInfo.className = 'tool-group';
  wpInfo.style.padding = '8px';
  wpInfo.style.fontSize = '13px';

  function updateWpInfo() {
    const state = store?.getState?.();
    const wpCount = state?.routeWaypointIds?.length ?? 0;
    const hasStart = state?.routeStartMarkerId != null;
    wpInfo.textContent = `Mission: Start=${hasStart ? '✓' : '—'} | Waypoints: ${wpCount}`;
  }
  updateWpInfo();
  store?.subscribe?.(updateWpInfo);

  targetEl.appendChild(wpInfo);
}
