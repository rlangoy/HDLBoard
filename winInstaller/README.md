# Windows installer

Packages HDLBoard as an Electron desktop app and builds
a single NSIS `Setup.exe` that bundles the frontend, the backend, and
GHDL itself — so a student needs nothing preinstalled and no
administrator rights.

Everything here is **additive**. `npm run dev`, `npm run build`,
`./scripts/start.sh`/`./scripts/stop.sh`, LAN access, `#gallery` and `npm run demo` all
behave exactly as they did before.

## Building

On Windows, with Node 18+:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File winInstaller\build.ps1
```

Run it from the repository root (`HDLBoard`).
`-ExecutionPolicy Bypass` avoids the "running scripts is disabled on this
system" error; plain `winInstaller\build.ps1` does the same where scripts
are allowed. Close a running HDLBoard first — it locks files the build
overwrites.

Output lands in `winInstaller\output\HDLBoard-Setup-<version>.exe`
(~89 MB; ~324 MB installed).

| Flag | Effect |
|---|---|
| `-SkipAppBuild` | Reuse the existing `dist/` and `server/dist/` — for iterating on packaging alone. |
| `-CleanInstall` | Wipe and reinstall `electron/node_modules`. |

`build.ps1` runs `fetch-ghdl.ps1` automatically the first time. That
script downloads the pinned GHDL release, **verifies its SHA-256 and
refuses to unpack on a mismatch**, and is idempotent afterwards (re-run
with `-Force` to refetch).

## How it fits together

```
Electron main process (main.js)
 ├─ startBackend({ port: 9010, serveDir, ghdlExe })   ← in-process, no child node
 │    ├─ http.createServer()  → serves resources/frontend/
 │    └─ WebSocketServer({ noServer: true }) on upgrade "/ghdlsim"
 │         └─ spawns resources/ghdl/bin/ghdl.exe
 └─ BrowserWindow → loadURL("http://127.0.0.1:9010/")
      └─ renderer = the existing src/ React app, UNMODIFIED
```

Three decisions explain most of the code here.

**The frontend is served over HTTP, not loaded with `loadFile()`.** The
renderer builds its WebSocket URL from `window.location.hostname`, which
is the empty string under `file://` — producing a malformed
`ws://:9010/ghdlsim`. Serving the page from the backend means page and
socket share an origin and a port, so `src/**` needs no changes at all.
That is also why the port is **fixed**: the renderer's port is a Vite
build-time constant, so it cannot be discovered at runtime. A collision
is reported in a dialog rather than worked around.

**The backend is esbuild-bundled with `ws` inlined.** `extraResources`
sits outside `app.asar`, so a backend shipped there cannot resolve `ws`
from inside the archive. Bundling removes the lookup.

**Simulations are paced to real time on Windows through stdin.** Real-time
pacing (the testbench blocks after every 20 ms of simulated time until the
backend grants the next step) was built on a POSIX FIFO (`mkfifo`,
`O_NONBLOCK`), which Windows does not have, and a regular file cannot
substitute because the testbench's backpressure is `readline` *blocking*
at EOF. Windows therefore takes the grants from the one pipe every child
process already has: the testbench is generated with
`readline(std.textio.input, …)` (`generateTestbench(…, { pacingFromStdin:
true })`) and `session.ts` writes one line per 20 ms of real time into
GHDL's stdin (`PACING === 'stdin'`). The POSIX path — the FIFO, and the
generated VHDL — is unchanged and is selected by `process.platform`.
Measured on the packaged app with the bundled GHDL 5.0.1: `blinkTest.vhdl`
toggles its LEDs every 250 ms (2 Hz) over a 32 s run, matching the board.

## Layout

