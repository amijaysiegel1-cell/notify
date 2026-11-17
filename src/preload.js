const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notify', {
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  token: (force) => ipcRenderer.invoke('auth:token', force),
  authInfo: () => ipcRenderer.invoke('auth:info'),
  storeGet: (name, fallback) => ipcRenderer.invoke('store:get', name, fallback),
  storeSet: (name, value) => ipcRenderer.invoke('store:set', name, value),
  lyrics: (q) => ipcRenderer.invoke('lyrics:get', q),
  launchSpotify: () => ipcRenderer.invoke('spotify:launch'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close'),
    mini: (on) => ipcRenderer.invoke('win:mini', on),
    pin: (on) => ipcRenderer.invoke('win:pin', on),
    onState: (cb) => ipcRenderer.on('win:state', (_e, s) => cb(s))
  }
});
