// Settings: defaults, persistence and applying them to the interface.

import { bridge } from './bridge.js';

export const DEFAULTS = {
  clientId: '',
  theme: 'adaptive',        // adaptive | dark | light | oled
  accentMode: 'album',      // album | custom
  accent: '#ff375f',
  font: 'system',           // system | rounded | serif | mono | condensed
  radius: 14,
  glass: 0.55,              // 0 (solid) … 1 (very translucent)
  density: 'comfortable',   // comfortable | compact
  background: 'fluid',      // fluid | blur | solid
  bgSpeed: 1,
  artMotion: 'liquid',      // liquid | drift | off
  artSpeed: 1,
  lyricsSize: 36,
  lyricsAlign: 'left',      // left | center
  lyricsBlur: true,
  lyricsWordSync: true,
  npLayout: 'split',        // split | lyrics | art
  showSidebarPlaylists: true,
  reduceMotion: false,
  launchSpotify: true,
  trackHistory: true
};

export const settings = { ...DEFAULTS };
const listeners = new Set();

export async function loadSettings() {
  const saved = await bridge.storeGet('settings', {});
  Object.assign(settings, DEFAULTS, saved || {});
  apply();
  return settings;
}

let saveT;
export function setSetting(key, value) {
  settings[key] = value;
  apply();
  clearTimeout(saveT);
  saveT = setTimeout(() => bridge.storeSet('settings', { ...settings }), 250);
  listeners.forEach((fn) => fn(key, value));
}
export function onSettings(fn) { listeners.add(fn); }
export function resetSettings() {
  const keep = { clientId: settings.clientId };
  Object.assign(settings, DEFAULTS, keep);
  apply();
  bridge.storeSet('settings', { ...settings });
  listeners.forEach((fn) => fn('*'));
}

const FONTS = {
  system: '"Segoe UI Variable Display", "Segoe UI Variable Text", "SF Pro Display", -apple-system, "Segoe UI", system-ui, sans-serif',
  rounded: '"SF Pro Rounded", "Nunito", "Varela Round", "Segoe UI Variable Display", system-ui, sans-serif',
  serif: '"New York", "Iowan Old Style", "Georgia", "Cambria", serif',
  mono: '"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, monospace',
  condensed: '"Bahnschrift", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif'
};

let albumPalette = null;
export function setAlbumPalette(p) { albumPalette = p; apply(); }

export function apply() {
  const r = document.documentElement;
  const s = settings;
  const theme = s.theme === 'adaptive' ? 'dark' : s.theme;
  r.dataset.theme = theme;
  r.dataset.adaptive = s.theme === 'adaptive' ? '1' : '0';
  r.dataset.density = s.density;
  r.dataset.bg = s.background;
  r.dataset.motion = s.reduceMotion ? 'reduced' : 'full';
  r.dataset.npLayout = s.npLayout;
  r.dataset.lyricsAlign = s.lyricsAlign;
  r.style.setProperty('--font', FONTS[s.font] || FONTS.system);
  r.style.setProperty('--radius', s.radius + 'px');
  r.style.setProperty('--glass', String(s.glass));
  r.style.setProperty('--lyrics-size', s.lyricsSize + 'px');
  r.style.setProperty('--bg-speed', String(Math.max(0.1, s.bgSpeed)));
  const useAlbum = s.accentMode === 'album' && albumPalette;
  r.style.setProperty('--accent', useAlbum ? albumPalette.accent : s.accent);
  r.style.setProperty('--accent-2', useAlbum ? albumPalette.accent2 : `color-mix(in oklab, ${s.accent} 55%, #6d5cff)`);
  if (s.theme === 'adaptive' && albumPalette) r.style.setProperty('--album-bg', albumPalette.bg);
  else r.style.removeProperty('--album-bg');
}
