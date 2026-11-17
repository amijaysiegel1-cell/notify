// Spotify Web API provider.
// Written against the 2026 Web API: playlist "tracks" became "items",
// library writes moved to /me/library, search is capped at 10 results for
// development-mode apps and some catalog endpoints were removed — every call
// that might be affected has a fallback.

import { bridge } from './bridge.js';

const BASE = 'https://api.spotify.com/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(status, message, reason) { super(message); this.status = status; this.reason = reason; }
}

export class SpotifyProvider {
  constructor() { this.kind = 'spotify'; this.cache = new Map(); }

  async req(method, path, { query, body, retry = true } = {}) {
    let token = await bridge.token();
    if (!token) throw new ApiError(401, 'Not signed in');
    const url = new URL(path.startsWith('http') ? path : BASE + path);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.status === 401 && retry && attempt === 0) { token = await bridge.token(true); if (!token) break; continue; }
      if (res.status === 429) { const wait = Number(res.headers.get('Retry-After') || 2); await sleep(Math.min(wait, 10) * 1000); continue; }
      if (res.status === 204 || res.status === 202) return null;
      const text = await res.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) {
        const msg = json?.error?.message || json?.error_description || `Spotify error ${res.status}`;
        throw new ApiError(res.status, msg, json?.error?.reason);
      }
      return json;
    }
    throw new ApiError(401, 'Session expired — please sign in again');
  }
  get(path, query) { return this.req('GET', path, { query }); }

  async cached(key, ttl, fn) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    const v = await fn();
    this.cache.set(key, { t: Date.now(), v });
    return v;
  }

  async first(...fns) {
    let lastErr;
    for (const fn of fns) { try { return await fn(); } catch (e) { lastErr = e; } }
    throw lastErr;
  }

  // ---------- account ----------
  me() { return this.cached('me', 600_000, () => this.get('/me')); }

  // ---------- playback ----------
  async getState() {
    const s = await this.get('/me/player', { additional_types: 'track,episode' });
    if (!s) return null;
    const it = s.item;
    let track = null;
    if (it) {
      track = it.type === 'episode'
        ? { id: it.id, uri: it.uri, name: it.name, duration_ms: it.duration_ms, type: 'episode',
            artists: [{ name: it.show?.name || 'Podcast', id: null }], album: { name: it.show?.name, images: it.images || it.show?.images || [] } }
        : it;
    }
    return {
      track, is_playing: !!s.is_playing, progress_ms: s.progress_ms || 0,
      shuffle: !!s.shuffle_state, repeat: s.repeat_state || 'off',
      volume: s.device?.volume_percent ?? 50, device: s.device || null,
      context: s.context || null, supportsVolume: s.device?.supports_volume !== false
    };
  }

  async ensureDevice() {
    const { devices = [] } = (await this.get('/me/player/devices')) || {};
    if (devices.find((d) => d.is_active)) return true;
    let target = devices.find((d) => d.type === 'Computer') || devices[0];
    if (!target) {
      await bridge.launchSpotify();
      for (let i = 0; i < 10 && !target; i++) {
        await sleep(1500);
        const r = (await this.get('/me/player/devices')) || {};
        target = (r.devices || []).find((d) => d.type === 'Computer') || (r.devices || [])[0];
      }
    }
    if (!target) throw new ApiError(404, 'No Spotify device found. Open Spotify on this PC or your phone, then try again.');
    await this.req('PUT', '/me/player', { body: { device_ids: [target.id], play: false } });
    await sleep(600);
    return true;
  }

  async withDevice(fn) {
    try { return await fn(); }
    catch (e) {
      if (e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') { await this.ensureDevice(); return fn(); }
      if (e.status === 403 && /premium/i.test(e.message + e.reason)) throw new ApiError(403, 'Playback control needs Spotify Premium.');
      throw e;
    }
  }

  play(opts = {}) {
    const body = {};
    if (opts.context_uri) body.context_uri = opts.context_uri;
    if (opts.uris) body.uris = opts.uris;
    if (opts.offset != null) body.offset = typeof opts.offset === 'number' ? { position: opts.offset } : { uri: opts.offset };
    return this.withDevice(() => this.req('PUT', '/me/player/play', { body: Object.keys(body).length ? body : undefined }));
  }
  resume() { return this.play(); }
  pause() { return this.withDevice(() => this.req('PUT', '/me/player/pause')); }
  next() { return this.withDevice(() => this.req('POST', '/me/player/next')); }
  prev() { return this.withDevice(() => this.req('POST', '/me/player/previous')); }
  seek(ms) { return this.withDevice(() => this.req('PUT', '/me/player/seek', { query: { position_ms: Math.max(0, Math.round(ms)) } })); }
  setVolume(v) { return this.req('PUT', '/me/player/volume', { query: { volume_percent: Math.round(v) } }); }
  setShuffle(on) { return this.withDevice(() => this.req('PUT', '/me/player/shuffle', { query: { state: on } })); }
  setRepeat(mode) { return this.withDevice(() => this.req('PUT', '/me/player/repeat', { query: { state: mode } })); }
  async devices() { return ((await this.get('/me/player/devices')) || {}).devices || []; }
  transfer(id) { return this.req('PUT', '/me/player', { body: { device_ids: [id], play: true } }); }
  async queue() { const q = await this.get('/me/player/queue'); return { current: q?.currently_playing || null, queue: q?.queue || [] }; }
  addToQueue(uri) { return this.withDevice(() => this.req('POST', '/me/player/queue', { query: { uri } })); }

  // ---------- library ----------
  async isSaved(track) {
    if (!track?.id || track.type === 'episode') return false;
    try {
      const r = await this.first(
        () => this.get('/me/library/contains', { uris: track.uri }),
        () => this.get('/me/tracks/contains', { ids: track.id })
      );
      return Array.isArray(r) ? !!r[0] : !!r;
    } catch { return false; }
  }
  save(track) {
    return this.first(
      () => this.req('PUT', '/me/library', { query: { uris: track.uri } }),
      () => this.req('PUT', '/me/tracks', { query: { ids: track.id } })
    );
  }
  unsave(track) {
    return this.first(
      () => this.req('DELETE', '/me/library', { query: { uris: track.uri } }),
      () => this.req('DELETE', '/me/tracks', { query: { ids: track.id } })
    );
  }

  async myPlaylists() {
    return this.cached('playlists', 120_000, async () => {
      const out = []; let url = '/me/playlists?limit=50';
      for (let i = 0; i < 6 && url; i++) {
        const r = await this.get(url.replace(BASE, ''));
        out.push(...(r?.items || []).filter(Boolean));
        url = r?.next;
      }
      return out.map((p) => ({ ...p, total: p.items?.total ?? p.tracks?.total ?? 0 }));
    });
  }

  async savedTracks(offset = 0) {
    const r = await this.get('/me/tracks', { limit: 50, offset });
    return { items: (r?.items || []).map((x) => ({ ...x.track, added_at: x.added_at })).filter((t) => t?.id), total: r?.total || 0, next: r?.next };
  }

  async savedAlbums() {
    return this.cached('albums', 300_000, async () => {
      const r = await this.get('/me/albums', { limit: 50 });
      return (r?.items || []).map((x) => x.album).filter(Boolean);
    });
  }

  async followedArtists() {
    return this.cached('following', 300_000, async () => {
      try { const r = await this.get('/me/following', { type: 'artist', limit: 50 }); return r?.artists?.items || []; }
      catch { return []; }
    });
  }

  async playlist(id) {
    const meta = await this.get(`/playlists/${id}`, { fields: 'id,name,description,images,owner(display_name),uri,items(total),tracks(total)' })
      .catch(() => this.get(`/playlists/${id}`));
    const tracks = [];
    const pageFrom = async (path) => {
      let url = path;
      for (let i = 0; i < 10 && url; i++) {
        const r = await this.get(url.replace(BASE, ''));
        for (const row of r?.items || []) {
          const t = row.item || row.track;
          if (t && t.id && t.type !== 'episode') tracks.push({ ...t, added_at: row.added_at });
        }
        url = r?.next;
      }
    };
    await this.first(() => pageFrom(`/playlists/${id}/items?limit=100`), () => pageFrom(`/playlists/${id}/tracks?limit=100`));
    return { meta: { ...meta, total: meta.items?.total ?? meta.tracks?.total ?? tracks.length, kind: 'Playlist' }, tracks };
  }

  async album(id) {
    const a = await this.get(`/albums/${id}`);
    const tracks = (a.tracks?.items || []).map((t) => ({ ...t, album: { id: a.id, name: a.name, images: a.images, uri: a.uri } }));
    return { meta: { ...a, kind: a.album_type === 'single' ? 'Single' : 'Album', owner: { display_name: (a.artists || []).map((x) => x.name).join(', ') }, total: tracks.length }, tracks };
  }

  async artist(id) {
    const artist = await this.get(`/artists/${id}`);
    let tracks = [];
    try { tracks = (await this.get(`/artists/${id}/top-tracks`, { market: 'from_token' }))?.tracks || []; } catch {}
    if (!tracks.length) {
      const r = await this.get('/search', { q: `artist:"${artist.name}"`, type: 'track', limit: 10 }).catch(() => null);
      tracks = (r?.tracks?.items || []).filter((t) => t.artists?.some((a) => a.id === id));
    }
    let albums = [];
    try { albums = (await this.get(`/artists/${id}/albums`, { include_groups: 'album,single', limit: 20 }))?.items || []; } catch {}
    if (!albums.length) {
      const r = await this.get('/search', { q: `artist:"${artist.name}"`, type: 'album', limit: 10 }).catch(() => null);
      albums = (r?.albums?.items || []).filter((a) => a?.artists?.some((x) => x.id === id));
    }
    return { artist, tracks, albums };
  }

  async search(q) {
    const r = await this.get('/search', { q, type: 'track,artist,album,playlist', limit: 10 });
    return {
      tracks: (r?.tracks?.items || []).filter(Boolean),
      artists: (r?.artists?.items || []).filter(Boolean),
      albums: (r?.albums?.items || []).filter(Boolean),
      playlists: (r?.playlists?.items || []).filter(Boolean)
    };
  }

  // ---------- listening data ----------
  async recentlyPlayed() {
    const r = await this.get('/me/player/recently-played', { limit: 50 });
    return (r?.items || []).map((x) => ({ track: x.track, played_at: x.played_at, context: x.context }));
  }
  topTracks(range = 'medium_term') {
    return this.cached('tt' + range, 600_000, async () => ((await this.get('/me/top/tracks', { time_range: range, limit: 50 }))?.items || []));
  }
  topArtists(range = 'medium_term') {
    return this.cached('ta' + range, 600_000, async () => ((await this.get('/me/top/artists', { time_range: range, limit: 50 }))?.items || []));
  }
}
