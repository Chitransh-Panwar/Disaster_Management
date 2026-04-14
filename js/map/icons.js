export function emojiIcon(emoji, bg = '#122443', { highlight = false } = {}) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available. Ensure leaflet.js is loaded before creating icons.');
  }

  const className = highlight ? 'idrps-icon idrps-icon--highlight' : 'idrps-icon';

  return L.divIcon({
    className,
    html: `<div style="width:28px;height:28px;border-radius:14px;background:${bg};display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.2)">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
