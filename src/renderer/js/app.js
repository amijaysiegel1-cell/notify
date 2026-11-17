// Notify — renderer entry point: app shell, player engine, now playing, settings.

import { bridge, isDesktop } from './bridge.js';
import { $, h, icon, fmtTime, artistNames, bestImage, placeholderArt, toast } from './ui.js';
import { SpotifyProvider } from './api.js';
import { DemoProvider, demoHistory } from './demo.js';
import { LyricsView } from './lyrics.js';
import { FluidBackground, LivingArtwork, extractPalette } from './artwork.js';
import { settings, loadSettings, setSetting, onSettings, resetSettings, setAlbumPalette, DEFAULTS } from './settings.js';
import { History, renderStats } from './stats.js';
import { renderHome, renderSearch, renderLibrary, renderCollection, renderArtist } from './views.js';

let provider = null;
const history = new History();
const player = { state: null, at: 0, pending: 0, trackKey: null, liked: false, volume: 50, muted: false, preMute: 50 };

// ---------- position interpolation ----------
function pos() {
  const s = player.state;
  if (!s?.track) return 0;
  const p = s.progress_ms + (s.is_playing ? performance.now() - player.at : 0);
  return Math.min(p, s.track.duration_ms || p);
}
const getState = () => (player.state ? { ...player.state, progress_ms: pos() } : null);

// ---------- routing ----------
const nav = { stack: [], idx: -1 };
function open(view, id, push = true) {
  if (push) { nav.stack = nav.stack.slice(0, nav.idx + 1); nav.stack.push({ view, id }); nav.idx = nav.stack.length - 1; }
  const root = $('#view');
  root.scrollTop = 0;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  document.querySelectorAll('.side-pl').forEach((b) => b.classList.toggle('on', view === 'playlist' && b.dataset.id === id));
  const ctx = { provider, open, play, state: getState };
  root.classList.remove('enter'); void root.offsetWidth; root.classList.add('enter');
  switch (view) {
    case 'home': return renderHome(root, ctx);
    case 'search': return renderSearch(root, ctx);
    case 'library': return renderLibrary(root, ctx);
    case 'stats': return renderStats(root, { provider, history, open });
    case 'settings': return renderSettings(root);
    case 'liked': return renderCollection(root, ctx, 'liked');
    case 'playlist': case 'album': return renderCollection(root, ctx, view, id);
    case 'artist': return renderArtist(root, ctx, id);
  }
}
function go(delta) {
  const n = nav.idx + delta;
  if (n < 0 || n >= nav.stack.length) return;
  nav.idx = n; const r = nav.stack[n]; open(r.view, r.id, false);
}

// ---------- playback actions ----------
async function act(fn, optimistic) {
  if (optimistic && player.state) { optimistic(player.state); player.at = performance.now(); renderPlayer(); }
  player.pending = performance.now();
  try { await fn(); } catch (e) { toast(e.message || 'Something went wrong', 'err'); }
  setTimeout(poll, provider?.kind === 'demo' ? 50 : 450);
}
async function play(opts) { return act(() => provider.play(opts)); }
const togglePlay = () => {
  if (!player.state) return act(() => provider.resume());
  const playing = player.state.is_playing;
  const p = pos();
  return act(() => (playing ? provider.pause() : provider.resume()), (s) => { s.progress_ms = p; s.is_playing = !playing; });
};
const next = () => act(() => provider.next());
const prev = () => act(() => (pos() > 4000 ? provider.seek(0) : provider.prev()), (s) => { if (pos() > 4000) s.progress_ms = 0; });
const seek = (ms) => act(() => provider.seek(ms), (s) => { s.progress_ms = ms; });
const toggleShuffle = () => { const v = !player.state?.shuffle; act(() => provider.setShuffle(v), (s) => { s.progress_ms = pos(); s.shuffle = v; }); };
const cycleRepeat = () => {
  const order = ['off', 'context', 'track'];
  const v = order[(order.indexOf(player.state?.repeat || 'off') + 1) % 3];
  act(() => provider.setRepeat(v), (s) => { s.progress_ms = pos(); s.repeat = v; });
};
let volT;
function setVolume(v, commit = true) {
  player.volume = Math.round(Math.max(0, Math.min(100, v)));
  if (player.state) player.state.volume = player.volume;
  renderVolume();
  clearTimeout(volT);
  if (commit) volT = setTimeout(() => { player.pending = performance.now(); provider.setVolume(player.volume).catch((e) => toast(e.message, 'err')); }, 180);
}
async function toggleLike() {
  const t = player.state?.track; if (!t) return;
  const was = player.liked; player.liked = !was; renderLike();
  try { was ? await provider.unsave(t) : await provider.save(t); toast(was ? 'Removed from Liked Songs' : 'Added to Liked Songs'); }
  catch (e) { player.liked = was; renderLike(); toast(e.message, 'err'); }
}

