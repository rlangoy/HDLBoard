// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Electron main process for the HDLBoard desktop app.
 *
 * The whole architecture is three lines of intent: start the existing
 * backend in-process, have it serve the existing frontend over loopback
 * HTTP, and point a BrowserWindow at it. Nothing is reimplemented for the
 * desktop — the renderer is `src/**` byte-for-byte, running against the
 * same WebSocket protocol it uses in a browser, because the page and the
 * socket share an origin and a port. See the plan's finding F2 for why
 * `loadFile()` cannot work here: under `file://`,
 * `window.location.hostname` is empty and the renderer's derived
 * `ws://…:9010/ghdlsim` URL comes out malformed.
 */

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

/**
 * Fixed, not ephemeral. The renderer reads its WebSocket port from a Vite
 * build-time constant (`VITE_GHDL_WS_PORT`, defaulting to 9010), so the
 * port is baked into the bundle and cannot be discovered at runtime.
 * A collision is therefore reported, not worked around — see
 * `showPortInUseDialog`.
 */
const PORT = 9010;

let backend = null;
let mainWindow = null;
let logStream = null;

/**
 * Where the three shipped pieces live, which differs entirely between a
 * checkout and an installed app. Dev deliberately uses `'ghdl'` from PATH
 * rather than the vendored Windows binary: the repo is developed on Linux
 * too, where `winInstaller/vendor/ghdl/bin/ghdl.exe` does not exist.
 */
function resolvePaths() {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    return {
      frontend: path.join(res, 'frontend'),
      backend: path.join(res, 'backend.mjs'),
      ghdlExe: path.join(res, 'ghdl', 'bin', 'ghdl.exe'),
    };
  }
  const repo = path.join(__dirname, '..', '..');
  return {
    frontend: path.join(repo, 'dist'),
    backend: path.join(repo, 'server', 'dist', 'server.js'),
    ghdlExe: process.env.GHDL_EXE ?? 'ghdl',
  };
}

/**
 * Mirrors the backend's console output into a file under `userData`, so a
 * student reporting "it won't start" has something to send. Electron has
 * no attached terminal, so without this the backend's own diagnostics —
 * GHDL paths, listen errors — go nowhere.
 */
function initLogging() {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, 'backend.log');
  logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const stamp = () => new Date().toISOString();
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      try {
        logStream.write(`${stamp()} [${level}] ${args.join(' ')}\n`);
      } catch {
        // A broken log file must never take the app down with it.
      }
    };
  }
  console.log(`--- HDLBoard ${app.getVersion()} starting (packaged=${app.isPackaged}) ---`);
  return logPath;
}

function showPortInUseDialog() {
  dialog.showErrorBox(
    'Port 9010 is already in use',
    `HDLBoard needs port ${PORT}, but something else is already listening on it.\n\n` +
      'The usual causes are:\n' +
      `  • another copy of this app is already running — look for it in the taskbar;\n` +
      `  • a development server (scripts/start.sh, or "node server/dist/server.js") is running.\n\n` +
      'Close whichever applies and start the app again.',
  );
}

function buildMenu(logPath) {
  const template = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Logs Folder',
          click: () => shell.showItemInFolder(logPath),
        },
        {
          label: 'About',
          // The dialog is the renderer's own (AboutDialog.tsx) — the same
          // one its header button opens — so the menu just asks it to
          // show. The event name is ABOUT_EVENT in src/.../project.ts.
          click: () => {
            if (mainWindow) {
              mainWindow.webContents
                .executeJavaScript("window.dispatchEvent(new CustomEvent('hdl-board:show-about'))")
                .catch(() => {});
            }
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function startBackendOrDie(paths) {
  // The backend is ESM (and so is its esbuild bundle), while this main
  // process is CommonJS — hence dynamic import, and `pathToFileURL`
  // because a bare Windows path like `C:\…` is not a valid module
  // specifier.
  const mod = await import(pathToFileURL(paths.backend).href);
  return mod.startBackend({
    port: PORT,
    serveDir: paths.frontend,
    ghdlExe: paths.ghdlExe,
    // One window, one user, one machine: the multi-student bound that
    // matters on a shared LAN server is irrelevant here.
    maxSessions: 4,
  });
}

app.whenReady().then(async () => {
  const logPath = initLogging();
  const paths = resolvePaths();
  console.log(`frontend: ${paths.frontend}`);
  console.log(`backend:  ${paths.backend}`);
  console.log(`ghdl:     ${paths.ghdlExe}`);

  buildMenu(logPath);

  try {
    backend = await startBackendOrDie(paths);
  } catch (err) {
    console.error(`backend failed to start: ${err && err.stack ? err.stack : String(err)}`);
    if (err && err.code === 'EADDRINUSE') showPortInUseDialog();
    else dialog.showErrorBox('HDLBoard could not start', `${String(err)}\n\nLog: ${logPath}`);
    app.quit();
    return;
  }

  // `listen()` reports EADDRINUSE asynchronously, so it surfaces here
  // rather than in the try/catch above — by which time `startBackend` has
  // already returned a handle quite happily.
  process.on('uncaughtException', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`port ${PORT} already in use`);
      showPortInUseDialog();
      app.quit();
      return;
    }
    console.error(`uncaught: ${err && err.stack ? err.stack : String(err)}`);
  });

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'HDLBoard — Write VHDL and watch it run',
    show: false,
    webPreferences: {
      // The renderer is a plain web app talking over a WebSocket; it has
      // no need for Node, and giving it none keeps that true.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Links in the app (the About and Settings dialogs point at GitHub)
  // belong in the user's own browser. Left alone, Electron would open them
  // in a second app window — or navigate this one away from HDLBoard.
  const openInBrowser = (url) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}/`)) {
      event.preventDefault();
      openInBrowser(url);
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
  console.log('window loaded');
});

app.on('window-all-closed', () => app.quit());

/**
 * The backend's GHDL children are the reason this matters: the persistent
 * simulation loops forever by design (§ 5), so nothing ends it on its own
 * and a missed teardown leaves `ghdl.exe` spinning at 100 % CPU after the
 * window is gone.
 */
app.on('before-quit', () => {
  if (backend) {
    console.log('stopping backend');
    backend.stop();
    backend = null;
  }
  if (logStream) logStream.end();
});
