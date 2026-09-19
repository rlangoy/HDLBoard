# Windows Installer — Implementation Work Orders

Audience: an implementing agent (human or AI) doing the actual work.
Companion to `implementation_plan_win_installer.md` — that file explains
*why*; this file is *what to do, in order*, with concrete paths,
commands, and pass/fail gates.

Repo root: `de1soc_Simulator/`.

> **Status: done** — branch `windows-installer`. Kept for the reasoning
> and the gate definitions. Two snippets below are now known to be wrong;
> following them verbatim reproduces bugs that were already fixed:
>
> - **WO-2** says to pass `''` as the `pacingFile` argument. Do not pass
>   it at all — GHDL rejects an empty generic value with `missing value in
>   generic override option`. `startPersistentRun` omits the flag instead.
> - **WO-3's `isMainModule` line** never matches on Windows: `argv[1]` is
>   `C:\…` while `import.meta.url` is `file:///C:/…`. Use
>   `pathToFileURL(process.argv[1]).href`.
>
> Also missing from these orders: `renameSync` over a file another process
> holds open is `EPERM` on Windows, which hits `writeStimQueue` constantly
> under load (1584 times in a 15 s stress run). See `session.ts`.
>
> WO-12 is the only work order not fully closed — the Linux paced-timing
> check and the clean-VM pass still need their own machines.

**Revised after a source review.** Five findings (plan §0) reordered
this list and deleted one work order outright. If you have seen an
earlier version of this file: the licensing work order is gone (already
done in the repo), and three work orders now precede any packaging work.

## Ground rules

1. **Decisions in the plan are final** — Electron, GPL-2.0-only,
   per-user install, unpaced-on-Windows. Implement, don't re-litigate.
2. **Phase gates are hard stops.** Each phase below ends with a gate
   verified *by running code*, not by inspection. Do not start the next
   phase on a failed gate.
3. **Plan §7's "must keep working" list is a constraint.** Any work
   order touching `server/` re-runs: root `npm run build`, `cd server &&
   npm run build`, and a `./start.sh` → simulate → `./stop.sh` smoke
   test on Linux. Fix regressions in the work order that caused them.
4. **Proceed on documented defaults** (GHDL 5.0.1 mcode win64,
   dependency pins, minor config-key renames). Note the choice; don't
   stop to ask.
5. **Stop and ask a human** for: anything changing behaviour outside
   these work orders' scope, a Phase 0 finding that suggests the whole
   approach is unviable, or a step needing a Windows machine you don't
   have.
6. **One commit per work order**, message prefixed `WO-<n>:`.
7. **Never touch** `src/**` — plan finding F2's whole design exists to
   keep the renderer unmodified. If you find yourself editing it, stop:
   something upstream is wrong.

---

# Phase 0 — Windows viability (gate)

No Electron. No `winInstaller/`. Find out whether the thing runs at all.

## WO-0 — Preconditions

- `git status` clean; if not, stop and ask.
- A **Windows machine** with Node 18+ and native GHDL (mcode) on `PATH`;
  `ghdl --version` must work. Phase 0 cannot be faked from Linux — if
  unavailable, stop here and say so.
- Confirm the same repo builds on the Linux/dev machine first, so
  "broken on Windows" means something.

## WO-1 — Run the existing app, unmodified, on Windows

```
npm ci && npm run build
cd server && npm ci && npm run build && cd ..
node server/dist/server.js          # terminal 1
npx vite preview --port 5173 --host # terminal 2
```

Open `http://localhost:5173/`, load a sample design, press Start.

Record **every** failure, not just the first. Expected first failure is
`ENOENT: mkfifo` from `session.ts:288` (plan F1). Also probe explicitly:

- `mkdtempSync`/`tmpdir()` session directories — created and cleaned up?
- Path separators reaching GHDL's argv — does `ghdl -a` accept them?
- `ghdl -a`/`-e`/`-r` output format under mcode Windows — does
  `portDetect.ts`/error parsing still match?
