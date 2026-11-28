// Trad Center pour ordinateur (Windows, Mac, Linux).
// Une fenêtre qui affiche le jeu en ligne : il se met donc à jour tout seul, comme sur le site. Hors connexion, la dernière version
// visitée reste disponible (le jeu garde son cache). Ici : grande fenêtre, plein écran (F11), zoom (Ctrl +/−), carte graphique à fond.
const { app, BrowserWindow, Menu, shell, session, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');

// numéro de version de l'appli : écrit dans code.json par le workflow de fabrication
let CODE = 1; try { CODE = +require('./code.json').code || 1; } catch (e) { }
const GAME = 'https://nono-rsb.github.io/trad-center/';
const HOME = GAME + '?desktop=' + CODE;

// carte graphique : on ne bride pas la 3D
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.quit();

const stateFile = () => path.join(app.getPath('userData'), 'window.json');
const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; } };
let win = null;

function create() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.w || 1440, height: st.h || 900, x: st.x, y: st.y, minWidth: 900, minHeight: 600,
    backgroundColor: '#1a1625', title: 'Trad Center', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  if (st.max !== false) win.maximize(); // plein écran de bureau par défaut : « plus gros »
  if (st.zoom) win.webContents.setZoomFactor(st.zoom);
  win.loadURL(HOME);
  // pas de connexion au premier lancement : page d'attente qui réessaie
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'));
    setTimeout(() => { if (win && !win.isDestroyed()) win.loadURL(HOME); }, 8000);
  });
  // les liens extérieurs s'ouvrent dans le navigateur, jamais dans le jeu
  const ext = u => { try { return new URL(u).origin !== new URL(GAME).origin; } catch (e) { return true; } };
  win.webContents.setWindowOpenHandler(({ url }) => { if (ext(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (ext(url) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  const save = () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getNormalBounds();
    try { fs.writeFileSync(stateFile(), JSON.stringify({ ...b, w: b.width, h: b.height, max: win.isMaximized(), zoom: win.webContents.getZoomFactor() })); } catch (e) { }
  };
  win.on('close', save); win.on('closed', () => { win = null; });
}

function shortcuts() {
  const z = d => { if (!win) return; const f = Math.max(0.5, Math.min(2.5, win.webContents.getZoomFactor() + d)); win.webContents.setZoomFactor(f); };
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r')) { win.webContents.reload(); e.preventDefault(); }
    else if (i.control && (i.key === '+' || i.key === '=')) { z(0.1); e.preventDefault(); }
    else if (i.control && i.key === '-') { z(-0.1); e.preventDefault(); }
    else if (i.control && i.key === '0') { win.webContents.setZoomFactor(1); e.preventDefault(); }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  // caméra (paiement en réalité augmentée), micro, plein écran, notifications : autorisés pour le jeu seulement
  const ok = new Set(['media', 'fullscreen', 'notifications', 'clipboard-sanitized-write', 'pointerLock', 'geolocation']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(ok.has(perm) && wc.getURL().startsWith(GAME)));
  create(); shortcuts();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) { create(); shortcuts(); } });
});
app.on('window-all-closed', () => { app.quit(); });