// ---------- polling ----------
let pollT, polling = false;
async function poll() {
  clearTimeout(pollT);
  if (!provider || polling) return schedule();
  polling = true;
  const started = performance.now();
  try {
    const s = await provider.getState();
    if (started >= player.pending) {
      player.state = s; player.at = performance.now();
      if (s && typeof s.volume === 'number' && performance.now() - player.pending > 1500) player.volume = s.volume;
      onState();
    }
  } catch (e) {
    if (e.status === 401) { toast('Your Spotify session expired — please sign in again.', 'err'); signOut(); }
  } finally { polling = false; schedule(); }
}
function schedule() {
  clearTimeout(pollT);
  const ms = provider?.kind === 'demo' ? 600 : document.hidden ? 6000 : player.state?.is_playing ? 1500 : 3500;
  pollT = setTimeout(poll, ms);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

async function onState() {
  const s = player.state;
  const t = s?.track;
  const key = t ? (t.id || t.uri) : null;
  if (key !== player.trackKey) {
    player.trackKey = key;
    const art = t ? (bestImage(t.album?.images, 640) || placeholderArt(t.id)) : null;
    document.body.classList.toggle('has-track', !!t);
    if (art) {
      npArt.set(art); appBg.set(art, settings.background); npBg.set(art, settings.background);
      extractPalette(art).then((p) => { if (player.trackKey === key) setAlbumPalette(p); });
    }
    lyricsView.setTrack(t, provider);
    player.liked = false; renderLike();
    if (t) provider.isSaved(t).then((v) => { if (player.trackKey === key) { player.liked = v; renderLike(); } });
    document.title = t ? `${t.name} · ${artistNames(t)} — Notify` : 'Notify';
    document.querySelectorAll('.tl-row').forEach((r) => r.classList.toggle('playing', !!t && r.dataset.id === t.id));
    if (!$('#queue-panel').hidden) renderQueue();
  }
  renderPlayer();
}

// ---------- player rendering ----------
function renderPlayer() {
  const s = player.state, t = s?.track;
  const art = t ? (bestImage(t.album?.images, 300) || placeholderArt(t.id)) : placeholderArt('none');
  for (const el of document.querySelectorAll('[data-bind=art]')) if (el.getAttribute('src') !== art) el.src = art;
  for (const el of document.querySelectorAll('[data-bind=title]')) el.textContent = t?.name || 'Nothing playing';
  for (const el of document.querySelectorAll('[data-bind=artist]')) {
    el.replaceChildren(...(t?.artists || [{ name: s ? '' : 'Pick something to play' }]).map((a, i) =>
      h('a', { onclick: () => { if (a.id) { closeNowPlaying(); open('artist', a.id); } } }, (i ? ', ' : '') + a.name)));
  }
  for (const el of document.querySelectorAll('[data-bind=album]')) el.textContent = t?.album?.name || '';
  const playing = !!s?.is_playing;
  document.body.classList.toggle('is-playing', playing);
  for (const b of document.querySelectorAll('[data-act=play]')) { b.innerHTML = playing ? icon.pause : icon.play; b.title = playing ? 'Pause' : 'Play'; }
  for (const b of document.querySelectorAll('[data-act=shuffle]')) b.classList.toggle('on', !!s?.shuffle);
  for (const b of document.querySelectorAll('[data-act=repeat]')) { b.classList.toggle('on', s?.repeat && s.repeat !== 'off'); b.innerHTML = s?.repeat === 'track' ? icon.repeatOne : icon.repeat; }
  const dev = $('#device-label'); if (dev) dev.textContent = s?.device ? `Playing on ${s.device.name}` : '';
  npArt.playing = playing;
  renderVolume();
}
function renderLike() { for (const b of document.querySelectorAll('[data-act=like]')) { b.innerHTML = player.liked ? icon.heartFill : icon.heart; b.classList.toggle('on', player.liked); } }
function renderVolume() {
  const v = player.volume;
  for (const el of document.querySelectorAll('[data-bind=volume]')) if (!el.classList.contains('dragging')) el.style.setProperty('--v', v + '%');
  for (const b of document.querySelectorAll('[data-act=mute]')) b.innerHTML = v === 0 ? icon.mute : icon.volume;
}

// rAF loop for smooth progress, lyrics and history.
let lastHist = 0, lastMiniLine = '';
function frame(now) {
  const s = player.state;
  const p = pos();
  const d = s?.track?.duration_ms || 0;
  for (const el of document.querySelectorAll('[data-bind=progress]')) if (!el.classList.contains('dragging')) el.style.setProperty('--v', (d ? (p / d) * 100 : 0) + '%');
  for (const el of document.querySelectorAll('[data-bind=elapsed]')) if (!el.dataset.hold) el.textContent = fmtTime(p);
  for (const el of document.querySelectorAll('[data-bind=remaining]')) el.textContent = d ? '-' + fmtTime(d - p) : '0:00';
  for (const el of document.querySelectorAll('[data-bind=duration]')) el.textContent = fmtTime(d);
  if (document.body.classList.contains('np-open') || document.body.classList.contains('mini')) lyricsView.update(p);
  if (document.body.classList.contains('mini')) {
    const line = lyricsView.currentLine(p) || '';
    if (line !== lastMiniLine) { lastMiniLine = line; const el = $('#mini-line'); el.classList.remove('in'); void el.offsetWidth; el.textContent = line; el.classList.add('in'); }
  }
  if (now - lastHist > 1000) { lastHist = now; history.tick(getState(), settings.trackHistory); }
  if (s?.is_playing && d && p >= d - 50 && now - player.pending > 1200) { player.pending = now; setTimeout(poll, 300); }
  requestAnimationFrame(frame);
}

// ---------- sliders ----------
function slider(el, { onInput, onCommit }) {
  const valueAt = (e) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId); el.classList.add('dragging');
    const move = (ev) => { const v = valueAt(ev); el.style.setProperty('--v', v * 100 + '%'); onInput?.(v); };
    const up = (ev) => { el.classList.remove('dragging'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onCommit?.(valueAt(ev)); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    move(e);
  });
}
function progressSlider() {
  const el = h('div', { class: 'slider progress', 'data-bind': 'progress' }, h('div', { class: 'rail' }, h('div', { class: 'fill' })), h('div', { class: 'knob' }));
  slider(el, {
    onInput: (v) => { const d = player.state?.track?.duration_ms || 0; document.querySelectorAll('[data-bind=elapsed]').forEach((x) => { x.dataset.hold = 1; x.textContent = fmtTime(v * d); }); },
    onCommit: (v) => { document.querySelectorAll('[data-bind=elapsed]').forEach((x) => delete x.dataset.hold); const d = player.state?.track?.duration_ms; if (d) seek(v * d); }
  });
  return el;
}
function volumeSlider() {
  const el = h('div', { class: 'slider volume', 'data-bind': 'volume' }, h('div', { class: 'rail' }, h('div', { class: 'fill' })), h('div', { class: 'knob' }));
  slider(el, { onInput: (v) => setVolume(v * 100, false), onCommit: (v) => setVolume(v * 100) });
  el.addEventListener('wheel', (e) => { e.preventDefault(); setVolume(player.volume - Math.sign(e.deltaY) * 5); }, { passive: false });
  return el;
}
const btn = (actName, ic, title, cls = '') => h('button', { class: `ibtn ${cls}`, 'data-act': actName, title, html: ic });
function wireActions(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || !root.contains(b)) return;
    ({
      play: togglePlay, next, prev, shuffle: toggleShuffle, repeat: cycleRepeat, like: toggleLike,
      mute: () => { if (player.volume > 0) { player.preMute = player.volume; setVolume(0); } else setVolume(player.preMute || 50); },
      lyrics: () => openNowPlaying(), np: () => openNowPlaying(), queue: toggleQueue, devices: (ev) => toggleDevices(ev),
      mini: () => setMini(true), unmini: () => setMini(false), closeNp: closeNowPlaying
    }[b.dataset.act] || (() => {}))(e);
  });
}

