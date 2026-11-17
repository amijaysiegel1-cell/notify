// Demo provider: a fully offline catalogue with simulated playback, so the
// interface can be explored before connecting a Spotify account.

const art = (h1, h2, shape) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs>
  <radialGradient id="a" cx="30%" cy="25%" r="85%"><stop offset="0" stop-color="hsl(${h1},80%,62%)"/><stop offset=".55" stop-color="hsl(${(h1 + h2) / 2},70%,38%)"/><stop offset="1" stop-color="hsl(${h2},70%,14%)"/></radialGradient>
  <radialGradient id="b" cx="78%" cy="80%" r="55%"><stop offset="0" stop-color="hsl(${h2 + 30},90%,60%)" stop-opacity=".85"/><stop offset="1" stop-color="hsl(${h2},90%,50%)" stop-opacity="0"/></radialGradient></defs>
  <rect width="600" height="600" fill="url(#a)"/><rect width="600" height="600" fill="url(#b)"/>${shape}</svg>`);

const SHAPES = [
  '<circle cx="300" cy="300" r="150" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="10"/><circle cx="300" cy="300" r="60" fill="rgba(255,255,255,.85)"/>',
  '<path d="M80 420 Q300 120 520 420" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="14" stroke-linecap="round"/><circle cx="300" cy="190" r="34" fill="#fff" opacity=".9"/>',
  '<rect x="170" y="170" width="260" height="260" rx="40" transform="rotate(45 300 300)" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="12"/>',
  '<g fill="rgba(255,255,255,.8)"><rect x="140" y="260" width="30" height="80" rx="15"/><rect x="200" y="200" width="30" height="200" rx="15"/><rect x="260" y="150" width="30" height="300" rx="15"/><rect x="320" y="220" width="30" height="160" rx="15"/><rect x="380" y="180" width="30" height="240" rx="15"/><rect x="440" y="250" width="30" height="100" rx="15"/></g>',
  '<path d="M300 120 L470 440 L130 440 Z" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="12" stroke-linejoin="round"/>',
  '<g fill="none" stroke="rgba(255,255,255,.7)" stroke-width="8"><circle cx="250" cy="300" r="120"/><circle cx="350" cy="300" r="120"/></g>'
];

const A = (id, name, genres) => ({ id, name, genres, uri: `demo:artist:${id}`, images: [{ url: art((id.length * 47) % 360, (id.length * 47 + 120) % 360, SHAPES[id.length % 6]), width: 600 }] });
const ARTISTS = [
  A('nova', 'Nova Lane', ['indie pop', 'dream pop']),
  A('harbor', 'The Harbor Lights', ['indie rock', 'alternative']),
  A('mira', 'Mira Sol', ['r&b', 'neo soul']),
  A('kite', 'Paper Kite Club', ['synthwave', 'electronic']),
  A('ember', 'Ember & Oak', ['folk', 'acoustic']),
  A('velvet', 'Velvet Static', ['electronic', 'house'])
];
const AL = (id, name, artist, h1, h2, s) => ({ id, name, uri: `demo:album:${id}`, artists: [artist], album_type: 'album', release_date: '2026-03-14', images: [{ url: art(h1, h2, SHAPES[s]), width: 600 }] });
const ALBUMS = [
  AL('glow', 'Afterglow Season', ARTISTS[0], 330, 260, 0),
  AL('tides', 'Low Tides', ARTISTS[1], 200, 230, 1),
  AL('honey', 'Honey & Static', ARTISTS[2], 30, 350, 2),
  AL('neon', 'Neon Paper', ARTISTS[3], 280, 190, 3),
  AL('pines', 'Under the Pines', ARTISTS[4], 110, 160, 4),
  AL('pulse', 'Soft Pulse', ARTISTS[5], 170, 300, 5)
];

const LYRICS = {
  t1: `[00:00.00]
[00:08.20]City lights are humming low tonight
[00:12.40]Every window holds a different kind of light
[00:16.80]I keep your voice inside the radio
[00:21.10]Turning up the parts I used to know
[00:25.60]
[00:30.20]So let it glow, let it glow
[00:34.30]Like the summer never has to go
[00:38.60]We were gold before we knew it
[00:42.90]Running through it, running through it
[00:47.40]Let it glow, let it glow
[00:51.60]Hold the moment till the morning shows
[00:56.10]
[01:04.00]Paper hearts on a passenger seat
[01:08.20]Painted skies on a quiet street
[01:12.50]Every song is a place we've been
[01:16.80]Play it back and we're there again
[01:21.30]So let it glow, let it glow
[01:25.50]Like the summer never has to go
[01:29.80]We were gold before we knew it
[01:34.10]Running through it, running through it
[01:38.70]`,
  t2: `[00:00.00]