- Killing the backend — any orphaned `ghdl.exe` in Task Manager?
- **Opportunistic, cheap:** can GHDL's VHDL `file_open(..., read_mode)`
  open a Windows named pipe (`\\.\pipe\test`) created via Node's `net`
  module, and does `readline` block on it? A yes is the future upgrade
  path for pacing; a no costs five minutes. Record either way.

**Gate:** a written list of every platform break. This work order does
not fix anything.

## WO-2 — Make it simulate on Windows (pacing off)

Minimal change to reach the gate, in `server/src/session.ts`:

- Guard the pacing setup on platform:
  ```ts
  const paced = process.platform !== 'win32';
  ```
- When not paced: skip `execFileSync('mkfifo', …)` and the
  `openSync(…, O_RDWR | O_NONBLOCK)`, leave `pacingFd` null, pass `''`
  as the `pacingFile` argument to `startPersistentRun`, and skip
  `startPacing()`.
- On POSIX, the code path must be **byte-identical to today**.

The generated testbench needs no change: `tbTemplate.ts:172-186` already
guards on `pacing_file'length > 0`.

**Gate (both platforms):**
- Windows: sample design simulates end-to-end in a browser; switches
  drive `LEDR`/`HEX`; no error; stopping leaves no orphaned `ghdl.exe`.
- Linux: `./start.sh` → simulate → `./stop.sh` unchanged, **and** pacing
  still real-time (a slow divider still takes real seconds — this is the
  regression that matters most; verify by watching a clock, not by
  reading the diff).

**If this gate fails, stop.** Everything downstream assumes it passed.

---

# Phase 1 — Backend API surface

Three additive changes. Still no Electron.

## WO-3 — `export startBackend()`, preserve the script entry

`server/src/server.ts`. Wrap the top-level code in:

```ts
export function startBackend(opts: {
  port?: number;
  ghdlExe?: string;
  serveDir?: string;      // set by Electron (WO-5); unset = today's behaviour
  maxSessions?: number;
} = {}): { stop(): void }
```

`process.env` stays the default for anything not passed. Keep:

```ts
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) startBackend({});
```

Move the `process.on('SIGTERM'|'SIGINT')` registrations **inside** that
guard — Electron calls `stop()` via its own lifecycle and must not get
process-wide handlers it never sends. `stop()` must perform exactly
today's `shutdown()` teardown (every session destroyed, `wss.close()`).

**Gate:** `node server/dist/server.js` logs and behaves identically;
`./start.sh`/`./stop.sh` unchanged; Ctrl-C still kills in-flight `ghdl`
children (check the process list — this is the incident
`ghdl_implementation_plan.md` §5.10 documents, so verify it, don't
assume). Plus: a throwaway script calling `startBackend({}).stop()`
exits cleanly with no hanging handles — then delete the script.

## WO-4 — Resolve the GHDL executable (6 sites)

Plan F4 confirmed these; update all of them.

In `server/src/ghdl.ts`:
```ts
let ghdlExe = process.env.GHDL_EXE ?? 'ghdl';
export function setGhdlExe(p: string): void { ghdlExe = p; }
```
- `ghdl.ts:94` and `ghdl.ts:166` — replace the `'ghdl'` literals.
- `session.ts:195`, `:234`, `:241`, `:420` — these call
  `runCmd('ghdl', …)`, which already parameterizes the command; pass the
  resolved exe instead of the literal.
- `startBackend()` calls `setGhdlExe(opts.ghdlExe ?? process.env.GHDL_EXE ?? 'ghdl')`
  before anything can spawn.

