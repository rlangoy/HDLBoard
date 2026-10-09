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
 * `ws://…:9010/hdlsim` URL comes out malformed.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

/**
 * Fixed, not ephemeral. The renderer reads its WebSocket port from a Vite
 * build-time constant (`VITE_HDL_WS_PORT`, defaulting to 9010), so the
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
      preload: path.join(res, 'preload.js'),
      // GHDL's own tree, the program in bin\.
      ghdlDir: path.join(res, 'ghdl'),
      // The flat Icarus tree; the backend runs it with -B/-M.
      iverilogDir: path.join(res, 'iverilog'),
    };
  }
  const repo = path.join(__dirname, '..', '..');
  return {
    frontend: path.join(repo, 'dist'),
    backend: path.join(repo, 'server', 'dist', 'server.js'),
    preload: path.join(__dirname, 'preload.js'),
    // Dev: GHDL_DIR / GHDL_EXE / IVERILOG_DIR / IVERILOG_EXE / VVP_EXE or PATH,
    // resolved by the backend itself.
    ghdlDir: undefined,
    iverilogDir: undefined,
  };
}

/**
 * The simulator locations the installer wrote into the shortcut
 * (`--iverilog-dir`, `--ghdl-dir`, `--ghdl-exe` — the backend's own flags,
 * parsed by the backend's own parser). A flag wins over the default above;
 * with none, an installed app still finds its bundled trees beside itself.
 *
 * The chosen directories are also exported as IVERILOG_DIR / GHDL_DIR, so
 * anything that reads the environment agrees with what the backend runs.
 */
function applyToolArgs(paths, parseToolArgs) {
  const parsed = parseToolArgs(process.argv.slice(1), { strict: false });
  if (!parsed.ok) throw new Error(`bad command line: ${parsed.error}`);
  const { iverilogDir, ghdlDir, ghdlExe } = parsed.args;
  if (iverilogDir) paths.iverilogDir = iverilogDir;
  if (ghdlDir) paths.ghdlDir = ghdlDir;
  if (ghdlExe) {
    paths.ghdlExe = ghdlExe;
    // An explicit program beats the bundled default directory, which would otherwise win.
    if (!ghdlDir) paths.ghdlDir = undefined;
  }
  if (paths.iverilogDir) process.env.IVERILOG_DIR = paths.iverilogDir;
  if (paths.ghdlDir) process.env.GHDL_DIR = paths.ghdlDir;
  // The backend ranks GHDL_DIR above an explicit program; an inherited one must not win.
  else if (ghdlExe) delete process.env.GHDL_DIR;
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

/**
 * Project storage ("persistProjects") is opt-in and desktop-only. The
 * flag is resolved once, at startup, each layer overriding the last:
 *
 *   1. off — the source default, so a dev run (`npm start`) stores nothing;
 *   2. resources/settings.default.json — shipped only in the packaged app,
 *      which is how the installer build turns the feature on without
 *      writing anything into a user's profile at install time;
 *   3. <userData>/settings.json — the user's own choice from Settings.
 *
 * Changing it applies on the next launch: the preload's API and the IPC
 * handlers below are fixed for the life of the window.
 */
function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function userSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function resolvePersistProjects() {
  let enabled = false;
  if (app.isPackaged) {
    const shipped = readJson(path.join(process.resourcesPath, 'settings.default.json'));
    if (typeof shipped.persistProjects === 'boolean') enabled = shipped.persistProjects;
  }
  const user = readJson(userSettingsPath());
  if (typeof user.persistProjects === 'boolean') enabled = user.persistProjects;
  return enabled;
}

/*
 * The window reopens where and how large it was left. The renderer
 * remembers its divider positions in pixels, so the window's own size has
 * to come back too, or those widths get re-clamped to a different window.
 */
const DEFAULT_WINDOW = { width: 1500, height: 950 };

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

/** The stored bounds, or the defaults when they are missing or no longer on any screen. */
function loadWindowState() {
  const s = readJson(windowStatePath());
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!num(s.x) || !num(s.y) || !num(s.width) || !num(s.height)) return { ...DEFAULT_WINDOW, maximized: false };
  const bounds = { x: s.x, y: s.y, width: s.width, height: s.height };
  // A monitor that has since been unplugged would put the window off-screen.
  const area = screen.getDisplayMatching(bounds).workArea;
  const visible =
    bounds.x < area.x + area.width - 50 && bounds.x + bounds.width > area.x + 50 &&
    bounds.y >= area.y - 10 && bounds.y < area.y + area.height - 50;
  if (!visible) return { ...DEFAULT_WINDOW, maximized: s.maximized === true };
  return { ...bounds, maximized: s.maximized === true };
}

