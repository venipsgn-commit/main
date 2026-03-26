'use strict';

const { app, BrowserWindow, shell, Tray, Menu, nativeImage } = require('electron');
const path   = require('path');
const { fork } = require('child_process');
const http   = require('http');

const PORT = 3000;
const URL  = `http://localhost:${PORT}`;

let mainWindow = null;
let tray       = null;
let serverProc = null;

// Chemin des ressources (différent en mode packagé)
const APP_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'app')
  : __dirname;

// ── Démarrer le serveur Express ───────────────────────────────────────────────
function startServer() {
  return new Promise((resolve) => {
    const serverPath = path.join(APP_DIR, 'server.js');

    serverProc = fork(serverPath, [], {
      env: {
        ...process.env,
        PORT:        String(PORT),
        VENIPS_DATA: app.getPath('userData')   // DB stockée dans les données utilisateur
      },
      silent: true,
      cwd: APP_DIR
    });

    serverProc.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
    serverProc.stderr?.on('data', d => console.error('[server]', d.toString().trim()));
    serverProc.on('error', err => console.error('[server] erreur:', err));

    // Attendre que le serveur réponde (max 15s)
    const check = setInterval(() => {
      http.get(URL, (res) => {
        if (res.statusCode < 500) { clearInterval(check); resolve(); }
      }).on('error', () => {});
    }, 300);

    setTimeout(() => { clearInterval(check); resolve(); }, 15000);
  });
}

// ── Créer la fenêtre principale ───────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(APP_DIR, 'logo.svg');

  mainWindow = new BrowserWindow({
    width:     1280,
    height:    820,
    minWidth:  900,
    minHeight: 600,
    title:     'VENIPS – Gestion Commerciale',
    icon:      iconPath,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true
    },
    show:            false,
    backgroundColor: '#0f172a'
  });

  // Supprimer le menu natif (pas nécessaire pour cette app)
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadURL(URL);

  // Afficher seulement quand la page est chargée
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Ouvrir les liens externes dans le vrai navigateur
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimiser dans la barre des tâches au lieu de fermer
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Icône dans la barre système ───────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(APP_DIR, 'logo.svg');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('VENIPS – Gestion Commerciale');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir VENIPS',
      click: () => { mainWindow?.show(); mainWindow?.focus(); }
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => { app.isQuiting = true; app.quit(); }
    }
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── Écran de chargement ───────────────────────────────────────────────────────
function createSplash() {
  const splash = new BrowserWindow({
    width:  400,
    height: 300,
    frame:  false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: { nodeIntegration: false }
  });

  splash.loadURL(`data:text/html,
    <html>
    <body style="margin:0;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:white;border-radius:12px">
      <div style="font-size:48px;margin-bottom:16px">🏪</div>
      <h2 style="margin:0 0 8px;font-size:22px">VENIPS</h2>
      <p style="margin:0;opacity:.6;font-size:14px">Démarrage en cours...</p>
      <div style="margin-top:24px;width:200px;height:4px;background:rgba(255,255,255,.1);border-radius:99px">
        <div style="width:60%;height:100%;background:#00d4c4;border-radius:99px;animation:load 1.5s infinite"></div>
      </div>
      <style>@keyframes load{0%{width:0%}100%{width:100%}}</style>
    </body></html>
  `);

  return splash;
}

// ── Cycle de vie de l'app ────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const splash = createSplash();

  await startServer();

  splash.close();
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Garder l'app dans la barre système
});

app.on('activate', () => {
  mainWindow?.show();
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (serverProc) {
    try { serverProc.kill(); } catch {}
  }
});