**Gate:** with `GHDL_EXE` unset, behaviour is unchanged on both
platforms (re-run WO-2's gate). With `GHDL_EXE` set to an absolute path,
that path is the one actually used — verify once with temporary logging,
then remove the logging.

## WO-5 — Serve the frontend over HTTP, one port (plan F2)

This is the work order that makes Electron possible without touching
`src/**`. In `server/src/server.ts`:

- Create an `http.createServer()` that serves static files from
  `opts.serveDir` when set (index.html, hashed assets, correct MIME
  types; `vite.config.ts` already sets `base: './'` so relative paths
  resolve).
- Construct `WebSocketServer({ noServer: true })` and handle the
  server's `upgrade` event for path `/ghdlsim`, rejecting others.
- Listen on `127.0.0.1:<port>` when `serveDir` is set (desktop, loopback
  only); keep today's `0.0.0.0` bind and WS-only behaviour when it isn't
  (LAN mode must not regress).

**Gate:** `startBackend({ serveDir: '<repo>/dist', port: 9010 })`, then a
plain browser at `http://127.0.0.1:9010/` loads the Workbench and
simulates a design over `ws://127.0.0.1:9010/ghdlsim` — **with no
Electron involved**. Separately, `./start.sh` still works in two-port
LAN mode. Proving F2's fix in a browser here means WO-6 debugs one new
thing instead of two.

---

# Phase 2 — Electron walking skeleton

Throwaway quality on purpose. No electron-builder, no asar, no icon, no
bundling, no `electron-builder.yml`.

## WO-6 — Minimal `main.js`, dev mode only

Create `winInstaller/electron/` with a `package.json` (just `electron`
as a devDep, `"main": "main.js"`) and:

```js
const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const PORT = 9010;
let backend = null;

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..', '..');
  try {
    const mod = await import(`file://${path.join(root, 'server', 'dist', 'server.js')}`);
    backend = mod.startBackend({
      port: PORT,
      serveDir: path.join(root, 'dist'),
      ghdlExe: 'ghdl',            // PATH in dev; bundled path comes in WO-8
    });
  } catch (err) {
    dialog.showErrorBox('Backend failed to start', String(err));
    app.quit();
    return;
  }
  new BrowserWindow({ width: 1400, height: 900 }).loadURL(`http://127.0.0.1:${PORT}/`);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => backend?.stop());
```

Run with `npx electron .` after building root and `server/`.

**Gate — this is the architecture proof:** a real design simulates
inside the Electron window (switches → `LEDR`/`HEX` via actual GHDL),
and quitting leaves no `ghdl.exe` behind. Everything after this is
packaging. If this gate fails, do not proceed to Phase 3 — diagnose
here, where there are only three moving parts.

---

# Phase 3 — Packaging

## WO-7 — esbuild-bundle the backend (plan F3)

`extraResources` sits outside `app.asar`, so a backend shipped there
cannot resolve `ws` from inside the archive. Bundle it:

```
npx esbuild server/dist/server.js --bundle --platform=node \
  --format=cjs --external:electron \
  --outfile=winInstaller/electron/resources/backend.cjs
