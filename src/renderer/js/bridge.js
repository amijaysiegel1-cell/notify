// Access to the main process. When the UI is opened in a plain browser
// (for development) a localStorage-backed shim is used instead.

const shim = {
  login: async () => ({ ok: false, error: 'Login is only available in the desktop app.' }),
  logout: async () => true,
  token: async () => null,
  authInfo: async () => ({ redirectUri: 'http://127.0.0.1:8898/callback', clientId: '', defaultClientId: '' }),
  storeGet: async (name, fallback) => { try { const v = localStorage.getItem('notify:' + name); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  storeSet: async (name, value) => { try { localStorage.setItem('notify:' + name, JSON.stringify(value)); } catch {} return true; },
  lyrics: async () => null,
  launchSpotify: async () => false,
  openExternal: async (url) => window.open(url, '_blank'),
  win: { minimize() {}, maximize() {}, close() {}, mini: async (on) => on, pin: async (on) => on, onState() {} }
};

export const bridge = window.notify || shim;
export const isDesktop = !!window.notify;
