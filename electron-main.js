'use strict';

const { app, BrowserWindow, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path   = require('path');
const { fork } = require('child_process');
const http   = require('http');

const PORT = 3000;
const APP_URL  = `http://localhost:${PORT}`;

let mainWindow = null;
let tray       = null;
let serverProc = null;

// Chemin des ressources (différent en mode packagé)
// Note: asar:false dans package.json, donc les fichiers sont dans resources/app/
const APP_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'app')
  : __dirname;

// ── Démarrer le serveur Express ───────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
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

    let serverError = null;

    serverProc.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
    serverProc.stderr?.on('data', d => {
      const msg = d.toString().trim();
      console.error('[server]', msg);
      serverError = msg;
    });
    serverProc.on('error', err => {
      console.error('[server] erreur fork:', err);
      serverError = err.message;
    });
    serverProc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error('[server] exit code:', code);
      }
    });

    // Attendre que le serveur réponde (max 20s)
    let elapsed = 0;
    const check = setInterval(() => {
      http.get(APP_URL, (res) => {
        if (res.statusCode < 500) {
          clearInterval(check);
          resolve(true);
        }
        res.resume(); // consume response data
      }).on('error', () => {});

      elapsed += 300;
      if (elapsed >= 20000) {
        clearInterval(check);
        resolve(false); // timeout — résoudre quand même
      }
    }, 300);
  });
}

// ── Créer la fenêtre principale ───────────────────────────────────────────────
function createWindow(serverReady) {
  const iconPath = path.join(APP_DIR, 'icon.png');

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

  // Supprimer le menu natif
  mainWindow.setMenuBarVisibility(false);

  if (serverReady) {
    mainWindow.loadURL(APP_URL);
  } else {
    // Page d'erreur si le serveur n'a pas démarré
    mainWindow.loadURL(`data:text/html,
      <html><body style="margin:0;background:#0f172a;display:flex;flex-direction:column;
        align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:white">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h2 style="margin:0 0 8px">Erreur de démarrage</h2>
        <p style="opacity:.6;text-align:center;max-width:400px">
          Le serveur VENIPS n'a pas pu démarrer.<br>
          Vérifiez que le port 3000 est libre et relancez l'application.
        </p>
      </body></html>
    `);
  }

  // Afficher seulement quand la page est chargée
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Ouvrir les liens externes dans le vrai navigateur
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
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
  const iconPath = path.join(APP_DIR, 'icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();

  tray = new Tray(icon);
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
    width:       400,
    height:      300,
    frame:       false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#0f172a',
    webPreferences: { nodeIntegration: false }
  });

  splash.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html><body style="margin:0;background:%230f172a;display:flex;flex-direction:column;
      align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:white">
      <div style="font-size:56px;margin-bottom:16px">&#127978;</div>
      <h2 style="margin:0 0 8px;font-size:24px;letter-spacing:2px">VENIPS</h2>
      <p style="margin:0;opacity:.6;font-size:14px">D%C3%A9marrage en cours...</p>
      <div style="margin-top:28px;width:220px;height:4px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden">
        <div id="bar" style="width:0%;height:100%;background:%2300d4c4;border-radius:99px;transition:width .3s"></div>
      </div>
      <script>
        let w=0; const b=document.getElementById('bar');
        setInterval(()=>{ w=Math.min(w+2,95); b.style.width=w+'%'; },100);
      </script>
    </body></html>
  `);

  return splash;
}

// ── Cycle de vie de l'app ────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const splash = createSplash();

  const serverReady = await startServer();

  splash.close();
  createWindow(serverReady);
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
