import { validateResourceDraft } from '../domain/resources.js';

const RESOURCE_TYPES = [
  'Rescue Helicopter',
  'Air Force Transport',
  'Surveillance Drone',
  'Supply Drop Drone',
  'NDRF Team (10 members)',
  'Army Unit',
  'Police Force',
  'Civil Volunteers',
  'Search & Rescue Dog Unit',
  'Motorboat',
  'Inflatable Raft',
  'Navy Ship',
  'Coast Guard Vessel',
  'Amphibious Vehicle',
  'Mobile Hospital',
  'Ambulance',
  'Medical Supply Kit',
  'Blood Bank Unit',
  'Trauma Team',
  'Food Package (500 meals)',
  'Drinking Water (1000L)',
  'Tent Kit (50 persons)',
  'Generator',
  'Blanket Pack',
  'Earth Mover',
  'Crane',
  'Temporary Bridge Kit',
  'Communication Tower',
  'Flood Pump',
];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.appendChild(c);
  return node;
}

function numVal(input) {
  const n = Number.parseInt(String(input?.value ?? ''), 10);
  return Number.isFinite(n) ? n : NaN;
}

function clearErrors(errBox) {
  if (!errBox) return;
  errBox.textContent = '';
  errBox.hidden = true;
}

function setErrors(errBox, errors) {
  if (!errBox) return;
  if (!errors.length) return clearErrors(errBox);
  errBox.hidden = false;
  errBox.innerHTML = `<ul style="margin:0;padding-left:18px">${errors
    .map((e) => `<li>${e}</li>`)
    .join('')}</ul>`;
}