// ---------- Now Playing ----------
let npArt, npBg, appBg, lyricsView;
function buildNowPlaying() {
  const np = $('#nowplaying');
  const artBox = h('div', { class: 'np-art' });
  const lyr = h('div', { class: 'np-lyrics' });
  np.append(
    h('div', { class: 'np-bg', id: 'np-bg' }),
    h('div', { class: 'np-top' },
      h('button', { class: 'ibtn', 'data-act': 'closeNp', title: 'Close (Esc)', html: icon.down }),
      h('div', { class: 'seg small' }, [['split', 'Lyrics + Art'], ['lyrics', 'Lyrics'], ['art', 'Artwork']].map(([k, l]) =>
        h('button', { class: settings.npLayout === k ? 'on' : '', dataset: { layout: k }, onclick: () => { setSetting('npLayout', k); np.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === k)); } }, l))),
      h('div', { class: 'np-top-r' }, btn('queue', icon.queue, 'Queue'), btn('devices', icon.devices, 'Devices'), btn('mini', icon.mini, 'Mini player'))),
    h('div', { class: 'np-body' },
      h('div', { class: 'np-left' },
        artBox,
        h('div', { class: 'np-info' },
          h('div', { class: 'np-titles' }, h('div', { class: 'np-title', 'data-bind': 'title' }), h('div', { class: 'np-artist', 'data-bind': 'artist' })),
          btn('like', icon.heart, 'Like')),
        h('div', { class: 'np-progress' }, progressSlider(), h('div', { class: 'times' }, h('span', { 'data-bind': 'elapsed' }), h('span', { 'data-bind': 'remaining' }))),
        h('div', { class: 'np-controls' }, btn('shuffle', icon.shuffle, 'Shuffle', 'sm'), btn('prev', icon.prev, 'Previous', 'lg'), btn('play', icon.play, 'Play', 'xl'), btn('next', icon.next, 'Next', 'lg'), btn('repeat', icon.repeat, 'Repeat', 'sm')),
        h('div', { class: 'np-volume' }, btn('mute', icon.volume, 'Mute', 'sm'), volumeSlider()),
        h('div', { class: 'np-device', id: 'device-label' })),
      lyr));
  npArt = new LivingArtwork(artBox);
  npBg = new FluidBackground($('#np-bg'));
  lyricsView = new LyricsView(lyr, { onSeek: (ms) => seek(ms), getSettings: () => settings });
  wireActions(np);
}
function openNowPlaying() { document.body.classList.add('np-open'); lyricsView.layout(true); }
function closeNowPlaying() { document.body.classList.remove('np-open'); }