```

Add `esbuild` to `winInstaller/electron/package.json`'s devDependencies.
If CJS output fights the ESM source, `--format=esm --outfile=backend.mjs`
is the fallback — either is fine, since the bundle is outside the asar
and `import.meta.url` resolves normally there.

**Gate:** `node winInstaller/electron/resources/backend.cjs` starts
standalone (proving `ws` is genuinely inlined), and WO-6's skeleton still
works when pointed at the bundle instead of `server/dist/server.js`.

## WO-8 — Full `main.js`, packaged-path aware

Extend WO-6's file:

- `resolvePaths()` keyed on `app.isPackaged`:
  - packaged → `process.resourcesPath` + `frontend` / `backend.cjs` /
    `ghdl/bin/ghdl.exe`
  - dev → repo `dist/`, the esbuild bundle, and `'ghdl'` from `PATH`
    (**not** the vendored Windows binary — that path doesn't exist on a
    Linux dev box)
- Port-in-use handling (plan F2): catch `EADDRINUSE` and show a dialog
  naming the likely cause ("port 9010 is already in use — is
  `start.sh` or another copy of the app running?"). No retry loop: the
  port is baked into the frontend bundle at build time and cannot move.
- Log to `app.getPath('userData')/logs/backend.log`, plus a
  `Help → Open Logs Folder` menu item.

**Gate:** dev mode still passes WO-6's gate; the port-in-use dialog
actually appears when 9010 is occupied.

## WO-9 — `electron-builder.yml` + `build.ps1`

Config per plan §6 (`extraResources` for `frontend`, `backend.cjs`,
`ghdl`; `win.target: nsis`; `nsis.oneClick: false`,
`perMachine: false`, `allowToChangeInstallationDirectory: true`;
`directories.output: ../output`). Use a placeholder `icon.ico` if no
artwork exists — flag it, don't block.

`build.ps1` runs the plan §2 build flow in order: root build → server
build → `npm ci` in `electron/` → esbuild bundle → repopulate
`resources/` → `npx electron-builder --win`. `$ErrorActionPreference =
"Stop"`, and fail loudly rather than continuing past a broken step.

GHDL may be manually unpacked into `resources/ghdl/` at this stage —
WO-10 makes it reproducible.

**Gate (Windows):** `Setup.exe` is produced, installs with no admin
prompt, launches, simulates a design, and uninstalls cleanly.

---

# Phase 4 — Vendoring, compliance, release

## WO-10 — `fetch-ghdl.ps1`

Downloads the official `ghdl/ghdl` **v5.0.1 mcode win64** release asset
(confirm exact asset name at the release page — naming varies by
version), verifies a pinned SHA-256 and fails loudly on mismatch,
unpacks to `winInstaller/vendor/ghdl/`, preserves the release's `COPYING`
unmodified, writes `VERSION.txt` with the exact tag, and is idempotent
(skip if `VERSION.txt` matches, unless `-Force`).

Add `winInstaller/.gitignore`: `vendor/`, `electron/node_modules/`,
`electron/resources/`, `output/`.

**Gate:** on a clean clone, `fetch-ghdl.ps1` then `build.ps1` produces a
working installer with zero manual steps; `git status` shows nothing
under `vendor/`.

## WO-11 — License page (GHDL attribution)

The Workbench's own licensing is **already done** — `LICENSE` at root,
`SPDX-License-Identifier: GPL-2.0-only` in all 43 source files, both
`package.json` files set. **Verify only; add nothing.** Any new file you
create gets the same `GPL-2.0-only` identifier (note: not bare
`GPL-2.0`).

Outstanding work is GHDL attribution. Write
`winInstaller/electron/build/license.txt`:
- Short GPL-2.0-only notice for the Workbench, referencing `LICENSE`.
- A clearly separate section: GHDL `<VERSION.txt>`, © the GHDL
  contributors, GPL-2.0, source at `https://github.com/ghdl/ghdl` at that
  tag, license text installed at `<install dir>\ghdl\COPYING`.

Wire `nsis.license: build/license.txt`; confirm `COPYING` really lands
next to `ghdl.exe` so the reference is true.

**Gate:** the NSIS wizard shows this text before installing; after
install, `<install dir>\ghdl\COPYING` exists.

## WO-12 — Clean-VM test pass

Clean Windows VM, no Node/GHDL/WSL, standard non-admin account. Run
plan §9's checklist in full, including the unpaced-timing check and the
port-collision dialog. Record SmartScreen's exact wording for WO-13.

On the dev machine: re-run every plan §7 item, including **paced timing
on POSIX** — the regression Phase 0's fix most endangers.

**Gate:** every box checked. Failures become their own scoped work
orders, not inline patches.

## WO-13 — README

Add a "Windows installer" section: download, install (no admin;
SmartScreen wording from WO-12), first launch, `Help → Open Logs
Folder`, uninstall. **Document the unpaced-on-Windows behaviour** (plan
F1) — students will otherwise see a `CLOCK_500Hz` design blink faster
than on the lab's Linux setup and reasonably think it's broken. Leave
the existing WSL2/native-GHDL developer instructions intact.

**Gate:** both paths documented; nothing existing removed.

---

## Definition of done

- `Setup.exe` installs, simulates, and uninstalls on a clean non-admin
  Windows account.
- Plan §7's list verified working, including paced POSIX timing.
- GHDL's GPL-2.0 attribution shipped and accurate.
- README covers the installer *and* the Windows timing caveat.
- `src/**` untouched.

## If you get stuck

Proceed on judgment for: dependency pins, config-key renames, asset
naming, anything the plan calls a default. Stop and ask for: a Phase 0
result suggesting the approach is unviable, a change reaching outside
these work orders, or a Windows-only gate you have no Windows machine to
run.
