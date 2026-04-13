export function createEventLog(targetEl) {
  const entries = [];
  const MAX_ENTRIES = 200;

  function logEvent(type, message, meta = {}) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const time = `${hh}:${mm}:${ss}`;

    const entry = { time, type, message, meta };
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

    const row = document.createElement('div');
    row.textContent = `[${time}] ${type}: ${message}`;

    if (targetEl && typeof targetEl.prepend === 'function') {
      targetEl.prepend(row);

      while (targetEl.childElementCount > MAX_ENTRIES) {
        targetEl.lastElementChild?.remove();
      }
    }
  }

  return { logEvent, entries };
}
