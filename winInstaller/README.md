# Windows installer

Packages the DE1-SoC VHDL Workbench as an Electron desktop app and builds
a single NSIS `Setup.exe` that bundles the frontend, the backend, and
GHDL itself — so a student needs nothing preinstalled and no
administrator rights.

Everything here is **additive**. `npm run dev`, `npm run build`,
`./start.sh`/`./stop.sh`, LAN access, `#gallery` and `npm run demo` all
behave exactly as they did before.

## Building

On Windows, with Node 18+:

```powershell
winInstaller\build.ps1
```

Output lands in `winInstaller\output\DE1-SoC Workbench-Setup-<version>.exe`
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

**Simulations run unpaced on Windows.** Real-time pacing needs a POSIX
FIFO (`mkfifo`, `O_NONBLOCK`), neither of which Windows has, and a
regular file cannot substitute because the testbench's backpressure is
`readline` *blocking* at EOF. The generated testbench already disables
the whole mechanism when its `pacing_file` generic is empty, so Windows
takes that path. POSIX behaviour is untouched. Timing therefore does not
predict board timing on Windows — documented for students in the root
README.

## Layout

```
winInstaller/
├─ README.md                 this file
├─ build.ps1                 the whole build flow
├─ fetch-ghdl.ps1            pinned, checksum-verified GHDL download
├─ make-icon.cjs             renders icon.ico from the project logo (run by Electron)
├─ electron/
│  ├─ package.json           electron + electron-builder + esbuild
│  ├─ electron-builder.yml   NSIS target, extraResources, per-user install
│  ├─ main.js                lifecycle, window, backend startup, teardown
│  ├─ build-backend.mjs      the esbuild step
│  ├─ build/
│  │  ├─ icon.ico            generated; safe to delete, build.ps1 remakes it
│  │  └─ license.txt         Workbench + GHDL notices, shown by the installer
│  └─ resources/             gitignored — assembled by build.ps1, never hand-edited
├─ vendor/ghdl/              gitignored — populated by fetch-ghdl.ps1
└─ output/                   gitignored — Setup.exe lands here
```

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
license constraint on the Workbench's own code — which is GPL-2.0-only
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

- **Unpaced timing on Windows** (above). Windows named pipes via Node's
  `net` module are the obvious upgrade if GHDL's VHDL `file_open` turns
  out to open them with blocking reads — untested.
- **The POSIX pacing path has not been re-verified on Linux** since these
  changes. It is guarded by `process.platform !== 'win32'` and is
  unchanged by inspection, but the plan calls for confirming a slow
  divider still takes real time by watching a clock. Do that before
  trusting a release.