export function initResourceTab(targetEl, { map, store, eventLog }) {
  if (!targetEl || !store) return;

  const draft = { baseLat: null, baseLng: null };
  let restoreTool = null;

  const budgetInput = el('input', { type: 'number', min: '0', step: '1', className: 'rf-input' });

  const typeSel = el('select', { className: 'rf-input' });
  typeSel.appendChild(el('option', { value: '', textContent: 'Select from dropdown…' }));
  for (const t of RESOURCE_TYPES) {
    typeSel.appendChild(el('option', { value: t, textContent: t }));
  }

  const nameInput = el('input', { type: 'text', placeholder: 'e.g. IAF Mi-17 Helicopter', className: 'rf-input' });
  const qtyInput = el('input', { type: 'number', min: '1', max: '9999', step: '1', className: 'rf-input' });
  const capInput = el('input', { type: 'number', min: '1', step: '1', className: 'rf-input' });
  const costInput = el('input', { type: 'number', min: '1', step: '1', className: 'rf-input' });
  const rangeInput = el('input', { type: 'number', min: '0', step: '1', className: 'rf-input' });

  const locLabel = el('div', { className: 'rf-muted', textContent: 'Base Location: not set' });
  const pickBtn = el('button', { type: 'button', className: 'rf-btn', textContent: 'Click map to pin location…' });

  const statusAvail = el('input', { type: 'radio', name: 'rf_status', value: 'available' });
  const statusDepl = el('input', { type: 'radio', name: 'rf_status', value: 'deployed' });
  const statusStand = el('input', { type: 'radio', name: 'rf_status', value: 'standby' });

  const notesInput = el('textarea', { className: 'rf-input', rows: 3, placeholder: 'Any additional information…' });

  const errBox = el('div', { className: 'rf-errors', hidden: true });

  const addBtn = el('button', { type: 'button', className: 'rf-btn rf-btn--primary', textContent: '+ Add Resource' });
  const clearBtn = el('button', { type: 'button', className: 'rf-btn', textContent: 'Clear Form' });
  const optimizeBtn = el('button', { type: 'button', className: 'rf-btn rf-btn--accent', textContent: 'Optimize (Knapsack) ▶' });

  const listBox = el('div');
  const resultBox = el('div');

  function currentStatus() {
    const checked = targetEl.querySelector('input[name="rf_status"]:checked');
    return checked ? checked.value : null;
  }

  function clearForm() {
    typeSel.value = '';
    nameInput.value = '';
    qtyInput.value = '';
    capInput.value = '';
    costInput.value = '';
    rangeInput.value = '';
    statusAvail.checked = false;
    statusDepl.checked = false;
    statusStand.checked = false;
    notesInput.value = '';
    draft.baseLat = null;
    draft.baseLng = null;
    locLabel.textContent = 'Base Location: not set';
    clearErrors(errBox);
  }

  function render() {
    const state = store.getState();
    const resources = Array.isArray(state.resources) ? state.resources : [];

    budgetInput.value = String(state.resourceBudget ?? 0);

    const chosen = state.knapsackResult?.chosen ?? null;
    const maxValue = state.knapsackResult?.maxValue;
    const usedWeight = state.knapsackResult?.usedWeight;
    const budget = state.knapsackResult?.budget;

    resultBox.innerHTML = '';
    if (state.knapsackResult) {
      resultBox.appendChild(
        el('div', {
          className: 'rf-card',
          innerHTML: `Knapsack result: <b>${maxValue ?? '—'}</b> survivors capacity (cost ${usedWeight ?? '—'} / ${budget ?? '—'})`,
        })
      );
    }

    listBox.innerHTML = '';
    if (!resources.length) {
      listBox.appendChild(el('div', { className: 'rf-muted', textContent: 'No resources added yet.' }));
      return;
    }

    for (const r of resources) {
      const count = chosen && r?.id ? chosen[r.id] : null;
      const isChosen = Number.isInteger(count) && count > 0;

      const row = el('div', { className: `rf-row${isChosen ? ' rf-row--chosen' : ''}` });
      row.appendChild(
        el('div', {
          className: 'rf-row__main',
          innerHTML: `<div><b>${r.resourceName ?? r.id}</b> <span class="rf-muted">(${r.resourceType ?? ''})</span></div>
<div class="rf-muted">qty=${r.quantity ?? '—'}, cap=${r.capacityPerUnit ?? '—'}, cost=${r.costPerUnit ?? '—'}, status=${r.status ?? '—'}</div>
${isChosen ? `<div class="rf-chip">Chosen: ${count}</div>` : ''}`,
        })
      );

      const del = el('button', { type: 'button', className: 'rf-btn rf-btn--danger', textContent: 'Remove' });
      del.addEventListener('click', () => {
        store.dispatch({ type: 'REMOVE_RESOURCE', resourceId: r.id });
        eventLog?.logEvent?.('resource', `Removed resource: ${r.resourceName ?? r.id}`);
      });

      row.appendChild(el('div', { className: 'rf-row__actions' }, [del]));
      listBox.appendChild(row);
    }
  }

  budgetInput.addEventListener('change', () => {
    const b = numVal(budgetInput);
    store.dispatch({ type: 'SET_RESOURCE_BUDGET', budget: Number.isFinite(b) && b >= 0 ? b : 0 });
  });

  pickBtn.addEventListener('click', () => {
    if (!map) {
      eventLog?.logEvent?.('resource', 'Map not ready');
      return;
    }

    const currentTool = store.getState().activeTool;
    restoreTool = currentTool;
    store.dispatch({ type: 'SET_ACTIVE_TOOL', tool: { kind: '', type: '' } });
    eventLog?.logEvent?.('hint', 'Click on the map to set resource base location');

    map.once('click', (ev) => {
      draft.baseLat = ev.latlng.lat;
      draft.baseLng = ev.latlng.lng;
      locLabel.textContent = `Base Location: ${draft.baseLat.toFixed(4)}, ${draft.baseLng.toFixed(4)}`;
      if (restoreTool) store.dispatch({ type: 'SET_ACTIVE_TOOL', tool: restoreTool });
      restoreTool = null;
    });
  });

  clearBtn.addEventListener('click', clearForm);

  addBtn.addEventListener('click', () => {
    const d = {
      resourceType: typeSel.value,
      resourceName: nameInput.value,
      quantity: numVal(qtyInput),
      capacityPerUnit: numVal(capInput),
      costPerUnit: numVal(costInput),
      baseLat: draft.baseLat,
      baseLng: draft.baseLng,
      rangeKm: Number.isFinite(numVal(rangeInput)) ? numVal(rangeInput) : null,
      status: currentStatus(),
      notes: notesInput.value ?? '',
    };

    const errors = validateResourceDraft(d);
    if (errors.length) {
      setErrors(errBox, errors);
      return;
    }

    clearErrors(errBox);

    const id = `res-${Date.now()}`;
    store.dispatch({ type: 'ADD_RESOURCE', resource: { id, ...d } });
    eventLog?.logEvent?.('resource', `Added resource: ${d.resourceName} (${d.resourceType})`);
    clearForm();
  });

  optimizeBtn.addEventListener('click', () => {
    store.dispatch({ type: 'RUN_KNAPSACK' });
  });

  targetEl.innerHTML = '';

  targetEl.appendChild(
    el('div', {
      className: 'rf-card',
      innerHTML:
        '<b>Resource Input Form</b><div class="rf-muted">Adds items for Knapsack DP (weight=cost, value=capacity).</div>',
    })
  );

  targetEl.appendChild(
    el('div', { className: 'rf-grid' }, [
      el('label', { className: 'rf-label', textContent: 'Budget (cost points)*' }),
      budgetInput,

      el('label', { className: 'rf-label', textContent: 'Resource Type*' }),
      typeSel,

      el('label', { className: 'rf-label', textContent: 'Resource Name*' }),
      nameInput,

      el('label', { className: 'rf-label', textContent: 'Quantity*' }),
      qtyInput,

      el('label', { className: 'rf-label', textContent: 'Capacity per Unit (people)*' }),
      capInput,

      el('label', { className: 'rf-label', textContent: 'Cost per Unit (points)*' }),
      costInput,

      el('label', { className: 'rf-label', textContent: 'Fuel / Range (km)' }),
      rangeInput,

      el('label', { className: 'rf-label', textContent: 'Base Location*' }),
      el('div', {}, [locLabel, pickBtn]),

      el('label', { className: 'rf-label', textContent: 'Status*' }),
      el('div', { className: 'rf-radio' }, [
        el('label', { className: 'rf-muted' }, [statusAvail, document.createTextNode(' Available')]),
        el('label', { className: 'rf-muted' }, [statusDepl, document.createTextNode(' Deployed')]),
        el('label', { className: 'rf-muted' }, [statusStand, document.createTextNode(' Standby')]),
      ]),

      el('label', { className: 'rf-label', textContent: 'Notes' }),
      notesInput,
    ])
  );

  targetEl.appendChild(errBox);

  targetEl.appendChild(el('div', { className: 'rf-actions' }, [addBtn, clearBtn, optimizeBtn]));
  targetEl.appendChild(resultBox);
  targetEl.appendChild(el('h3', { style: 'margin:12px 0 6px', textContent: 'Resources' }));
  targetEl.appendChild(listBox);

  store.subscribe(render);
  render();
}
