// Apple-Music-style synced lyrics: word-by-word fill, staggered spring scroll,
// depth blur, breathing interlude dots and tap-to-seek.

import { bridge } from './bridge.js';
import { h, artistNames } from './ui.js';

const cache = new Map();

export function parseLRC(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const content = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').trim();
    for (const m of tags) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      lines.push({ time: (Number(m[1]) * 60 + Number(m[2])) * 1000 + frac, text: content });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

export async function loadLyrics(track, provider) {
  if (!track) return null;
  const key = track.id || track.uri || track.name;
  if (cache.has(key)) return cache.get(key);
  let res = null;
  if (provider?.demoLyrics) res = provider.demoLyrics(track);
  else if (track.type !== 'episode') {
    const clean = (s) => String(s || '').replace(/\s*[-–]\s*(remaster(ed)?|\d{4} remaster|live|mono|stereo|radio edit).*$/i, '').replace(/\s*\((feat|with)\.?[^)]*\)/i, '').trim();
    res = await bridge.lyrics({
      track: clean(track.name), artist: track.artists?.[0]?.name || artistNames(track),
      album: track.album?.name, duration: (track.duration_ms || 0) / 1000
    }).catch(() => null);
  }
  const out = res ? { synced: res.synced ? parseLRC(res.synced) : null, plain: res.plain || null, instrumental: res.instrumental } : null;
  cache.set(key, out);
  return out;
}

// Build display rows: lyric lines with end times, plus interlude rows for long gaps.
function buildRows(lines, duration) {
  const rows = [];
  const GAP = 4500;
  const real = lines.filter((l) => l.text);
  if (!real.length) return rows;
  if (real[0].time > GAP) rows.push({ kind: 'gap', start: 0, end: real[0].time - 250 });
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.text) continue;
    const nextAny = lines[i + 1];
    const nextReal = real[real.indexOf(l) + 1];
    const hardEnd = nextReal ? nextReal.time : (duration || l.time + 6000);
    const end = nextAny && !nextAny.text ? Math.min(nextAny.time, hardEnd) : hardEnd;
    rows.push({ kind: 'line', text: l.text, start: l.time, end: Math.max(end, l.time + 600) });
    if (nextReal && nextReal.time - end > GAP) rows.push({ kind: 'gap', start: end, end: nextReal.time - 250 });
    else if (nextReal && end < nextReal.time && nextAny && !nextAny.text && nextReal.time - nextAny.time > GAP) {
      rows.push({ kind: 'gap', start: nextAny.time, end: nextReal.time - 250 });
    }
  }
  // De-duplicate gaps that overlap
  return rows.filter((r, i) => !(r.kind === 'gap' && rows[i - 1]?.kind === 'gap'));
}

export class LyricsView {
  constructor(root, { onSeek, getSettings }) {
    this.root = root;
    this.onSeek = onSeek;
    this.getSettings = getSettings;
    this.rows = [];
    this.els = [];
    this.active = -2;
    this.trackKey = null;
    this.freeUntil = 0;
    this.manual = 0;
    this.root.classList.add('lyrics');
    this.root.addEventListener('wheel', (e) => {
      if (!this.rows.length) return;
      this.freeUntil = performance.now() + 2600;
      this.manual += e.deltaY;
      this.root.classList.add('free');
      this.layout(true);
    }, { passive: true });
    new ResizeObserver(() => this.layout(true)).observe(this.root);
  }

  async setTrack(track, provider) {
    const key = track ? (track.id || track.uri) : null;
    if (key === this.trackKey) return;
    this.trackKey = key;
    this.rows = []; this.els = []; this.active = -2;
    this.root.replaceChildren(h('div', { class: 'lyrics-msg' }, h('div', { class: 'lyrics-loader' }, h('i'), h('i'), h('i'))));
    if (!track) { this.root.replaceChildren(h('div', { class: 'lyrics-msg' }, 'Nothing playing')); return; }
    const data = await loadLyrics(track, provider);
    if (key !== this.trackKey) return;
    if (data?.synced?.some((l) => l.text)) {
      this.rows = buildRows(data.synced, track.duration_ms);
      this.render();
    } else if (data?.plain) {
      this.root.replaceChildren(h('div', { class: 'lyrics-plain' },
        h('div', { class: 'lyrics-note' }, 'These lyrics aren’t time-synced yet'),
        ...data.plain.split(/\r?\n/).map((t) => h('p', {}, t || ' '))));
    } else if (data?.instrumental) {
      this.root.replaceChildren(h('div', { class: 'lyrics-msg' }, h('div', { class: 'big' }, '♪'), 'Instrumental'));
    } else {
      this.root.replaceChildren(h('div', { class: 'lyrics-msg' }, h('div', { class: 'big' }, '…'), 'No lyrics found for this song'));
    }
  }

