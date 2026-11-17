// Notify — main process
// Handles the window, Spotify login (OAuth PKCE over a loopback redirect),
// token refresh, local storage, lyrics lookups and the mini player.

const { app, BrowserWindow, ipcMain, shell, net, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const DEFAULT_CLIENT_ID = 'fb7055906c88423c80d25ff72fe1728a';
const REDIRECT_PORT = 8898;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
  'user-follow-read'
].join(' ');

let win = null;
let normalBounds = null;
let isMini = false;

// ---------- tiny JSON store in the user-data folder ----------
const dataDir = () => app.getPath('userData');
const fileFor = (name) => path.join(dataDir(), `${name}.json`);
function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(fileFor(name), 'utf8')); } catch { return fallback; }
}
function writeJSON(name, value) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const tmp = fileFor(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, fileFor(name));
    return true;
  } catch (e) { console.error('store write failed', name, e); return false; }
}
const ALLOWED_STORES = new Set(['settings', 'history', 'cache']);

// ---------- auth ----------
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const clientId = () => (readJSON('settings', {}).clientId || DEFAULT_CLIENT_ID).trim();
let authServer = null;

function loginPage(ok, msg) {
  return `<!doctype html><meta charset="utf-8"><title>Notify</title>
  <body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0b10;color:#fff;font-family:Segoe UI,system-ui,sans-serif">
  <div style="text-align:center"><div style="font-size:54px">${ok ? '✓' : '✕'}</div>
  <h2 style="font-weight:600;margin:.4em 0">${ok ? 'You\'re connected to Notify' : 'Login failed'}</h2>
  <p style="opacity:.6">${msg}</p></div></body>`;
}

function startLogin() {
  return new Promise((resolve) => {
    if (authServer) { try { authServer.close(); } catch {} authServer = null; }
    const verifier = b64url(crypto.randomBytes(64));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    let settled = false;
    const finish = (result) => {
      if (settled) return; settled = true;
      setTimeout(() => { try { authServer && authServer.close(); } catch {} authServer = null; }, 500);
      if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
      resolve(result);
    };

    authServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404); return res.end(); }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err || !code || url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(loginPage(false, err ? `Spotify said: ${err}` : 'Invalid response. Please try again.'));
        return finish({ ok: false, error: err || 'invalid_state' });
      }
      try {
        const body = new URLSearchParams({
          grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
          client_id: clientId(), code_verifier: verifier
        });
        const r = await net.fetch('https://accounts.spotify.com/api/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error_description || j.error || `HTTP ${r.status}`);
        saveTokens(j);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(loginPage(true, 'You can close this tab and head back to the app.'));
        finish({ ok: true });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(loginPage(false, String(e.message || e)));
        finish({ ok: false, error: String(e.message || e) });
      }
    });
    authServer.on('error', (e) => finish({ ok: false, error: `Could not open port ${REDIRECT_PORT}: ${e.message}` }));
    authServer.listen(REDIRECT_PORT, '127.0.0.1', () => {
      const q = new URLSearchParams({
        client_id: clientId(), response_type: 'code', redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state
      });
      shell.openExternal(`https://accounts.spotify.com/authorize?${q}`);
    });
    setTimeout(() => finish({ ok: false, error: 'Login timed out' }), 5 * 60 * 1000);
  });
}

function saveTokens(j) {
  const prev = readJSON('auth', {});
  writeJSON('auth', {
    access_token: j.access_token,
    refresh_token: j.refresh_token || prev.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 60_000,
    scope: j.scope || prev.scope
  });
}

let refreshing = null;
async function getToken(force = false) {
  const a = readJSON('auth', null);
  if (!a || !a.refresh_token) return null;
  if (!force && a.access_token && Date.now() < a.expires_at) return a.access_token;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refresh_token, client_id: clientId() });
      const r = await net.fetch('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.error === 'invalid_grant') writeJSON('auth', {});
        return null;
      }
      saveTokens(j);
      return j.access_token;
    } catch { return a.access_token || null; }
    finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

