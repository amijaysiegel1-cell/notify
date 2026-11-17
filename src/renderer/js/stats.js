// Listening history (recorded locally while Notify runs, plus Spotify's
// recently-played feed) and the Stats view.

import { bridge } from './bridge.js';
import { h, bestImage, artistNames, fmtTime, placeholderArt, esc } from './ui.js';

const DAY = 86400000;

export class History {
  constructor() { this.plays = []; this.open = null; this.lastTick = 0; this.dirty = false; }

  async load(seed) {
    const data = await bridge.storeGet('history', null);
    this.plays = Array.isArray(data?.plays) ? data.plays : [];
    if (!this.plays.length && seed) { this.plays = seed; this.demo = true; }
    setInterval(() => this.flush(), 15000);
    window.addEventListener('beforeunload', () => this.flush());
  }

  flush() {
    if (!this.dirty || this.demo) return;
    this.dirty = false;
    if (this.plays.length > 60000) this.plays = this.plays.slice(-60000);
    bridge.storeSet('history', { v: 1, plays: this.plays });
  }

  clear() { this.plays = []; this.open = null; this.dirty = true; this.demo = false; this.flush(); }

  // Called on every player tick with the interpolated state.
  tick(state, enabled = true) {
    const now = Date.now();
    const dt = this.lastTick ? Math.min(now - this.lastTick, 5000) : 0;
    this.lastTick = now;
    if (!enabled || !state?.track || state.track.type === 'episode') { this.open = null; return; }
    const t = state.track;
    if (!this.open || this.open.id !== t.id || (state.progress_ms < 3000 && this.open.ms > 20000 && this.open.lastPos > state.progress_ms + 15000)) {
      this.open = { id: t.id, name: t.name, artist: t.artists?.[0]?.name || '', artistId: t.artists?.[0]?.id || null,
        artists: artistNames(t), album: t.album?.name || '', image: bestImage(t.album?.images, 64), ms: 0, at: now, committed: false, lastPos: 0 };
    }
    this.open.lastPos = state.progress_ms;
    if (!state.is_playing) return;
    this.open.ms += dt;
    // A play "counts" after 30 seconds (or half of a short track).
    const threshold = Math.min(30000, (t.duration_ms || 60000) / 2);
    if (!this.open.committed && this.open.ms >= threshold) {
      this.open.committed = true;
      const { committed, lastPos, ...rec } = this.open;
      this.open.rec = rec;
      if (this.demo) { this.plays = []; this.demo = false; }
      this.plays.push(rec);
      this.dirty = true;
    } else if (this.open.committed && this.open.rec) {
      this.open.rec.ms = this.open.ms;
      this.dirty = true;
    }
  }

  // Fold Spotify's recently-played list in, skipping anything already recorded.
  mergeRecent(items) {
    if (this.demo || !items?.length) return;
    const byId = new Map();
    for (const p of this.plays) { if (!byId.has(p.id)) byId.set(p.id, []); byId.get(p.id).push(p.at); }
    let added = 0;
    for (const it of items) {
      const t = it.track; if (!t?.id) continue;
      const end = Date.parse(it.played_at); const start = end - (t.duration_ms || 180000);
      const seen = (byId.get(t.id) || []).some((at) => Math.abs(at - start) < 6 * 60000 || Math.abs(at - end) < 6 * 60000);
      if (seen) continue;
      this.plays.push({ id: t.id, name: t.name, artist: t.artists?.[0]?.name || '', artistId: t.artists?.[0]?.id || null, artists: artistNames(t),
        album: t.album?.name || '', image: bestImage(t.album?.images, 64), ms: t.duration_ms || 180000, at: start, src: 'spotify' });
      added++;
    }
    if (added) { this.plays.sort((a, b) => a.at - b.at); this.dirty = true; this.flush(); }
  }

  range(days) {
    if (!days) return this.plays;
    const since = days === 1 ? new Date().setHours(0, 0, 0, 0) : Date.now() - days * DAY;
    return this.plays.filter((p) => p.at >= since);
  }

  summary(days) {
    const plays = this.range(days);
    const ms = plays.reduce((n, p) => n + (p.ms || 0), 0);
    const tracks = new Map(), artists = new Map(), hours = new Array(24).fill(0);
    for (const p of plays) {
      const tk = tracks.get(p.id) || { ...p, count: 0, total: 0 };
      tk.count++; tk.total += p.ms || 0; tracks.set(p.id, tk);
      const ak = p.artist || 'Unknown';
      const ar = artists.get(ak) || { name: ak, id: p.artistId, count: 0, total: 0, image: p.image };
      ar.count++; ar.total += p.ms || 0; artists.set(ak, ar);
      hours[new Date(p.at).getHours()] += (p.ms || 0);
    }
    return {
      plays, ms, count: plays.length,
      topTracks: [...tracks.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      topArtists: [...artists.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      uniqueTracks: tracks.size, uniqueArtists: artists.size, hours
    };
  }

  daily(n) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) out.push({ day: new Date(today.getTime() - i * DAY), ms: 0 });
    const start = out[0].day.getTime();
    for (const p of this.plays) {
      if (p.at < start) continue;
      const idx = Math.floor((p.at - start) / DAY);
      if (out[idx]) out[idx].ms += p.ms || 0;
    }
    return out;
  }