function saveWindowState(win) {
  try {
    // getNormalBounds: the un-maximized size, so un-maximizing later restores it.
    const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(windowStatePath(), JSON.stringify(state));
  } catch (err) {
    console.error(`could not save window state: ${err}`);
  }
}

/** Saved projects never go near $INSTDIR: an update or uninstall would take them with it. */
function projectsDir() {
  return path.join(app.getPath('userData'), 'projects');
}

/**
 * The one place a stored file's path is built. Names are fixed today
 * (`workspace.json`), but the check stays so a future named-project
 * feature cannot walk out of the projects folder by accident.
 */
function projectFile(name) {
  const base = projectsDir();
  const file = path.resolve(base, path.basename(name));
  if (path.dirname(file) !== path.resolve(base)) throw new Error(`invalid project file name: ${name}`);
  return file;
}

const WORKSPACE_FILE = 'workspace.json';
// Generous for source text; a cap only so a runaway renderer cannot fill the disk.
const MAX_WORKSPACE_BYTES = 16 * 1024 * 1024;

/** Only the app's own page may use these — never a frame from anywhere else. */
function fromApp(event) {
  const url = event.senderFrame ? event.senderFrame.url : '';
  if (!url.startsWith(`http://127.0.0.1:${PORT}/`)) throw new Error(`IPC refused from ${url}`);
}

// Open Project / Save project by path: only project and source files, only by a full
// path, and only text of a sensible size.
const LOCAL_FILE_EXTENSIONS = ['.json', '.vhd', '.vhdl', '.v', '.vh'];

function localFilePath(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error(`not a full path: ${filePath}`);
  const resolved = path.resolve(filePath);
  if (!LOCAL_FILE_EXTENSIONS.includes(path.extname(resolved).toLowerCase())) {
    throw new Error(`only ${LOCAL_FILE_EXTENSIONS.join(' ')} files can be opened or saved: ${resolved}`);
  }
  return resolved;
}

function registerLocalFileIpc() {
  ipcMain.handle('hdlboard:read-local-file', (event, filePath) => {
    fromApp(event);
    const file = localFilePath(filePath);
    if (fs.statSync(file).size > MAX_WORKSPACE_BYTES) throw new Error(`too large: ${file}`);
    return fs.readFileSync(file, 'utf8');
  });

  ipcMain.handle('hdlboard:write-local-file', (event, filePath, text) => {
    fromApp(event);
    const file = localFilePath(filePath);
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_WORKSPACE_BYTES) {
      throw new Error('file rejected: not a string, or too large');
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    return true;
  });
}

/**
 * The GitHub sign-in (docs/GITHUB.md), kept so the student is not asked to sign in
 * at every start. Encrypted with safeStorage — on Windows that is DPAPI, so only
 * this Windows user on this computer can read it back — and never written in
 * plain text: without encryption the token is simply not kept.
 */
const GITHUB_TOKEN_FILE = 'github-token.bin';
// A GitHub token is well under 1 KB; anything larger is not one.
const MAX_GITHUB_TOKEN_LENGTH = 1024;

function githubTokenPath() {
  return path.join(app.getPath('userData'), GITHUB_TOKEN_FILE);
}

function loadGitHubToken() {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(githubTokenPath()));
  } catch {
    return null; // none stored, or stored by another Windows user: sign in again
  }
}

