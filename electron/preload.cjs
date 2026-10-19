'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
const listeners = new Set();
ipcRenderer.on('fs:progress', (_e, p) => listeners.forEach((l) => l(p)));

contextBridge.exposeInMainWorld('berkas', {
  platform,
  pickFolder: () => ipcRenderer.invoke('fs:pickFolder'),
  openRoot: (root) => ipcRenderer.invoke('fs:openRoot', root),
  scan: (root, opts) => ipcRenderer.invoke('fs:scan', root, opts),
  hash: (root, rels, mode) => ipcRenderer.invoke('fs:hash', root, rels, mode),
  apply: (root, ops, ctx) => ipcRenderer.invoke('fs:apply', root, ops, ctx),
  reveal: (root, rel) => ipcRenderer.invoke('fs:reveal', root, rel),
  onProgress: (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
});
