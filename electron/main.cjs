'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const svc = require('./fs-service.cjs');

const isDev = !app.isPackaged && process.env.BERKAS_DEV_URL;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

/** Folder yang pernah dipilih pengguna lewat dialog sistem. Renderer tidak bisa memakai folder lain. */
const rootsFile = () => path.join(app.getPath('userData'), 'allowed-roots.json');
let allowed = new Set();
function loadRoots() {
  try {
    allowed = new Set(JSON.parse(fs.readFileSync(rootsFile(), 'utf8')));
  } catch {
    allowed = new Set();
  }
}
function saveRoots() {
  fs.mkdirSync(path.dirname(rootsFile()), { recursive: true });
  fs.writeFileSync(rootsFile(), JSON.stringify([...allowed]));
}
function requireAllowed(root) {
  if (typeof root !== 'string' || !allowed.has(root)) throw new Error('root-not-allowed');
  return root;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 360,
    minHeight: 560,
    title: 'Berkas Rapi',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !(isDev && url.startsWith(process.env.BERKAS_DEV_URL))) e.preventDefault();
  });
  if (isDev) win.loadURL(process.env.BERKAS_DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function progressSender(e) {
  return (p) => {
    if (!e.sender.isDestroyed()) e.sender.send('fs:progress', p);
  };
}

function registerIpc() {
  ipcMain.handle('fs:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Pilih folder yang ingin dirapikan',
      properties: ['openDirectory'],
      buttonLabel: 'Pilih folder ini',
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      const real = await svc.realRoot(r.filePaths[0]);
      allowed.add(real);
      saveRoots();
      return { id: real, name: path.basename(real) || real };
    } catch (e) {
      return { error: e && e.message === 'protected-root' ? `protected:${e.reason}` : 'unreadable' };
    }
  });
  ipcMain.handle('fs:openRoot', async (_e, root) => {
    try {
      if (!allowed.has(root)) return false;
      await svc.realRoot(root);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('fs:scan', (e, root, opts) => svc.scan(requireAllowed(root), opts, progressSender(e)));
  ipcMain.handle('fs:hash', (_e, root, rels, mode) => svc.hash(requireAllowed(root), rels, mode));
  ipcMain.handle('fs:apply', (_e, root, ops, ctx) =>
    svc.apply(requireAllowed(root), ops, { quarantineFolder: ctx && ctx.quarantineFolder, trashItem: (p) => shell.trashItem(p) }),
  );
  ipcMain.handle('fs:reveal', async (_e, root, rel) => {
    requireAllowed(root);
    if (rel) shell.showItemInFolder(svc.rel2abs(await svc.realRoot(root), rel));
    else await shell.openPath(root);
  });
}

if (gotLock) {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    loadRoots();
    // Tidak ada jaringan: blokir semua permintaan non-lokal dan semua izin perangkat.
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      const ok = d.url.startsWith('file://') || d.url.startsWith('devtools://') || (isDev && d.url.startsWith(process.env.BERKAS_DEV_URL)) || d.url.startsWith('data:') || d.url.startsWith('blob:');
      cb({ cancel: !ok });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
