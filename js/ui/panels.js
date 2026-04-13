export function initPanels() {
  const leftToggle = document.getElementById('leftToggle');
  const rightToggle = document.getElementById('rightToggle');
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');

  if (!leftToggle || !rightToggle || !leftPanel || !rightPanel) {
    console.warn('initPanels: missing panel elements.');
    return;
  }

  let leftOpen =
    leftToggle.getAttribute('aria-expanded') === 'true' ||
    leftPanel.classList.contains('open');

  let rightOpen =
    rightToggle.getAttribute('aria-expanded') === 'true' ||
    rightPanel.classList.contains('open');

  function syncPanels() {
    leftPanel.classList.toggle('open', leftOpen);
    rightPanel.classList.toggle('open', rightOpen);

    leftToggle.setAttribute('aria-expanded', String(leftOpen));
    rightToggle.setAttribute('aria-expanded', String(rightOpen));

    leftPanel.setAttribute('aria-hidden', String(!leftOpen));
    rightPanel.setAttribute('aria-hidden', String(!rightOpen));

    if (!leftOpen) leftPanel.setAttribute('inert', '');
    else leftPanel.removeAttribute('inert');

    if (!rightOpen) rightPanel.setAttribute('inert', '');
    else rightPanel.removeAttribute('inert');

    leftToggle.textContent = leftOpen ? 'Close ▶' : '◀ Tools';
    rightToggle.textContent = rightOpen ? '◀ Close' : '▶ Data';
  }

  function selectTab(tabBtn) {
    const tabButtons = rightPanel.querySelectorAll('[role="tab"]');

    tabButtons.forEach((btn) => {
      const isSelected = btn === tabBtn;
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.tabIndex = isSelected ? 0 : -1;

      const panelId = btn.getAttribute('aria-controls');
      const panelEl = panelId ? document.getElementById(panelId) : null;
      if (panelEl) panelEl.hidden = !isSelected;
    });
  }

  const tabButtons = Array.from(rightPanel.querySelectorAll('[role="tab"]'));

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn));
  });

  leftToggle.addEventListener('click', () => {
    leftOpen = !leftOpen;
    syncPanels();
  });

  rightToggle.addEventListener('click', () => {
    rightOpen = !rightOpen;
    syncPanels();
  });

  syncPanels();

  const initiallySelected =
    tabButtons.find((btn) => btn.getAttribute('aria-selected') === 'true') ||
    tabButtons[0];

  if (initiallySelected) selectTab(initiallySelected);
}
