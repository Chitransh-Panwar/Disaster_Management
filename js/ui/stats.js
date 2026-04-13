export function renderStats(targetEl, state) {
  if (!targetEl) return;

  const comps = state?.stats?.components ?? '—';
  const blocked = Object.values(state?.edgeOverrides ?? {}).filter((s) => s === 'blocked').length;
  const markers = Array.isArray(state?.markers) ? state.markers.length : 0;

  targetEl.innerHTML = `
    <div style="display:grid;gap:8px">
      <div style="border:1px solid rgba(255,255,255,0.12);padding:8px">DSU components: <b>${comps}</b></div>
      <div style="border:1px solid rgba(255,255,255,0.12);padding:8px">Blocked edges: <b>${blocked}</b></div>
      <div style="border:1px solid rgba(255,255,255,0.12);padding:8px">Markers: <b>${markers}</b></div>
    </div>
  `;
}
