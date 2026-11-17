// Browsing views: Home, Search, Library, playlists/albums and artists.

import { h, bestImage, artistNames, fmtTime, fmtDuration, placeholderArt, debounce, icon, toast } from './ui.js';

const img = (images, seed, size = 300) => bestImage(images, size) || placeholderArt(seed);
const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };

export function card({ image, title, sub, round, onOpen, onPlay }) {
  return h('div', { class: `card-item${round ? ' round' : ''}`, onclick: onOpen, tabindex: 0 },
    h('div', { class: 'card-art' },
      h('img', { src: image, alt: '', loading: 'lazy' }),
      onPlay ? h('button', { class: 'fab', title: 'Play', html: icon.play, onclick: (e) => { e.stopPropagation(); onPlay(); } }) : null),
    h('div', { class: 'card-title' }, title),
    sub ? h('div', { class: 'card-sub' }, sub) : null);
}

export function shelf(title, items, extra) {
  if (!items?.length) return null;
  return h('section', { class: 'shelf' }, h('div', { class: 'shelf-head' }, h('h2', {}, title), extra || null), h('div', { class: 'shelf-row' }, items));
}

export function trackList(tracks, ctx, { onPlay, showAlbum = true, numbered = true } = {}) {
  const cur = ctx.state()?.track?.id;
  const list = h('div', { class: `tracklist${showAlbum ? '' : ' no-album'}` },
    h('div', { class: 'tl-head' }, h('span', {}, '#'), h('span', {}, 'Title'), showAlbum ? h('span', {}, 'Album') : null, h('span', { class: 'r', html: icon.clock })));
  tracks.forEach((t, i) => {
    const row = h('div', { class: `tl-row${t.id === cur ? ' playing' : ''}`, dataset: { id: t.id || '' }, ondblclick: () => onPlay(i) },
      h('span', { class: 'tl-num' }, h('span', { class: 'n' }, numbered ? i + 1 : ''), h('button', { class: 'tl-play', html: icon.play, onclick: () => onPlay(i) }), h('span', { class: 'eq' }, h('i'), h('i'), h('i'))),
      h('span', { class: 'tl-title' },
        t.album?.images ? h('img', { src: img(t.album.images, t.id, 64), alt: '', loading: 'lazy' }) : null,
        h('span', { class: 'tl-text' }, h('b', {}, t.name),
          h('span', {}, (t.artists || []).map((a, k) => [k ? ', ' : '', h('a', { onclick: (e) => { e.stopPropagation(); a.id && ctx.open('artist', a.id); } }, a.name)])))),
      showAlbum ? h('span', { class: 'tl-album' }, t.album?.id ? h('a', { onclick: () => ctx.open('album', t.album.id) }, t.album.name) : (t.album?.name || '')) : null,
      h('span', { class: 'tl-dur' },
        h('button', { class: 'tl-queue', title: 'Add to queue', html: icon.plus, onclick: async (e) => { e.stopPropagation(); try { await ctx.provider.addToQueue(t.uri); toast('Added to queue'); } catch (err) { toast(err.message, 'err'); } } }),
        fmtTime(t.duration_ms)));
    list.append(row);
  });
  return list;
}