// ---------- queue + devices ----------
function toggleQueue() { const p = $('#queue-panel'); p.hidden = !p.hidden; document.body.classList.toggle('queue-open', !p.hidden); if (!p.hidden) renderQueue(); }
async function renderQueue() {
  const p = $('#queue-panel');
  p.replaceChildren(h('div', { class: 'panel-head' }, h('h3', {}, 'Up next'), h('button', { class: 'ibtn sm', html: icon.close, onclick: toggleQueue })), h('div', { class: 'skeleton-row' }));
  try {
    const q = await provider.queue();
    const row = (t, now) => h('div', { class: `q-row${now ? ' now' : ''}` },
      h('img', { src: bestImage(t.album?.images, 64) || placeholderArt(t.id), alt: '' }),
      h('div', { class: 'meta' }, h('b', {}, t.name), h('span', {}, artistNames(t))));
    p.replaceChildren(p.firstChild,
      q.current ? h('div', { class: 'q-label' }, 'Now playing') : null, q.current ? row(q.current, true) : null,
      h('div', { class: 'q-label' }, 'Next up'),
      ...(q.queue.length ? q.queue.slice(0, 30).map((t) => row(t)) : [h('p', { class: 'muted' }, 'Queue is empty')]));
  } catch (e) { p.replaceChildren(p.firstChild, h('p', { class: 'muted' }, e.message)); }
}
async function toggleDevices(e) {
  const pop = $('#devices-pop');
  if (!pop.hidden) { pop.hidden = true; return; }
  const r = e.target.closest('button').getBoundingClientRect();
  pop.style.left = Math.min(window.innerWidth - 300, Math.max(12, r.left + r.width / 2 - 140)) + 'px';
  pop.style.bottom = (window.innerHeight - r.top + 10) + 'px';
  pop.hidden = false;
  pop.replaceChildren(h('h4', {}, 'Play on'), h('div', { class: 'skeleton-row' }));
  try {
    const list = await provider.devices();
    pop.replaceChildren(h('h4', {}, 'Play on'),
      ...list.map((d) => h('button', { class: `dev${d.is_active ? ' on' : ''}`, onclick: async () => { pop.hidden = true; await act(() => provider.transfer(d.id)); } },
        h('span', { html: icon.devices }), h('span', {}, h('b', {}, d.name), h('small', {}, d.is_active ? 'Playing here' : d.type)))),
      list.length ? null : h('p', { class: 'muted' }, 'No devices found.'),
      isDesktop ? h('button', { class: 'btn ghost small', onclick: () => { bridge.launchSpotify(); pop.hidden = true; toast('Starting Spotify in the background…'); setTimeout(poll, 4000); } }, 'Start Spotify on this PC') : null);
  } catch (err) { pop.replaceChildren(h('h4', {}, 'Play on'), h('p', { class: 'muted' }, err.message)); }
}
document.addEventListener('pointerdown', (e) => { const pop = $('#devices-pop'); if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-act=devices]')) pop.hidden = true; });

// ---------- mini player ----------
async function setMini(on) {
  await bridge.win.mini(on);
  document.body.classList.toggle('mini', on);
  if (on) closeNowPlaying();
}

// ---------- settings view ----------
function renderSettings(root) {
  const row = (label, desc, control) => h('div', { class: 'set-row' }, h('div', {}, h('div', { class: 'set-label' }, label), desc ? h('div', { class: 'set-desc' }, desc) : null), control);
  const choice = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { class: settings[key] === v ? 'on' : '', onclick: (e) => { setSetting(key, v); e.target.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); } }, l)));
  const toggle = (key) => { const i = h('input', { type: 'checkbox', class: 'switch', onchange: () => setSetting(key, i.checked) }); i.checked = !!settings[key]; return i; };
  const range = (key, min, max, step, fmt = (v) => v) => {
    const out = h('span', { class: 'range-val' }, fmt(settings[key]));
    const i = h('input', { type: 'range', min, max, step, value: settings[key], oninput: () => { setSetting(key, Number(i.value)); out.textContent = fmt(Number(i.value)); } });
    return h('div', { class: 'range' }, i, out);
  };
  const themes = [['adaptive', 'Adaptive', 'Tinted by the album'], ['dark', 'Dark', 'Classic night'], ['oled', 'OLED', 'True black'], ['light', 'Light', 'Bright & airy']];
  const swatches = ['#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2', '#1ed760'];

  const cid = h('input', { class: 'text', placeholder: 'Spotify Client ID', value: settings.clientId || '', spellcheck: 'false' });
  cid.addEventListener('change', () => setSetting('clientId', cid.value.trim()));

  root.replaceChildren(h('div', { class: 'page settings' },
    h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Make it yours'), h('h1', {}, 'Settings'))),
    h('section', { class: 'card' }, h('h3', {}, 'Theme'),
      h('div', { class: 'theme-cards' }, themes.map(([v, l, d]) => h('button', { class: `theme-card t-${v}${settings.theme === v ? ' on' : ''}`, onclick: (e) => { setSetting('theme', v); e.currentTarget.parentNode.querySelectorAll('.theme-card').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } },
        h('div', { class: 'tc-preview' }, h('i'), h('i'), h('i')), h('b', {}, l), h('small', {}, d)))),
      row('Accent color', 'Pull it from the album artwork, or pick your own.', choice('accentMode', [['album', 'From album'], ['custom', 'Custom']])),
      h('div', { class: 'swatches' }, swatches.map((c) => h('button', { class: 'swatch', style: { background: c }, title: c, onclick: () => { setSetting('accent', c); setSetting('accentMode', 'custom'); renderSettings(root); } })),
        h('label', { class: 'swatch custom', title: 'Custom color' }, h('input', { type: 'color', value: settings.accent, oninput: (e) => { setSetting('accent', e.target.value); setSetting('accentMode', 'custom'); } }))),
      row('Font', null, choice('font', [['system', 'Modern'], ['rounded', 'Rounded'], ['serif', 'Editorial'], ['condensed', 'Condensed'], ['mono', 'Mono']])),
      row('Corner roundness', null, range('radius', 0, 28, 1, (v) => v + 'px')),
      row('Glass', 'How translucent panels are.', range('glass', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')),
      row('Density', null, choice('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']])),
      row('Playlists in sidebar', null, toggle('showSidebarPlaylists'))),
    h('section', { class: 'card' }, h('h3', {}, 'Now Playing'),
      row('Background', 'Fluid animates a blurred mix of the cover art.', choice('background', [['fluid', 'Fluid'], ['blur', 'Blurred'], ['solid', 'Solid']])),
      row('Background speed', null, range('bgSpeed', 0.2, 3, 0.1, (v) => v.toFixed(1) + '×')),
      row('Moving artwork', 'Liquid gently flows the cover; Drift slowly pans and zooms.', choice('artMotion', [['liquid', 'Liquid'], ['drift', 'Drift'], ['off', 'Still']])),
      row('Artwork speed', null, range('artSpeed', 0.2, 3, 0.1, (v) => v.toFixed(1) + '×')),
      row('Layout', null, choice('npLayout', [['split', 'Lyrics + Art'], ['lyrics', 'Lyrics'], ['art', 'Artwork']])),
      row('Reduce motion', 'Turns off most animation.', toggle('reduceMotion'))),
    h('section', { class: 'card' }, h('h3', {}, 'Lyrics'),
      row('Text size', null, range('lyricsSize', 22, 60, 1, (v) => v + 'px')),
      row('Alignment', null, choice('lyricsAlign', [['left', 'Left'], ['center', 'Center']])),
      row('Word-by-word', 'Lights up words as they are sung.', toggle('lyricsWordSync')),
      row('Depth blur', 'Softly blurs lines away from the current one.', toggle('lyricsBlur'))),
    h('section', { class: 'card' }, h('h3', {}, 'Playback & stats'),
      isDesktop ? row('Start Spotify automatically', 'Launch Spotify minimized when nothing is playing, so Notify has a device to play on.', toggle('launchSpotify')) : null,
      row('Record listening history', 'Saved only on this computer, used for Stats.', toggle('trackHistory')),
      row('Listening history', `${history.plays.length.toLocaleString()} plays stored`, h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost small', onclick: exportHistory }, 'Export'),
        h('button', { class: 'btn danger small', onclick: () => { if (confirm('Delete all listening history stored by Notify?')) { history.clear(); renderSettings(root); toast('History cleared'); } } }, 'Clear')))),
    h('section', { class: 'card' }, h('h3', {}, 'Account'),
      row('Signed in', provider?.kind === 'demo' ? 'Demo mode — nothing is connected.' : 'Connected to Spotify.', h('button', { class: 'btn ghost small', onclick: signOut }, provider?.kind === 'demo' ? 'Leave demo' : 'Sign out')),
      isDesktop ? row('Spotify Client ID', 'Leave empty to use the built-in one. Changes apply at next sign-in.', cid) : null),
    h('div', { class: 'btn-row end' }, h('button', { class: 'btn ghost small', onclick: () => { resetSettings(); renderSettings(root); } }, 'Reset appearance')),
    h('p', { class: 'muted about' }, 'Notify 1.0 · Lyrics from LRCLIB · Not affiliated with Spotify.')));
}
function exportHistory() {
  const blob = new Blob([JSON.stringify(history.plays, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `notify-history-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}

// ---------- sidebar ----------
async function renderSidebarPlaylists() {
  const box = $('#side-playlists');
  box.hidden = !settings.showSidebarPlaylists;
  if (!provider || box.hidden) return;
  try {
    const pls = await provider.myPlaylists();
    box.replaceChildren(h('div', { class: 'side-label' }, 'Playlists'),
      ...pls.slice(0, 60).map((p) => h('button', { class: 'side-pl', dataset: { id: p.id }, onclick: () => open('playlist', p.id) },
        h('img', { src: bestImage(p.images, 64) || placeholderArt(p.id), alt: '', loading: 'lazy' }), h('span', {}, p.name))));
  } catch { box.replaceChildren(); }
}

// ---------- shell ----------
function buildShell() {
  const navItem = (view, ic, label) => h('button', { class: 'nav-item', dataset: { view }, onclick: () => open(view) }, h('span', { html: ic }), h('span', {}, label));
  $('#titlebar').append(
    h('div', { class: 'tb-left' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', html: icon.logo }), 'Notify'),
      h('button', { class: 'ibtn sm', title: 'Back', html: icon.back, onclick: () => go(-1) }),
      h('button', { class: 'ibtn sm flip', title: 'Forward', html: icon.back, onclick: () => go(1) })),
    h('div', { class: 'tb-drag' }),
    isDesktop ? h('div', { class: 'win-ctl' },
      h('button', { title: 'Minimize', html: icon.minWin, onclick: () => bridge.win.minimize() }),
      h('button', { title: 'Maximize', html: icon.maxWin, onclick: () => bridge.win.maximize() }),
      h('button', { class: 'close', title: 'Close', html: icon.close, onclick: () => bridge.win.close() })) : null);

  $('#sidebar').append(
    h('nav', {}, navItem('home', icon.home, 'Home'), navItem('search', icon.search, 'Search'), navItem('library', icon.library, 'Library'),
      navItem('stats', icon.stats, 'Stats'), h('button', { class: 'nav-item', onclick: openNowPlaying }, h('span', { html: icon.lyrics }), h('span', {}, 'Lyrics')),
      navItem('settings', icon.settings, 'Settings')),
    h('div', { id: 'side-playlists', class: 'side-playlists' }));

  const bar = $('#playerbar');
  bar.append(
    h('div', { class: 'pb-left' },
      h('button', { class: 'pb-art', 'data-act': 'np', title: 'Open Now Playing' }, h('img', { 'data-bind': 'art', alt: '' }), h('span', { class: 'pb-art-hover', html: icon.expand })),
      h('div', { class: 'pb-text' }, h('div', { class: 'pb-title', 'data-bind': 'title' }), h('div', { class: 'pb-artist', 'data-bind': 'artist' })),
      btn('like', icon.heart, 'Like', 'sm')),
    h('div', { class: 'pb-center' },
      h('div', { class: 'pb-controls' }, btn('shuffle', icon.shuffle, 'Shuffle', 'sm'), btn('prev', icon.prev, 'Previous'), btn('play', icon.play, 'Play', 'play'), btn('next', icon.next, 'Next'), btn('repeat', icon.repeat, 'Repeat', 'sm')),
      h('div', { class: 'pb-progress' }, h('span', { 'data-bind': 'elapsed' }), progressSlider(), h('span', { 'data-bind': 'duration' }))),
    h('div', { class: 'pb-right' }, btn('lyrics', icon.lyrics, 'Lyrics'), btn('queue', icon.queue, 'Queue'), btn('devices', icon.devices, 'Devices'),
      h('div', { class: 'pb-vol' }, btn('mute', icon.volume, 'Mute', 'sm'), volumeSlider()), btn('mini', icon.mini, 'Mini player')));
  wireActions(bar);

  const mini = $('#mini');
  mini.append(
    h('img', { class: 'mini-art', 'data-bind': 'art', alt: '' }),
    h('div', { class: 'mini-body' },
      h('div', { class: 'mini-title', 'data-bind': 'title' }), h('div', { class: 'mini-artist', 'data-bind': 'artist' }),
      h('div', { class: 'mini-line', id: 'mini-line' }),
      h('div', { class: 'mini-controls' }, btn('prev', icon.prev, 'Previous', 'sm'), btn('play', icon.play, 'Play', 'sm'), btn('next', icon.next, 'Next', 'sm'), btn('like', icon.heart, 'Like', 'sm'), h('span', { class: 'grow' }), btn('unmini', icon.expand, 'Back to full window', 'sm'))),
    h('div', { class: 'mini-progress', 'data-bind': 'progress' }, h('div', { class: 'rail' }, h('div', { class: 'fill' }))));
  wireActions(mini);

  appBg = new FluidBackground($('#bg'));
  buildNowPlaying();
  renderVolume(); renderLike();
}

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight' && e.ctrlKey) next();
  else if (e.key === 'ArrowLeft' && e.ctrlKey) prev();
  else if (e.key === 'ArrowRight') seek(pos() + 5000);
  else if (e.key === 'ArrowLeft') seek(Math.max(0, pos() - 5000));
  else if (e.key === 'ArrowUp') { e.preventDefault(); setVolume(player.volume + 5); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setVolume(player.volume - 5); }
  else if (e.key.toLowerCase() === 'l') document.body.classList.contains('np-open') ? closeNowPlaying() : openNowPlaying();
  else if (e.key.toLowerCase() === 'm' && e.ctrlKey) setMini(!document.body.classList.contains('mini'));
  else if (e.key === 'Escape') { if (document.body.classList.contains('np-open')) closeNowPlaying(); }
  else if (e.altKey && e.key === 'ArrowLeft') go(-1);
});
document.addEventListener('mouseup', (e) => { if (e.button === 3) go(-1); if (e.button === 4) go(1); });

// ---------- onboarding / auth ----------
async function showOnboarding() {
  document.body.classList.add('onboarding');
  const info = await bridge.authInfo();
  const ob = $('#onboarding');
  const err = h('div', { class: 'ob-err' });
  const connect = h('button', { class: 'btn primary big', onclick: async () => {
    connect.disabled = true; connect.textContent = 'Waiting for Spotify in your browser…'; err.textContent = '';
    const r = await bridge.login();
    connect.disabled = false; connect.textContent = 'Connect Spotify';
    if (r?.ok) start(new SpotifyProvider());
    else err.textContent = r?.error ? `Couldn't sign in: ${r.error}` : 'Sign-in was cancelled.';
  } }, 'Connect Spotify');
  ob.replaceChildren(h('div', { class: 'ob-card' },
    h('div', { class: 'ob-logo', html: icon.logo }),
    h('h1', {}, 'Notify'),
    h('p', { class: 'ob-tag' }, 'Spotify, beautifully. Synced lyrics, living artwork and your listening stats — in one clean app.'),
    isDesktop ? connect : h('p', { class: 'muted' }, 'Open the desktop app to connect your Spotify account.'),
    h('button', { class: 'btn ghost big', onclick: () => start(new DemoProvider()) }, 'Explore the demo'),
    err,
    isDesktop ? h('details', { class: 'ob-help' }, h('summary', {}, 'First time? One-minute setup'),
      h('ol', {},
        h('li', {}, 'Open ', h('a', { onclick: () => bridge.openExternal('https://developer.spotify.com/dashboard') }, 'developer.spotify.com/dashboard'), ' and select your app.'),
        h('li', {}, 'In Settings → Redirect URIs, add ', h('code', {}, info.redirectUri), ' and tick “Web API”.'),
        h('li', {}, 'Under User Management, add the Spotify email of everyone who will use Notify (up to 5).'),
        h('li', {}, 'Click Connect Spotify above. Spotify Premium is needed to control playback.')),
      h('p', { class: 'muted' }, 'Notify plays through Spotify Connect: keep the Spotify app installed (it can stay minimized) or play on any device.')) : null));
}