[00:06.00]Salt on the window, fog on the bay
[00:10.50]You said the tide would carry us away
[00:15.00]I counted the boats till the harbor went dark
[00:19.60]Left all the lights on, left you a mark
[00:24.20]
[00:28.00]Low tide, low tide
[00:32.30]Pull me back to the other side
[00:36.70]Low tide, low tide
[00:41.00]I'll be waiting where the waters hide
[00:45.80]
[00:54.00]Old wooden pier with our names carved in
[00:58.40]Washed by the rain but they're still within
[01:02.90]Low tide, low tide
[01:07.20]Pull me back to the other side
[01:11.80]`,
  t3: `[00:00.00]
[00:05.50]Slow mornings, coffee and rain
[00:09.80]Your record spinning through the window pane
[00:14.30]Honey in the static, gold in the air
[00:18.90]Every little crackle says that you were there
[00:23.50]
[00:27.80]Stay a little longer
[00:31.20]Let the needle drop again
[00:35.40]Stay a little longer
[00:38.90]We don't have to know the end
[00:43.50]`
};

const T = (id, name, ai, ali, dur) => ({
  id, name, uri: `demo:track:${id}`, duration_ms: dur, type: 'track', artists: [ARTISTS[ai]], album: ALBUMS[ali], _lyrics: LYRICS[id] || null
});
const TRACKS = [
  T('t1', 'Let It Glow', 0, 0, 102000),
  T('t2', 'Low Tide', 1, 1, 76000),
  T('t3', 'Honey in the Static', 2, 2, 48000),
  T('t4', 'Neon Paper Planes', 3, 3, 214000),
  T('t5', 'Under the Pines', 4, 4, 187000),
  T('t6', 'Soft Pulse', 5, 5, 243000),
  T('t7', 'Midnight Postcard', 0, 0, 199000),
  T('t8', 'Lighthouse Keeper', 1, 1, 231000),
  T('t9', 'Velour', 2, 2, 176000),
  T('t10', 'Arcade Heart', 3, 3, 205000),
  T('t11', 'Campfire Static', 4, 4, 168000),
  T('t12', 'Glass Garden', 5, 5, 221000)
];

const PLAYLISTS = [
  { id: 'p1', name: 'Late Night Drive', description: 'Neon roads and quiet hearts.', owner: { display_name: 'You' }, uri: 'demo:playlist:p1', images: [{ url: art(250, 320, SHAPES[3]), width: 600 }], tracks: [3, 9, 0, 5, 11, 6] },
  { id: 'p2', name: 'Sunday Slow', description: 'Coffee, rain, records.', owner: { display_name: 'You' }, uri: 'demo:playlist:p2', images: [{ url: art(30, 60, SHAPES[2]), width: 600 }], tracks: [2, 4, 8, 10, 1] },
  { id: 'p3', name: 'Focus Flow', description: 'Steady, warm, wordless.', owner: { display_name: 'You' }, uri: 'demo:playlist:p3', images: [{ url: art(160, 210, SHAPES[5]), width: 600 }], tracks: [5, 11, 3, 9] },
  { id: 'p4', name: 'Golden Hour', description: 'Songs that sound like sunsets.', owner: { display_name: 'You' }, uri: 'demo:playlist:p4', images: [{ url: art(40, 340, SHAPES[0]), width: 600 }], tracks: [0, 6, 2, 7, 1] }
];

export class DemoProvider {
  constructor() {
    this.kind = 'demo';
    this.queueList = [...TRACKS];
    this.index = 0;
    this.playing = false;
    this.pos = 0;
    this.lastTick = performance.now();
    this.shuffle = false; this.repeat = 'off'; this.volume = 70;
    this.saved = new Set(['t1', 't3', 't6']);
    setInterval(() => this.tick(), 250);
  }
  tick() {
    const now = performance.now();
    if (this.playing) {
      this.pos += now - this.lastTick;
      const t = this.queueList[this.index];
      if (this.pos >= t.duration_ms) {
        if (this.repeat === 'track') this.pos = 0;
        else { this.pos = 0; this.index = (this.index + 1) % this.queueList.length; }
      }
    }
    this.lastTick = now;
  }
  async me() { return { display_name: 'Demo Listener', id: 'demo', images: [] }; }
  async getState() {
    this.tick();
    return { track: this.queueList[this.index], is_playing: this.playing, progress_ms: this.pos, shuffle: this.shuffle, repeat: this.repeat,
      volume: this.volume, device: { name: 'Notify Demo', id: 'demo', type: 'Computer' }, context: null, supportsVolume: true };
  }
  async play(opts = {}) {
    this.tick();
    if (opts.uris) {
      this.queueList = opts.uris.map((u) => TRACKS.find((t) => t.uri === u)).filter(Boolean);
      this.index = typeof opts.offset === 'number' ? opts.offset : Math.max(0, this.queueList.findIndex((t) => t.uri === opts.offset));
      this.pos = 0;
    } else if (opts.context_uri) {
      const id = opts.context_uri.split(':').pop();
      const p = PLAYLISTS.find((x) => x.id === id);
      const al = ALBUMS.find((x) => x.id === id);
      this.queueList = p ? p.tracks.map((i) => TRACKS[i]) : al ? TRACKS.filter((t) => t.album.id === id) : TRACKS;
      this.index = typeof opts.offset === 'number' ? opts.offset : Math.max(0, this.queueList.findIndex((t) => t.uri === opts.offset));
      this.pos = 0;
    }
    this.playing = true;
  }
  async resume() { this.tick(); this.playing = true; }
  async pause() { this.tick(); this.playing = false; }
  async next() { this.tick(); this.index = (this.index + 1) % this.queueList.length; this.pos = 0; }
  async prev() { this.tick(); if (this.pos > 3000) this.pos = 0; else { this.index = (this.index - 1 + this.queueList.length) % this.queueList.length; this.pos = 0; } }
  async seek(ms) { this.tick(); this.pos = ms; }
  async setVolume(v) { this.volume = v; }
  async setShuffle(on) { this.shuffle = on; }
  async setRepeat(m) { this.repeat = m; }
  async devices() { return [{ id: 'demo', name: 'Notify Demo', type: 'Computer', is_active: true }, { id: 'phone', name: 'Phone', type: 'Smartphone', is_active: false }]; }
  async transfer() {}
  async queue() { const q = []; for (let i = 1; i <= 8; i++) q.push(this.queueList[(this.index + i) % this.queueList.length]); return { current: this.queueList[this.index], queue: q }; }
  async addToQueue(uri) { const t = TRACKS.find((x) => x.uri === uri); if (t) this.queueList.splice(this.index + 1, 0, t); }
  async isSaved(t) { return this.saved.has(t?.id); }
  async save(t) { this.saved.add(t.id); }
  async unsave(t) { this.saved.delete(t.id); }
  async myPlaylists() { return PLAYLISTS.map((p) => ({ ...p, total: p.tracks.length })); }
  async savedTracks() { const items = TRACKS.filter((t) => this.saved.has(t.id)); return { items, total: items.length, next: null }; }
  async savedAlbums() { return ALBUMS; }
  async followedArtists() { return ARTISTS; }
  async playlist(id) { const p = PLAYLISTS.find((x) => x.id === id); return { meta: { ...p, kind: 'Playlist', total: p.tracks.length }, tracks: p.tracks.map((i) => TRACKS[i]) }; }
  async album(id) { const a = ALBUMS.find((x) => x.id === id); const tracks = TRACKS.filter((t) => t.album.id === id); return { meta: { ...a, kind: 'Album', owner: { display_name: a.artists[0].name }, total: tracks.length }, tracks }; }
  async artist(id) { const artist = ARTISTS.find((a) => a.id === id); return { artist, tracks: TRACKS.filter((t) => t.artists[0].id === id), albums: ALBUMS.filter((a) => a.artists[0].id === id) }; }
  async search(q) {
    const s = q.toLowerCase();
    return {
      tracks: TRACKS.filter((t) => (t.name + t.artists[0].name).toLowerCase().includes(s)),
      artists: ARTISTS.filter((a) => a.name.toLowerCase().includes(s)),
      albums: ALBUMS.filter((a) => a.name.toLowerCase().includes(s)),
      playlists: PLAYLISTS.filter((p) => p.name.toLowerCase().includes(s))
    };
  }
  async recentlyPlayed() {
    const out = []; const now = Date.now();
    for (let i = 0; i < 30; i++) out.push({ track: TRACKS[(i * 5) % TRACKS.length], played_at: new Date(now - i * 47 * 60000).toISOString() });
    return out;
  }
  async topTracks(range) { const k = range === 'short_term' ? 3 : range === 'long_term' ? 7 : 0; return TRACKS.map((_, i) => TRACKS[(i + k) % TRACKS.length]); }
  async topArtists(range) { const k = range === 'short_term' ? 2 : range === 'long_term' ? 4 : 0; return ARTISTS.map((_, i) => ARTISTS[(i + k) % ARTISTS.length]); }
  demoLyrics(track) { return track?._lyrics ? { synced: track._lyrics } : null; }
}

// Seed a few weeks of believable local listening history for the demo.
export function demoHistory() {
  const plays = []; const now = Date.now();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let d = 0; d < 28; d++) {
    const n = 6 + Math.floor(rnd() * 22);
    for (let i = 0; i < n; i++) {
      const hour = [8, 9, 12, 13, 17, 18, 20, 21, 22, 23][Math.floor(rnd() * 10)];
      const t = TRACKS[Math.floor(Math.pow(rnd(), 1.6) * TRACKS.length)];
      const day = new Date(now - d * 86400000); day.setHours(hour, Math.floor(rnd() * 60), 0, 0);
      if (day.getTime() > now) continue;
      plays.push({ id: t.id, name: t.name, artist: t.artists[0].name, artistId: t.artists[0].id, album: t.album.name,
        image: t.album.images[0].url, ms: Math.round(t.duration_ms * (0.6 + rnd() * 0.4)), at: day.getTime() });
    }
  }
  return plays.sort((a, b) => a.at - b.at);
}