// ---------- Home ----------
export async function renderHome(root, ctx) {
  const { provider } = ctx;
  const me = await provider.me().catch(() => null);
  const page = h('div', { class: 'page home' },
    h('header', { class: 'home-hero' },
      h('div', { class: 'eyebrow' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
      h('h1', {}, `${greeting()}${me?.display_name ? ', ' + me.display_name.split(' ')[0] : ''}`)),
    h('div', { class: 'quick-grid', id: 'quick' }),
    h('div', { id: 'shelves' }, h('div', { class: 'skeleton-row' }), h('div', { class: 'skeleton-row' })));
  root.replaceChildren(page);

  const [playlists, recent, topShort, artists] = await Promise.all([
    provider.myPlaylists().catch(() => []), provider.recentlyPlayed().catch(() => []),
    provider.topTracks('short_term').catch(() => []), provider.topArtists('short_term').catch(() => [])
  ]);

  const quick = page.querySelector('#quick');
  const qItem = (image, title, onOpen, onPlay) => h('div', { class: 'quick', onclick: onOpen },
    h('img', { src: image, alt: '' }), h('span', {}, title),
    h('button', { class: 'fab sm', html: icon.play, onclick: (e) => { e.stopPropagation(); onPlay(); } }));
  quick.append(h('div', { class: 'quick liked', onclick: () => ctx.open('liked') },
    h('div', { class: 'liked-art', html: icon.heartFill }), h('span', {}, 'Liked Songs'),
    h('button', { class: 'fab sm', html: icon.play, onclick: async (e) => { e.stopPropagation(); const r = await provider.savedTracks(0); ctx.play({ uris: r.items.map((t) => t.uri) }); } })));
  playlists.slice(0, 7).forEach((p) => quick.append(qItem(img(p.images, p.id, 120), p.name, () => ctx.open('playlist', p.id), () => ctx.play({ context_uri: p.uri }))));

  // Unique albums from recently played → "Jump back in"
  const seen = new Set(); const jump = [];
  for (const r of recent) { const a = r.track?.album; if (a?.id && !seen.has(a.id)) { seen.add(a.id); jump.push(a); } if (jump.length >= 12) break; }

  page.querySelector('#shelves').replaceChildren(...[
    shelf('Jump back in', jump.map((a) => card({ image: img(a.images, a.id), title: a.name, sub: artistNames(a), onOpen: () => ctx.open('album', a.id), onPlay: () => ctx.play({ context_uri: a.uri }) }))),
    shelf('On repeat', topShort.slice(0, 14).map((t, i) => card({ image: img(t.album?.images, t.id), title: t.name, sub: artistNames(t), onOpen: () => t.album?.id && ctx.open('album', t.album.id), onPlay: () => ctx.play({ uris: topShort.map((x) => x.uri), offset: i }) })),
      h('button', { class: 'btn ghost small', onclick: () => ctx.play({ uris: topShort.map((x) => x.uri) }) }, 'Play all')),
    shelf('Your playlists', playlists.slice(0, 16).map((p) => card({ image: img(p.images, p.id), title: p.name, sub: `${p.total ?? ''} songs`, onOpen: () => ctx.open('playlist', p.id), onPlay: () => ctx.play({ context_uri: p.uri }) }))),
    shelf('Artists you love', artists.slice(0, 12).map((a) => card({ image: img(a.images, a.id), title: a.name, sub: 'Artist', round: true, onOpen: () => ctx.open('artist', a.id) })))
  ].filter(Boolean));
  if (!page.querySelector('#shelves').children.length) page.querySelector('#shelves').append(h('p', { class: 'muted' }, 'Start listening and your home will fill up.'));
}

// ---------- Search ----------
let lastQuery = '';
export function renderSearch(root, ctx) {
  const results = h('div', { class: 'search-results' });
  const input = h('input', { class: 'search-input', placeholder: 'Songs, artists, albums, playlists', value: lastQuery, spellcheck: 'false' });
  const run = debounce(async (q) => {
    lastQuery = q;
    if (!q.trim()) { results.replaceChildren(h('div', { class: 'empty-search' }, h('div', { class: 'big', html: icon.search }), h('p', {}, 'Find anything on Spotify.'))); return; }
    results.classList.add('loading');
    try {
      const r = await ctx.provider.search(q.trim());
      if (q !== lastQuery) return;
      const top = r.tracks[0];
      results.replaceChildren(...[
        top ? h('div', { class: 'search-top' },
          h('section', { class: 'top-result', onclick: () => ctx.play({ uris: r.tracks.map((t) => t.uri), offset: 0 }) },
            h('h2', {}, 'Top result'),
            h('img', { src: img(top.album?.images, top.id), alt: '' }),
            h('div', { class: 'tr-title' }, top.name),
            h('div', { class: 'tr-sub' }, h('span', { class: 'pill' }, 'Song'), artistNames(top)),
            h('button', { class: 'fab', html: icon.play })),
          h('section', { class: 'top-songs' }, h('h2', {}, 'Songs'), trackList(r.tracks.slice(0, 6), ctx, { showAlbum: false, numbered: false, onPlay: (i) => ctx.play({ uris: r.tracks.map((t) => t.uri), offset: i }) }))) : null,
        shelf('Artists', r.artists.map((a) => card({ image: img(a.images, a.id), title: a.name, sub: 'Artist', round: true, onOpen: () => ctx.open('artist', a.id) }))),
        shelf('Albums', r.albums.map((a) => card({ image: img(a.images, a.id), title: a.name, sub: artistNames(a), onOpen: () => ctx.open('album', a.id), onPlay: () => ctx.play({ context_uri: a.uri }) }))),
        shelf('Playlists', r.playlists.map((p) => card({ image: img(p.images, p.id), title: p.name, sub: p.owner?.display_name || '', onOpen: () => ctx.open('playlist', p.id), onPlay: () => ctx.play({ context_uri: p.uri }) })))
      ].filter(Boolean));
      if (!results.children.length) results.replaceChildren(h('p', { class: 'muted' }, `No results for “${q}”`));
    } catch (e) { results.replaceChildren(h('p', { class: 'muted' }, e.message)); }
    finally { results.classList.remove('loading'); }
  }, 280);
  input.addEventListener('input', () => run(input.value));
  root.replaceChildren(h('div', { class: 'page search' },
    h('div', { class: 'search-bar' }, h('span', { html: icon.search }), input), results));
  run(lastQuery);
  setTimeout(() => input.focus(), 50);
}

// ---------- Library ----------
let libTab = 'playlists';
export async function renderLibrary(root, ctx) {
  const tabs = [['playlists', 'Playlists'], ['albums', 'Albums'], ['artists', 'Artists']];
  const grid = h('div', { class: 'grid' }, h('div', { class: 'skeleton-row' }));
  root.replaceChildren(h('div', { class: 'page library' },
    h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Your collection'), h('h1', {}, 'Library')),
      h('div', { class: 'seg' }, tabs.map(([k, l]) => h('button', { class: k === libTab ? 'on' : '', onclick: () => { libTab = k; renderLibrary(root, ctx); } }, l)))),
    grid));
  try {
    let items = [];
    if (libTab === 'playlists') {
      const pls = await ctx.provider.myPlaylists();
      items = [h('div', { class: 'card-item liked-card', onclick: () => ctx.open('liked') },
        h('div', { class: 'card-art liked-art', html: icon.heartFill }), h('div', { class: 'card-title' }, 'Liked Songs'), h('div', { class: 'card-sub' }, 'Your favourites')),
        ...pls.map((p) => card({ image: img(p.images, p.id), title: p.name, sub: `${p.owner?.display_name || ''} · ${p.total} songs`, onOpen: () => ctx.open('playlist', p.id), onPlay: () => ctx.play({ context_uri: p.uri }) }))];
    } else if (libTab === 'albums') {
      items = (await ctx.provider.savedAlbums()).map((a) => card({ image: img(a.images, a.id), title: a.name, sub: artistNames(a), onOpen: () => ctx.open('album', a.id), onPlay: () => ctx.play({ context_uri: a.uri }) }));
    } else {
      items = (await ctx.provider.followedArtists()).map((a) => card({ image: img(a.images, a.id), title: a.name, sub: 'Artist', round: true, onOpen: () => ctx.open('artist', a.id) }));
    }
    grid.replaceChildren(...(items.length ? items : [h('p', { class: 'muted' }, 'Nothing here yet.')]));
  } catch (e) { grid.replaceChildren(h('p', { class: 'muted' }, e.message)); }
}

// ---------- Playlist / Album / Liked ----------
export async function renderCollection(root, ctx, kind, id) {
  root.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'skeleton-hero' }), h('div', { class: 'skeleton-row' })));
  let meta, tracks, playOpts;
  try {
    if (kind === 'liked') {
      const r = await ctx.provider.savedTracks(0);
      tracks = r.items;
      meta = { name: 'Liked Songs', kind: 'Collection', owner: { display_name: 'You' }, total: r.total, liked: true };
      playOpts = (i) => ({ uris: tracks.slice(0, 200).map((t) => t.uri), offset: Math.min(i, 199) });
    } else {
      ({ meta, tracks } = kind === 'album' ? await ctx.provider.album(id) : await ctx.provider.playlist(id));
      playOpts = (i) => ({ context_uri: meta.uri, offset: tracks[i]?.uri });
    }
  } catch (e) { root.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'muted' }, `Couldn't open this ${kind}: ${e.message}`))); return; }
  const total = tracks.reduce((n, t) => n + (t.duration_ms || 0), 0);
  const cover = meta.liked ? h('div', { class: 'hero-art liked-art', html: icon.heartFill }) : h('img', { class: 'hero-art', src: img(meta.images, meta.id, 640), alt: '' });
  const page = h('div', { class: 'page collection' },
    h('header', { class: 'hero' }, cover,
      h('div', { class: 'hero-meta' },
        h('div', { class: 'eyebrow' }, meta.kind),
        h('h1', { class: meta.name.length > 28 ? 'long' : '' }, meta.name),
        meta.description ? h('p', { class: 'desc', html: meta.description }) : null,
        h('div', { class: 'hero-sub' }, h('b', {}, meta.owner?.display_name || ''), ` · ${meta.total ?? tracks.length} songs · ${fmtDuration(total)}${meta.release_date ? ' · ' + meta.release_date.slice(0, 4) : ''}`),
        h('div', { class: 'hero-actions' },
          h('button', { class: 'btn primary', onclick: () => ctx.play(playOpts(0)) }, h('span', { html: icon.play }), 'Play'),
          h('button', { class: 'btn ghost', onclick: async () => { await ctx.provider.setShuffle(true).catch(() => {}); ctx.play(playOpts(Math.floor(Math.random() * tracks.length))); } }, h('span', { html: icon.shuffle }), 'Shuffle')))),
    trackList(tracks, ctx, { showAlbum: kind !== 'album', onPlay: (i) => ctx.play(playOpts(i)) }));
  root.replaceChildren(page);
}