async function start(p) {
  provider = p;
  document.body.classList.remove('onboarding');
  document.body.classList.toggle('demo', p.kind === 'demo');
  await history.load(p.kind === 'demo' ? demoHistory() : null);
  if (p.kind === 'demo') { await p.play({ uris: null }); p.playing = true; }
  open('home');
  renderSidebarPlaylists();
  await poll();
  if (p.kind === 'spotify') {
    p.recentlyPlayed().then((r) => history.mergeRecent(r)).catch(() => {});
    if (!player.state && settings.launchSpotify && isDesktop) {
      const devs = await p.devices().catch(() => []);
      if (!devs.length) { bridge.launchSpotify(); toast('Starting Spotify in the background…'); setTimeout(poll, 5000); }
    }
  }
}

async function signOut() {
  if (provider?.kind !== 'demo') await bridge.logout();
  provider = null; player.state = null; player.trackKey = null;
  closeNowPlaying(); clearTimeout(pollT);
  document.body.classList.remove('demo', 'has-track');
  showOnboarding();
}

onSettings((key) => {
  if (key === 'showSidebarPlaylists' || key === '*') renderSidebarPlaylists();
  if (key === 'background' || key === '*') { appBg.set(null, settings.background); npBg.set(null, settings.background); }
  npArt.mode = settings.reduceMotion ? 'off' : settings.artMotion;
  npArt.speed = settings.artSpeed;
  if (key === 'lyricsSize' || key === 'lyricsAlign' || key === 'npLayout') requestAnimationFrame(() => lyricsView.layout(true));
  if (key === 'lyricsBlur') { lyricsView.active = -2; }
});

// ---------- boot ----------
(async function boot() {
  await loadSettings();
  buildShell();
  npArt.mode = settings.reduceMotion ? 'off' : settings.artMotion;
  npArt.speed = settings.artSpeed;
  bridge.win.onState?.(({ maximized }) => document.body.classList.toggle('maximized', maximized));
  requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) return start(new DemoProvider()).then(() => { if (params.get('view')) open(params.get('view')); if (params.has('np')) openNowPlaying(); });
  const token = await bridge.token();
  if (token) start(new SpotifyProvider()); else showOnboarding();
})();