function saveGitHubToken(token) {
  if (typeof token !== 'string' || token === '' || token.length > MAX_GITHUB_TOKEN_LENGTH) throw new Error('not a GitHub token');
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.mkdirSync(path.dirname(githubTokenPath()), { recursive: true });
  fs.writeFileSync(githubTokenPath(), safeStorage.encryptString(token));
  return true;
}

function forgetGitHubToken() {
  fs.rmSync(githubTokenPath(), { force: true });
  return true;
}

function registerGitHubTokenIpc() {
  ipcMain.handle('hdlboard:load-github-token', (event) => {
    fromApp(event);
    return loadGitHubToken();
  });
  ipcMain.handle('hdlboard:save-github-token', (event, token) => {
    fromApp(event);
    return saveGitHubToken(token);
  });
  ipcMain.handle('hdlboard:forget-github-token', (event) => {
    fromApp(event);
    return forgetGitHubToken();
  });
}

function registerIpc(persistProjects) {
  registerLocalFileIpc();
  registerGitHubTokenIpc();

  ipcMain.handle('hdlboard:set-enabled', (event, value) => {
    fromApp(event);
    const file = userSettingsPath();
    const settings = readJson(file);
    settings.persistProjects = value === true;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    console.log(`persistProjects set to ${settings.persistProjects} (applies after restart)`);
    return settings.persistProjects;
  });

  // Off means no handlers at all, matching the preload exposing no methods.
  if (!persistProjects) return;

  ipcMain.handle('hdlboard:save-workspace', (event, json) => {
    fromApp(event);
    if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_WORKSPACE_BYTES) {
      throw new Error('workspace rejected: not a string, or too large');
    }
    JSON.parse(json); // refuse to store anything that would not load back
    const file = projectFile(WORKSPACE_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write-then-rename, so a crash mid-save leaves the previous copy intact.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
    return true;
  });

  ipcMain.handle('hdlboard:load-workspace', (event) => {
    fromApp(event);
    try {
      return fs.readFileSync(projectFile(WORKSPACE_FILE), 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  });
}

function showPortInUseDialog() {
  dialog.showErrorBox(
    `Port ${PORT} is already in use`,
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
  applyToolArgs(paths, mod.parseToolArgs);
  console.log(`ghdl:     ${paths.ghdlDir ?? paths.ghdlExe ?? '(dev: GHDL_DIR / GHDL_EXE / PATH)'}`);
  console.log(`iverilog: ${paths.iverilogDir ?? '(dev: IVERILOG_DIR / PATH)'}`);
  const handle = mod.startBackend({
    port: PORT,
    serveDir: paths.frontend,
    ghdlDir: paths.ghdlDir,
    ghdlExe: paths.ghdlExe,
    iverilogDir: paths.iverilogDir,
    // One window, one user, one machine: the multi-student bound that
    // matters on a shared LAN server is irrelevant here.
    maxSessions: 4,
  });
  // `listen()` reports a busy port (EADDRINUSE) asynchronously, after
  // `startBackend` has returned; `ready` is where it surfaces, so the caller's
  // try/catch sees it like any other startup failure.
  await handle.ready;
  return handle;
}

app.whenReady().then(async () => {
  const logPath = initLogging();
  const paths = resolvePaths();
  console.log(`frontend: ${paths.frontend}`);
  console.log(`backend:  ${paths.backend}`);

  const persistProjects = resolvePersistProjects();
  console.log(`persistProjects: ${persistProjects}`);
  registerIpc(persistProjects);

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

  const windowState = loadWindowState();
  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'HDLBoard — Write VHDL or Verilog and watch it run',
    show: false,
    webPreferences: {
      // The renderer is a plain web app talking over a WebSocket; it has
      // no need for Node, and giving it none keeps that true.
      nodeIntegration: false,
      contextIsolation: true,
      // window.hdlboard — see preload.js. The switch is how the preload
      // learns whether project storage is on this launch.
      preload: paths.preload,
      additionalArguments: persistProjects ? ['--hdlboard-persist'] : [],
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (windowState.maximized) mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('close', () => saveWindowState(mainWindow));
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