  render() {
    const wrap = h('div', { class: 'lyrics-track' });
    this.els = this.rows.map((r) => {
      if (r.kind === 'gap') {
        return h('div', { class: 'lrow gap' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')));
      }
      const words = r.text.split(/(\s+)/).filter((w) => w.length);
      const total = words.reduce((n, w) => n + (w.trim() ? w.length + 2 : 0), 0) || 1;
      let acc = 0;
      r.words = [];
      const line = h('div', { class: 'lrow line', onclick: () => this.onSeek?.(r.start + 5) });
      for (const w of words) {
        if (!w.trim()) { line.append(' '); continue; }
        const span = h('span', { class: 'w' }, w);
        const a = acc / total; acc += w.length + 2; const b = acc / total;
        r.words.push({ el: span, a, b });
        line.append(span);
      }
      return line;
    });
    wrap.append(h('div', { class: 'lyrics-pad top' }), ...this.els, h('div', { class: 'lyrics-pad bottom' }));
    this.root.replaceChildren(wrap);
    this.wrap = wrap;
    this.active = -2;
    requestAnimationFrame(() => this.layout(true));
  }

  indexAt(pos) {
    let idx = -1;
    for (let i = 0; i < this.rows.length; i++) { if (this.rows[i].start <= pos) idx = i; else break; }
    return idx;
  }

  update(pos) {
    if (!this.rows.length || !this.els.length) return;
    const s = this.getSettings();
    const idx = this.indexAt(pos);
    if (idx !== this.active) {
      this.active = idx;
      this.els.forEach((el, i) => {
        const d = i - idx;
        el.classList.toggle('active', i === idx && pos < this.rows[i].end + 400);
        el.classList.toggle('past', d < 0);
        const blur = s.lyricsBlur && i !== idx ? Math.min(Math.abs(d), 4) * 0.45 : 0;
        el.style.setProperty('--blur', blur + 'px');
        el.style.setProperty('--delay', (d > 0 ? Math.min(d * 45, 360) : 0) + 'ms');
        if (d < 0 && el.classList.contains('line')) this.rows[i].words?.forEach((w) => { w.el.style.setProperty('--p', '100%'); w.el.classList.add('sung'); });
        if (d > 0 && el.classList.contains('line')) this.rows[i].words?.forEach((w) => { w.el.style.setProperty('--p', '0%'); w.el.classList.remove('sung'); });
      });
      if (performance.now() > this.freeUntil) this.manual = 0;
      this.layout(false);
    }
    if (performance.now() > this.freeUntil && this.root.classList.contains('free')) {
      this.root.classList.remove('free'); this.manual = 0; this.layout(false);
    }
    const r = this.rows[idx];
    if (!r) return;
    const el = this.els[idx];
    const t = Math.min(1, Math.max(0, (pos - r.start) / (r.end - r.start)));
    if (r.kind === 'gap') {
      el.style.setProperty('--gp', t.toFixed(3));
      el.classList.toggle('ending', t > 0.88);
      return;
    }
    el.classList.toggle('active', pos < r.end + 400);
    if (!s.lyricsWordSync) { r.words.forEach((w) => { w.el.style.setProperty('--p', '100%'); w.el.classList.add('sung'); }); return; }
    // Words finish slightly ahead of the line end so the fill reads naturally.
    const tt = Math.min(1, t / 0.92);
    for (const w of r.words) {
      const p = Math.min(1, Math.max(0, (tt - w.a) / Math.max(0.0001, w.b - w.a)));
      w.el.style.setProperty('--p', (p * 100).toFixed(1) + '%');
      w.el.classList.toggle('sung', p > 0);
    }
  }

  layout(instant) {
    if (!this.wrap || !this.els.length) return;
    const H = this.root.clientHeight;
    const anchor = H * 0.32;
    const idx = Math.max(0, this.active);
    const target = this.els[idx];
    if (!target) return;
    const off = target.offsetTop - anchor + this.manual;
    this.wrap.classList.toggle('instant', !!instant);
    for (const el of this.els) el.style.transform = `translate3d(0, ${-off}px, 0)`;
    this.wrap.querySelectorAll('.lyrics-pad').forEach((p) => { p.style.transform = `translate3d(0, ${-off}px, 0)`; });
    if (instant) requestAnimationFrame(() => this.wrap && this.wrap.classList.remove('instant'));
  }

  currentLine(pos) {
    const i = this.indexAt(pos);
    const r = this.rows[i];
    return r && r.kind === 'line' && pos < r.end + 400 ? r.text : '';
  }
}