// ---------- Artist ----------
export async function renderArtist(root, ctx, id) {
  root.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'skeleton-hero' })));
  let data;
  try { data = await ctx.provider.artist(id); } catch (e) { root.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'muted' }, e.message))); return; }
  const { artist, tracks, albums } = data;
  const banner = img(artist.images, artist.id, 640);
  root.replaceChildren(h('div', { class: 'page artist' },
    h('header', { class: 'artist-hero', style: { '--banner': `url("${banner}")` } },
      h('div', { class: 'artist-hero-bg' }),
      h('img', { class: 'artist-avatar', src: banner, alt: '' }),
      h('div', {}, h('div', { class: 'eyebrow' }, 'Artist'), h('h1', {}, artist.name),
        artist.genres?.length ? h('div', { class: 'hero-sub' }, artist.genres.slice(0, 3).join(' · ')) : null,
        h('div', { class: 'hero-actions' }, tracks.length ? h('button', { class: 'btn primary', onclick: () => ctx.play({ uris: tracks.map((t) => t.uri) }) }, h('span', { html: icon.play }), 'Play') : null))),
    tracks.length ? h('section', { class: 'shelf' }, h('h2', {}, 'Popular'), trackList(tracks.slice(0, 10), ctx, { onPlay: (i) => ctx.play({ uris: tracks.map((t) => t.uri), offset: i }) })) : null,
    shelf('Discography', albums.map((a) => card({ image: img(a.images, a.id), title: a.name, sub: `${(a.release_date || '').slice(0, 4)} · ${a.album_type === 'single' ? 'Single' : 'Album'}`, onOpen: () => ctx.open('album', a.id), onPlay: () => ctx.play({ context_uri: a.uri }) })))));
}