```
winInstaller/
├─ README.md                 this file
├─ build.ps1                 the whole build flow
├─ fetch-ghdl.ps1            pinned, checksum-verified GHDL download
├─ make-assets.cjs           renders icon.ico + installerSidebar.bmp (run by Electron)
├─ electron/
│  ├─ package.json           electron + electron-builder + esbuild
│  ├─ electron-builder.yml   NSIS target, extraResources, per-user install
│  ├─ main.js                lifecycle, window, backend startup, teardown
│  ├─ build-backend.mjs      the esbuild step
│  ├─ build/
│  │  ├─ icon.ico            generated; safe to delete, build.ps1 remakes it
│  │  ├─ installerSidebar.bmp  generated; wizard welcome/finish panel
│  │  ├─ installer.nsh       custom NSIS hook — removes $INSTDIR on uninstall
│  │  └─ license.txt         HDLBoard + GHDL notices, shown by the installer
│  └─ resources/             gitignored — assembled by build.ps1, never hand-edited
├─ vendor/ghdl/              gitignored — populated by fetch-ghdl.ps1
└─ output/                   gitignored — Setup.exe lands here
```

## Which `node_modules` / `dist` belongs to what

Building the installer runs the two source projects' own npm builds, so
afterwards the repo has three `node_modules` and several build folders.
Only the ones under `winInstaller/` are Electron's:

| Path | Belongs to | Holds |
|---|---|---|
| `node_modules/`, `dist/` | **the frontend** | React, Vite, TypeScript, Playwright; and the Vite build |
| `server/node_modules/`, `server/dist/` | **the backend** | `ws`; and the compiled TypeScript |
| `winInstaller/electron/node_modules/` | **Electron** | electron, electron-builder, esbuild |
| `winInstaller/electron/resources/` | **Electron** | the assembled frontend + backend bundle + GHDL |
| `winInstaller/vendor/`, `winInstaller/output/` | **Electron** | the downloaded GHDL; the built `Setup.exe` |

Two names in the *root* `node_modules` look like Electron but are not:
`esbuild` is Vite's own internal bundler, and `electron-to-chromium` is a
browserslist version-lookup table with no Electron code in it.

The root folders cannot be relocated under `winInstaller/`: npm and
Node's module resolution both require `node_modules` to sit next to its
`package.json`, and `dist/` is consumed by `npm run preview`,
`tools/bundle.mjs` and `scripts/start.sh`. All of the genuinely Electron-specific
output is already confined to `winInstaller/` and gitignored.

## Vendored GHDL and GPL-2.0

The bundled build is **GHDL 5.0.1, mcode, ucrt64** — the
`ghdl-mcode-5.0.1-ucrt64.zip` release asset. It is chosen over the
`mingw-w64-*.pkg.tar.zst` packages because it is self-contained
(`ghdl.exe`, three DLLs, and the analyzed standard libraries), so
installing it is just an unpack; the MSYS2 packages would drag in a
package manager and its dependency graph. UCRT is the Windows 10+ system
C runtime, so nothing extra is needed on the target machine.

GHDL is GPL-2.0, so shipping its binary carries obligations, all met by
the build:

- its license text is installed at `resources\ghdl\COPYING`;
- the exact release and its SHA-256 are recorded in
  `resources\ghdl\VERSION.txt`;
- the installer's license page credits GHDL and points at the public
  source at tag `v5.0.1`;
- the IEEE library license ships at
  `resources\ghdl\lib\ghdl\src\ieee2008\LICENSE`.

GHDL is `spawn()`ed as a separate process, not linked, so it imposes no
license constraint on HDLBoard's own code — which is GPL-2.0-only
anyway, by choice. Compiled student designs never leave the machine, so
no distribution event arises for them. *(Not legal advice; worth a real
review before distributing beyond students running it locally.)*

## Code signing

The output is unsigned, so SmartScreen warns on first run
(**More info → Run anyway**). A certificate is a real recurring cost and
is hard to justify for a course tool; the root README documents the flow
instead. To sign, set `CSC_LINK`/`CSC_KEY_PASSWORD` before `build.ps1` —
electron-builder picks them up with no config change.

## Known gaps

- **The POSIX pacing path was re-checked only at session level.** Under
  Linux (GHDL 4.1 mcode) `blinkTest.vhdl` still toggles every ~250 ms
  through the FIFO, and the VHDL generated for POSIX is byte-identical to
  before the stdin change. A full `./scripts/start.sh` + browser run on a Linux
  machine has not been repeated — do that before trusting a release.