// ---------- lyrics (LRCLIB — free, open synced-lyrics database) ----------
async function fetchLyrics({ track, artist, album, duration }) {
  const UA = { 'User-Agent': 'Notify Desktop v1.0 (https://lrclib.net)' };
  const tryGet = async (url) => {
    try {
      const r = await net.fetch(url, { headers: UA });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  };
  const p = new URLSearchParams({ track_name: track, artist_name: artist });
  if (album) p.set('album_name', album);
  if (duration) p.set('duration', String(Math.round(duration)));
  let hit = await tryGet(`https://lrclib.net/api/get?${p}`);
  if (!hit || (!hit.syncedLyrics && !hit.plainLyrics)) {
    const s = new URLSearchParams({ track_name: track, artist_name: artist });
    const list = await tryGet(`https://lrclib.net/api/search?${s}`);
    if (Array.isArray(list) && list.length) {
      const scored = list
        .map((x) => ({ x, d: duration ? Math.abs((x.duration || 0) - duration) : 0 }))
        .filter(({ d }) => d < 8)
        .sort((a, b) => (!!b.x.syncedLyrics - !!a.x.syncedLyrics) || a.d - b.d);
      hit = (scored[0] || {}).x || list[0];
    }
  }
  if (!hit) return null;
  return { synced: hit.syncedLyrics || null, plain: hit.plainLyrics || null, instrumental: !!hit.instrumental };
}

// ---------- Spotify desktop launcher (used as the audio engine) ----------
function launchSpotify() {
  if (process.platform !== 'win32') { shell.openExternal('spotify:'); return true; }
  const candidates = [
    path.join(process.env.APPDATA || '', 'Spotify', 'Spotify.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'Spotify.exe')
  ];
  for (const exe of candidates) {
    try {
      if (exe && fs.existsSync(exe)) {
        const child = spawn(exe, ['--minimized'], { detached: true, stdio: 'ignore' });
        child.unref();
        return true;
      }
    } catch {}
  }
  shell.openExternal('spotify:');
  return true;
}

// ---------- window ----------
function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 980, minHeight: 640,
    frame: false, backgroundColor: '#0a0a0f', show: false,
    titleBarStyle: 'hidden',
    icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false
    }
  });
  const devQuery = process.env.NOTIFY_DEV_QUERY; // e.g. "demo&np" for previews
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), devQuery ? { search: devQuery } : undefined);
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^spotify:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

function setMini(on) {
  if (!win || on === isMini) return isMini;
  isMini = on;
  if (on) {
    normalBounds = win.getBounds();
    if (win.isMaximized()) win.unmaximize();
    win.setMinimumSize(340, 120);
    win.setBounds({ width: 400, height: 132, x: normalBounds.x + normalBounds.width - 420, y: normalBounds.y + 20 });
    win.setAlwaysOnTop(true, 'floating');
    win.setResizable(false);
  } else {
    win.setResizable(true);
    win.setAlwaysOnTop(false);
    win.setMinimumSize(980, 640);
    if (normalBounds) win.setBounds(normalBounds);
  }
  return isMini;
}

// ---------- IPC ----------
ipcMain.handle('auth:login', () => startLogin());
ipcMain.handle('auth:logout', () => { writeJSON('auth', {}); return true; });
ipcMain.handle('auth:token', (_e, force) => getToken(!!force));
ipcMain.handle('auth:info', () => ({ redirectUri: REDIRECT_URI, clientId: clientId(), defaultClientId: DEFAULT_CLIENT_ID }));
ipcMain.handle('store:get', (_e, name, fallback) => ALLOWED_STORES.has(name) ? readJSON(name, fallback) : fallback);
ipcMain.handle('store:set', (_e, name, value) => ALLOWED_STORES.has(name) ? writeJSON(name, value) : false);
ipcMain.handle('lyrics:get', (_e, q) => fetchLyrics(q || {}));
ipcMain.handle('spotify:launch', () => launchSpotify());
ipcMain.handle('open:external', (_e, url) => { if (/^(https?|spotify):/.test(url)) shell.openExternal(url); });
ipcMain.handle('win:minimize', () => win && win.minimize());
ipcMain.handle('win:maximize', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.handle('win:close', () => win && win.close());
ipcMain.handle('win:mini', (_e, on) => setMini(!!on));
ipcMain.handle('win:pin', (_e, on) => { if (win) win.setAlwaysOnTop(!!on, 'floating'); return !!on; });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
