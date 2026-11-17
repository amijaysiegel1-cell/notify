// Small DOM + formatting helpers and the icon set.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtTime(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const hh = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ${mins % 60} min`;
}

export const artistNames = (t) => (t?.artists || []).map((a) => a.name).join(', ');

export function bestImage(images, size = 300) {
  if (!images || !images.length) return '';
  const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find((i) => (i.width || 640) >= size) || sorted[sorted.length - 1]).url;
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let toastTimer;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
  t.className = `show ${kind}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}

const P = (d, extra = '') => `<svg viewBox="0 0 24 24" ${extra}>${d}</svg>`;
export const icon = {
  home: P('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  search: P('<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  library: P('<path d="M5 3.5v17M10 3.5v17M15 4l5 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  stats: P('<path d="M4 20V11M10 20V4M16 20v-6M22 20H2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  lyrics: P('<path d="M4 6h16M4 11h11M4 16h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="18" cy="17" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20.5 17V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  settings: P('<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  play: P('<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor"/>'),
  pause: P('<rect x="6" y="4" width="4.2" height="16" rx="1.3" fill="currentColor"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.3" fill="currentColor"/>'),
  next: P('<path d="M3.5 5.6v12.8a1 1 0 0 0 1.6.8l8.4-6.4a1 1 0 0 0 0-1.6L5.1 4.8a1 1 0 0 0-1.6.8zM12.5 5.6v12.8a1 1 0 0 0 1.6.8l8.4-6.4a1 1 0 0 0 0-1.6l-8.4-6.4a1 1 0 0 0-1.6.8z" fill="currentColor"/>'),
  prev: P('<path d="M20.5 5.6v12.8a1 1 0 0 1-1.6.8l-8.4-6.4a1 1 0 0 1 0-1.6l8.4-6.4a1 1 0 0 1 1.6.8zM11.5 5.6v12.8a1 1 0 0 1-1.6.8l-8.4-6.4a1 1 0 0 1 0-1.6l8.4-6.4a1 1 0 0 1 1.6.8z" fill="currentColor"/>'),
  shuffle: P('<path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4c.8-.9 1.8-1.4 3.2-1.4H21M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  repeat: P('<path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  repeatOne: P('<path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="14.6" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" font-family="sans-serif">1</text>'),
  volume: P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  mute: P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  queue: P('<path d="M4 6h12M4 11h12M4 16h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M15 14.5v6l5-3z" fill="currentColor"/>'),
  devices: P('<rect x="3" y="4" width="13" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.5 18h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="17.5" y="8" width="4" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
  heart: P('<path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 3.8 4.5 6.9 4.5c2 0 3.4 1.1 5.1 3 1.7-1.9 3.1-3 5.1-3 3.1 0 5.3 2.8 4.1 6.2C19.5 15.4 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  heartFill: P('<path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 3.8 4.5 6.9 4.5c2 0 3.4 1.1 5.1 3 1.7-1.9 3.1-3 5.1-3 3.1 0 5.3 2.8 4.1 6.2C19.5 15.4 12 20 12 20z" fill="currentColor"/>'),
  mini: P('<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="11.5" y="11.5" width="7" height="5" rx="1" fill="currentColor"/>'),
  expand: P('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  down: P('<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  back: P('<path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  close: P('<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  minWin: P('<path d="M6 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  maxWin: P('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  pin: P('<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>'),
  plus: P('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  clock: P('<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  music: P('<path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
  spark: P('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/>'),
  get logo() {
    const id = 'lg' + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="0 0 64 64"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-2)"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#${id})"/><path d="M20 44V20l24 24V20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
};

export function placeholderArt(seed = 'x') {
  let n = 0; for (const c of String(seed)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  const h1 = n % 360, h2 = (h1 + 40 + (n % 80)) % 360;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},55%,45%)"/><stop offset="1" stop-color="hsl(${h2},60%,25%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><path d="M42 66V36l22-5v30" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="4" stroke-linejoin="round"/><circle cx="37" cy="66" r="6" fill="rgba(255,255,255,.55)"/><circle cx="59" cy="61" r="6" fill="rgba(255,255,255,.55)"/></svg>`);
}