  streak() {
    const days = new Set(this.plays.map((p) => new Date(p.at).toDateString()));
    let n = 0; const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
}

// ---------- view ----------
const RANGES = [['short_term', 'Last 4 weeks'], ['medium_term', 'Last 6 months'], ['long_term', 'All time']];
const LOCAL = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [0, 'All time']];
let ui = { spotifyRange: 'short_term', localRange: 7 };

const mins = (ms) => Math.round(ms / 60000).toLocaleString();
const hourLabel = (hr) => `${((hr + 11) % 12) + 1}${hr < 12 ? 'am' : 'pm'}`;

function barChart(daily) {
  const W = 640, H = 170, pad = 22;
  const max = Math.max(1, ...daily.map((d) => d.ms));
  const bw = (W - pad * 2) / daily.length;
  const bars = daily.map((d, i) => {
    const bh = Math.max(d.ms ? 3 : 1, (d.ms / max) * (H - 46));
    const x = pad + i * bw + bw * 0.18, y = H - 24 - bh;
    const today = i === daily.length - 1;
    const label = (i % Math.ceil(daily.length / 7) === 0 || today)
      ? `<text x="${x + bw * 0.32}" y="${H - 6}" text-anchor="middle">${today ? 'Today' : d.day.toLocaleDateString(undefined, { weekday: 'short' })}</text>` : '';
    return `<g class="bar${today ? ' today' : ''}"><title>${d.day.toLocaleDateString()} — ${mins(d.ms)} min</title><rect x="${x}" y="${y}" width="${bw * 0.64}" height="${bh}" rx="${Math.min(6, bw * 0.3)}"/>${label}</g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${bars}</svg>`;
}

function hourChart(hours) {
  const max = Math.max(1, ...hours);
  const cx = 110, cy = 110, r0 = 44, r1 = 100;
  let seg = '';
  for (let i = 0; i < 24; i++) {
    const a0 = ((i - 6) / 24) * Math.PI * 2 + 0.02, a1 = ((i - 5) / 24) * Math.PI * 2 - 0.02;
    const rr = r0 + (r1 - r0) * Math.max(0.04, hours[i] / max);
    const p = (a, rad) => `${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`;
    seg += `<path class="hseg" style="--o:${(0.25 + 0.75 * hours[i] / max).toFixed(2)}" d="M${p(a0, r0)} L${p(a0, rr)} A${rr},${rr} 0 0 1 ${p(a1, rr)} L${p(a1, r0)} A${r0},${r0} 0 0 0 ${p(a0, r0)}Z"><title>${hourLabel(i)} — ${mins(hours[i])} min</title></path>`;
  }
  const lab = [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p']].map(([hr, t]) => {
    const a = ((hr - 6) / 24) * Math.PI * 2 + Math.PI / 24; return `<text x="${cx + Math.cos(a) * 32}" y="${cy + Math.sin(a) * 32 + 4}" text-anchor="middle">${t}</text>`;
  }).join('');
  return `<svg class="clock" viewBox="0 0 220 220">${seg}${lab}</svg>`;
}

export async function renderStats(root, { provider, history, open }) {
  const s = history.summary(ui.localRange);
  const daily = history.daily(ui.localRange === 30 || ui.localRange === 0 ? 30 : 14);
  const peak = s.hours.indexOf(Math.max(...s.hours));
  const seg = (items, cur, cb) => h('div', { class: 'seg' }, items.map(([v, label]) =>
    h('button', { class: v === cur ? 'on' : '', onclick: () => cb(v) }, label)));

  const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);

  const page = h('div', { class: 'page stats-page' },
    h('header', { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Listening stats'), h('h1', {}, 'Your sound, in numbers')),
      seg(LOCAL, ui.localRange, (v) => { ui.localRange = v; renderStats(root, { provider, history, open }); })
    ),
    history.demo ? h('div', { class: 'hint' }, 'Showing sample history. Notify records your real listening from the moment you start playing music.') : null,
    h('div', { class: 'tiles' },
      tile('Minutes listened', mins(s.ms), `${(s.ms / 3600000).toFixed(1)} hours`),
      tile('Plays', s.count.toLocaleString(), `${s.uniqueTracks} different songs`),
      tile('Artists', s.uniqueArtists.toLocaleString(), s.topArtists[0] ? `Most: ${s.topArtists[0].name}` : '—'),
      tile('Day streak', String(history.streak()), 'days in a row'),
      tile('Peak hour', s.count ? hourLabel(peak) : '—', 'when you listen most')
    ),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h3', {}, 'Minutes per day'), h('div', { html: barChart(daily) })),
      h('section', { class: 'card clock-card' }, h('h3', {}, 'Your listening clock'), h('div', { html: hourChart(s.hours) }))
    ),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h3', {}, 'Most played on Notify'),
        s.topTracks.length ? h('ol', { class: 'rank-list' }, s.topTracks.map((t, i) => h('li', {},
          h('span', { class: 'rank' }, i + 1), h('img', { src: t.image || placeholderArt(t.id), alt: '' }),
          h('div', { class: 'meta' }, h('b', {}, t.name), h('span', {}, t.artists || t.artist)),
          h('span', { class: 'num' }, `${t.count}× · ${mins(t.total)}m`)))) : h('p', { class: 'muted' }, 'Play some music and it will show up here.')),
      h('section', { class: 'card' }, h('h3', {}, 'Top artists on Notify'),
        s.topArtists.length ? h('div', { class: 'bars' }, s.topArtists.slice(0, 8).map((a) => h('div', { class: 'hbar' },
          h('span', { class: 'hbar-label' }, a.name),
          h('span', { class: 'hbar-track' }, h('i', { style: { width: `${Math.max(4, (a.total / s.topArtists[0].total) * 100)}%` } })),
          h('span', { class: 'num' }, `${mins(a.total)}m`)))) : h('p', { class: 'muted' }, 'No artists yet.'))
    ),
    h('header', { class: 'page-head sub' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'From Spotify'), h('h2', {}, 'Top tracks & artists')),
      seg(RANGES, ui.spotifyRange, (v) => { ui.spotifyRange = v; renderStats(root, { provider, history, open }); })
    ),
    h('div', { class: 'spotify-tops', id: 'spotify-tops' }, h('div', { class: 'skeleton-row' }))
  );
  root.replaceChildren(page);

  try {
    const [tracks, artists, recent] = await Promise.all([
      provider.topTracks(ui.spotifyRange), provider.topArtists(ui.spotifyRange), provider.recentlyPlayed().catch(() => [])
    ]);
    const genres = new Map();
    artists.forEach((a, i) => (a.genres || []).forEach((g) => genres.set(g, (genres.get(g) || 0) + (50 - i))));
    const topGenres = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const box = page.querySelector('#spotify-tops');
    box.replaceChildren(
      h('section', { class: 'card' }, h('h3', {}, 'Top artists'),
        h('div', { class: 'artist-row' }, artists.slice(0, 12).map((a, i) => h('button', { class: 'artist-chip', onclick: () => open('artist', a.id) },
          h('div', { class: 'artist-img' }, h('img', { src: bestImage(a.images, 160) || placeholderArt(a.id), alt: '' }), h('span', { class: 'badge' }, i + 1)),
          h('span', {}, a.name))))),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h3', {}, 'Top tracks'),
          h('ol', { class: 'rank-list' }, tracks.slice(0, 15).map((t, i) => h('li', { ondblclick: () => provider.play({ uris: tracks.map((x) => x.uri), offset: i }) },
            h('span', { class: 'rank' }, i + 1), h('img', { src: bestImage(t.album?.images, 64) || placeholderArt(t.id), alt: '' }),
            h('div', { class: 'meta' }, h('b', {}, t.name), h('span', {}, artistNames(t))),
            h('span', { class: 'num' }, fmtTime(t.duration_ms))))),
          h('button', { class: 'btn ghost small', onclick: () => provider.play({ uris: tracks.map((x) => x.uri) }) }, 'Play these')),
        h('section', { class: 'card' },
          topGenres.length ? [h('h3', {}, 'Top genres'), h('div', { class: 'bars' }, topGenres.map(([g, v]) => h('div', { class: 'hbar' },
            h('span', { class: 'hbar-label' }, g), h('span', { class: 'hbar-track' }, h('i', { style: { width: `${(v / topGenres[0][1]) * 100}%` } })))))] : null,
          h('h3', { style: { marginTop: topGenres.length ? '22px' : 0 } }, 'Recently played'),
          h('ul', { class: 'recent-list' }, recent.slice(0, 12).map((r) => h('li', {},
            h('img', { src: bestImage(r.track.album?.images, 64) || placeholderArt(r.track.id), alt: '' }),
            h('div', { class: 'meta' }, h('b', {}, r.track.name), h('span', {}, artistNames(r.track))),
            h('span', { class: 'num' }, ago(r.played_at))))))
      )
    );
  } catch (e) {
    const box = page.querySelector('#spotify-tops');
    box.replaceChildren(h('p', { class: 'muted' }, `Couldn't load Spotify stats: ${esc(e.message)}`));
  }
}

function ago(iso) {
  const d = (Date.now() - Date.parse(iso)) / 60000;
  if (d < 60) return `${Math.max(1, Math.round(d))}m ago`;
  if (d < 1440) return `${Math.round(d / 60)}h ago`;
  return `${Math.round(d / 1440)}d ago`;
}
