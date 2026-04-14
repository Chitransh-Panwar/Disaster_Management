function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.appendChild(c);
  return node;
}

export function createDijkstraModal(rootEl) {
  if (!rootEl) {
    throw new Error('Dijkstra modal root element not found');
  }

  let backdrop = null;

  function close() {
    if (!backdrop) return;
    backdrop.remove();
    backdrop = null;
  }

  function open({ title = 'Dijkstra Simulation', subtitle = '', steps = [], totalCost = null } = {}) {
    close();

    const closeBtn = el('button', {
      type: 'button',
      className: 'idrps-modal__close',
      textContent: '✕',
      onclick: close,
    });

    const header = el('div', { className: 'idrps-modal__header' }, [
      el('div', { className: 'idrps-modal__title', textContent: title }),
      closeBtn,
    ]);

    const sub = subtitle
      ? el('div', { className: 'idrps-modal__subtitle', textContent: subtitle })
      : null;

    const body = el('div', { className: 'idrps-modal__body' });

    if (!steps.length) {
      body.appendChild(el('div', { className: 'idrps-modal__muted', textContent: 'No route steps to show.' }));
    } else {
      const list = el('ol', { className: 'idrps-steps' });
      for (const s of steps) {
        const edge = s.edgeId ? ` via ${s.edgeId}` : '';
        const status = s.status ? ` [${s.status}]` : '';
        list.appendChild(
          el('li', {
            className: 'idrps-steps__item',
            textContent: `${s.from} → ${s.to}${edge}${status} (cost ${Math.round(s.cost)}, total ${Math.round(s.cumulativeCost)})`,
          })
        );
      }
      body.appendChild(list);
    }

    if (Number.isFinite(totalCost)) {
      body.appendChild(
        el('div', {
          className: 'idrps-modal__total',
          textContent: `Total cost: ${Math.round(totalCost)}`,
        })
      );
    }

    const cardChildren = [header];
    if (sub) cardChildren.push(sub);
    cardChildren.push(body);

    const card = el('div', { className: 'idrps-modal', role: 'dialog', 'aria-modal': 'true' }, cardChildren);

    backdrop = el('div', { className: 'idrps-modal-backdrop' }, [card]);
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) close();
    });

    window.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === 'Escape') close();
      },
      { once: true }
    );

    rootEl.appendChild(backdrop);
  }

  return { open, close };
}
