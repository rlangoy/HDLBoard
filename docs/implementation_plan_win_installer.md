# Windows Installer — Implementation Plan

Status: **implemented** — branch `windows-installer`. The plan is kept as
written, for its rationale; §0's findings F1–F5 are what the work was
checked against, and all five held up. The development order in §2 is
what was followed.

> **Superseded after v1: F1's "Windows runs unpaced" decision no longer
> holds.** Windows is now paced to real time like POSIX, through the
> simulation process's **stdin** rather than a FIFO or a Windows named
> pipe (§5.15 of `ghdl_implementation_plan.md`). Read every "unpaced on
> Windows" statement below — F1's resolution, the pacing rows in the
> decisions table and phase gates, the README caveat — as describing
> v1 only. Measured on the packaged app with the bundled GHDL 5.0.1,
> `blinkTest.vhdl` toggles every 249.9 ms over a 32 s run.

Three things the plan did not anticipate, recorded here so this document
does not mislead whoever reads it next:

- **`pacing_file=""` cannot be passed as an argument.** GHDL rejects an
  empty generic value outright — `missing value in generic override
  option` — so `-gpacing_file` is *omitted* instead, falling back to the
  generic's own declared `""` default in `tbTemplate.ts`. The effect is
  exactly what F1 intended; only the mechanism differs.
- **`renameSync` over an open file is `EPERM` on Windows.** Not a POSIX
  dependency the source review was looking for, and invisible until the
  packaged build: the running testbench reopens `input.txt` on every
  poll, and an instrumented 15 s stress run hit **1584** contentions —
  each an uncaught throw out of a timer callback. Now retried with a
  bounded synchronous backoff in `session.ts`.
- **WO-3's `isMainModule` guard is wrong on Windows.** Comparing
  `import.meta.url` against a concatenated `` `file://${process.argv[1]}` ``
  never matches there, because argv[1] is `C:\…` whose URL form is
  `file:///C:/…`. It needs `pathToFileURL`, or the backend silently
  refuses to start as a script.

Two gates in §9 remain open, both needing machines unavailable during
implementation: the **Linux paced-timing regression check** (the
regression F1's fix most endangers) and the **clean non-admin Windows VM**
pass, including SmartScreen's exact wording.

Decision: package HDLBoard as an **Electron** desktop
app for Windows, built with **electron-builder** (NSIS → one
`Setup.exe`). Everything for this lives under **`winInstaller/`**, with
all Electron-specific source in its own subfolder,
**`winInstaller/electron/`**.

**This is additive.** `npm run dev`, `npm run build`/`preview`,
`./scripts/start.sh`/`./scripts/stop.sh`, LAN access, `#gallery`, and `npm run demo` all
keep working exactly as they do now (§8 is the enforced list).

| Decision | Choice |
|---|---|
| Desktop framework | **Electron** — main process is plain Node.js, so `server/`'s GHDL orchestration runs in-process |
| Packager | **electron-builder**, NSIS target, per-user install (`perMachine: false`, `oneClick: false`) |
| Node runtime | **None to vendor** — Electron embeds its own |
| Frontend delivery | **Served over `http://127.0.0.1:9010` by the backend itself**, not `loadFile()` — forced by finding F2 (§0) |
| Backend delivery | **esbuild-bundled to one file** with `ws` inlined — forced by finding F3 (§0) |
| Windows real-time pacing | **Off for v1** (`-gpacing_file` omitted, not passed empty — see the status note), a code path the generated testbench already supports — forced by finding F1 (§0) |
| Workbench's own license | **GPL-2.0-only** — already implemented in the repo (finding F5) |

---

## 0. Review findings — what changed, and why

Five findings from reading the actual sources. The first is a blocker,
the next two invalidate design choices the previous revision of this
plan had made, the fourth corrects a count, and the fifth removes work
that turned out to be already done.

### F1 (blocker) — the backend cannot start on Windows today

`server/src/session.ts` creates its real-time pacing channel with POSIX
primitives that do not exist on Windows:

```
session.ts:288   execFileSync('mkfifo', [this.pacingPath()]);
session.ts:289   this.pacingFd = openSync(this.pacingPath(), fsConstants.O_RDWR | fsConstants.O_NONBLOCK);
```

`mkfifo` is not a Windows command (immediate `ENOENT`), and
`O_NONBLOCK` is not supported by Node's `fs` on Windows. The mechanism
depends on FIFO semantics end to end: the generated testbench blocks on
`readline(fpace, l)` for backpressure (`tbTemplate.ts:186`), and the
Node side relies on `EAGAIN` when the pipe is full (`session.ts:393`).
A regular file cannot substitute — `readline` at EOF does not block, so
pacing would silently stop pacing.

**Consequence: there is no point packaging anything until the backend
runs on Windows at all.** This is why §2 opens with a Windows viability
phase rather than with installer work.

**Resolution (decided): Windows runs unpaced for v1.** The testbench
already guards the whole mechanism on a non-empty generic:

```vhdl
-- tbTemplate.ts:172-186
if pacing_file'length > 0 then
  file_open(status, fpace, pacing_file, read_mode);
  paced := status = open_ok;
end if;
...
if paced then readline(fpace, l); end if;
```

So passing `pacing_file=""` and skipping the `mkfifo`/`openSync` pair
disables pacing through a code path the design already supports — no
VHDL changes, no redesign of a mechanism whose own history (§5.13 of
`ghdl_implementation_plan.md`, which replaced an earlier SIGSTOP design
after real failure modes) argues against casual rework.

**Behavioural cost, which must be documented for students:** pacing is
what makes simulator timing predict board timing (§5.9). Unpaced, a
Windows simulation runs as fast as GHDL manages, so a `CLOCK_500Hz`
design blinks faster than the real board. The Linux/LAN path keeps
pacing and is unaffected. Windows named pipes (`\\.\pipe\…` via Node's
`net` module) are the obvious future upgrade if GHDL's VHDL `file_open`
turns out to open them with blocking reads — cheap to test opportunistically
during Phase 0, not a v1 commitment.

### F2 — `loadFile()` would break the renderer's WebSocket

The previous revision claimed the renderer needed no changes and that
only "does WebSocket work from `file://`" needed confirming. It does not
work, and the reason is not WebSocket policy:

```
ghdlClient.ts:32   return `ws://${window.location.hostname}:${port}/ghdlsim`;
Workbench.tsx:36   const GHDL_WS_PORT = Number(import.meta.env.VITE_GHDL_WS_PORT ?? 9010);
```

Under `file://`, `window.location.hostname` is the empty string, so the
URL becomes `ws://:9010/ghdlsim` — malformed. The port, separately, is a
**build-time** Vite constant, not a runtime value.

**Consequence: reinstate serving the frontend over HTTP from the backend**
— the change the Electron rewrite had deleted as "no longer necessary."
The backend gets an `http.createServer()` serving the built frontend
statically, with the existing `WebSocketServer` attached via
`noServer: true` + an `upgrade` handler on `/ghdlsim`; Electron then does
`loadURL('http://127.0.0.1:9010/')`. Page origin and WS origin match,
`window.location.hostname` resolves to `127.0.0.1`, the baked-in 9010
matches the serving port, and **the renderer stays genuinely untouched.**

This forces a **fixed port**, not an ephemeral one: the port is baked
into the bundle at build time, so it cannot be discovered at runtime.
Port 9010 already in use (a running `start.sh`, or a second app
instance) must therefore produce a clear dialog naming the likely cause,
not a silent failure. Making this dynamic would require the renderer to
learn its port at runtime (backend-injected `<meta>` tag, or a
`/config.json` it fetches) — noted as a future option, deliberately not
v1, since it means touching renderer code to solve a problem a good
error message covers.

### F3 — `ws` will not resolve if the backend ships as `extraResources`

The previous revision put the compiled backend in `extraResources`,
reasoning that `electron-builder` handles `node_modules` normally. It
does — for code inside the app root/`app.asar`. Code placed in
`extraResources` sits *outside* `app.asar`, so `import ... from 'ws'`
resolves relative to `resources/backend/`, walks up, and never sees the
`ws` inside the archive.

**Consequence: esbuild-bundle the backend into a single file with `ws`
inlined** (reinstating a step from the pre-Electron plan) and ship that
as `extraResources`. This also makes the previously-flagged
"ESM-inside-asar / `import.meta.url`" risk moot, since the bundle is not
in the asar at all. Two problems, one step.

### F4 — six GHDL invocation sites, not two

The grep pass the previous revision deferred, now done:

```
server/src/ghdl.ts:94    spawn('ghdl', ['-r', '--std=08', entityName, …])   startPersistentRun
server/src/ghdl.ts:166   spawn('ghdl', ['-r', '--std=08', entityName], …)   runBatch
server/src/session.ts:195  runCmd('ghdl', ['-a', …])
server/src/session.ts:234  runCmd('ghdl', ['-a', …])
server/src/session.ts:241  runCmd('ghdl', ['-e', …])
server/src/session.ts:420  runCmd('ghdl', ['-e', …])
```

Good news in the shape of it: `runCmd(cmd, args, cwd, timeout)` already
takes the command as its first parameter, so the four `session.ts` sites
need only their argument changed, and only `ghdl.ts`'s two literals are
structural.

### F5 — the Workbench's own licensing is already done

The repo already has it: `LICENSE` present at root (GPL-2.0 full text),
**43 of 43** `.ts`/`.tsx`/`.mjs` files carrying
`// SPDX-License-Identifier: GPL-2.0-only`, and `"license": "GPL-2.0-only"`
in both `package.json` files.

**Consequence:** the "add a LICENSE" work order is deleted and replaced
by a verification step. Note the exact identifier is **`GPL-2.0-only`**
(not bare `GPL-2.0`) — anything new must match. The only licensing work
genuinely outstanding is attribution for the **bundled GHDL binary** (§4).

### Minor note, not a finding

`ghdl.ts`'s `child.kill('SIGTERM')` still terminates children on Windows
(Node maps it to `TerminateProcess`), so orphan cleanup should hold —
but the code comment's reasoning ("SIGTERM interrupts the blocked FIFO
read") no longer applies there. With pacing off (F1) there is no blocked
read to interrupt, so this is consistent rather than broken. Verify by
observation in Phase 1 regardless.

---

## 1. Architecture of the packaged app

```
Electron main process (Node.js)
 ├─ startBackend({ port: 9010, ghdlExe, paced: false })   ← in-process, no child node.exe
 │    ├─ http.createServer()  → serves resources/frontend/  ("/"…)
 │    └─ WebSocketServer({ noServer: true }) on upgrade "/ghdlsim"
 │         └─ spawns resources/ghdl/bin/ghdl.exe  (6 call sites, F4)
 └─ BrowserWindow → loadURL("http://127.0.0.1:9010/")
      └─ renderer = existing src/ React app, UNMODIFIED
           └─ ws://127.0.0.1:9010/ghdlsim   (same origin, same port)
```

One process tree, one port, one origin. The renderer cannot tell it is
inside Electron rather than a browser — which is the point: it is the
same code, unmodified, and every existing behaviour it has is preserved
by construction rather than by re-testing.

## 2. Development order and flow

Seven phases, each with an **exit gate** that must pass before the next
begins. The ordering is not arbitrary — three properties drive it:

- **Viability before investment.** F1 means the backend does not run on
  Windows. Nothing about Electron, electron-builder, or NSIS changes
  that, so all of it is wasted effort until it is fixed. Phase 0 exists
  to find *every* platform break early, not just the known one.
- **Integration early, not last.** The previous revision left the first
  end-to-end test until after everything was built, so its riskiest
  assumptions (F2, F3) would have surfaced only at the very end. Phase 3
  is a deliberately throwaway walking skeleton that proves the whole
  chain works before any packaging config is written.
- **Regression pressure at every step.** Phases 1 and 2 touch shared
  `server/` code that the existing Linux workflow depends on, so each
  carries its own §8 re-check rather than deferring all of it.

### Phase 0 — Windows viability spike (gate; no installer work)

No Electron, no electron-builder, no `winInstaller/` folder. On a
Windows machine with native GHDL on `PATH` and Node installed, run the
project **exactly as it exists today**: `npm ci && npm run build` at the
root and in `server/`, then `node server/dist/server.js` alongside
`npx vite preview --port 5173`, and open it in a normal browser.

Purpose: discover the full set of platform breaks by observation, not by
reading. F1 is the expected first failure; find out what is behind it.
Specifically also check: temp-directory handling (`mkdtempSync`/`tmpdir`),
path separators reaching GHDL's command line, whether `ghdl -a/-e/-r`
behaves identically under the mcode Windows build, whether killing the
backend leaves orphaned `ghdl.exe`, and — cheap to try while there —
whether a Windows named pipe is openable by the testbench's `file_open`
(F1's future upgrade; a negative result costs nothing).

**Exit gate:** a real design simulates end-to-end in a browser on
Windows — switches drive `LEDR`/`HEX` through actual GHDL — and every
platform break found is written down. If this gate cannot be reached,
stop and reassess; no later phase is worth starting.

### Phase 1 — Portability fixes in `server/`

Make the backend platform-correct, still with no Electron in the picture.
Platform-conditional pacing per F1: on `process.platform === 'win32'`,
skip `mkfifo`/`openSync`, pass `pacing_file=""`, and skip `startPacing()`;
on POSIX, behave **byte-identically to today**. Plus whatever else
Phase 0 turned up.

**Exit gate:** on Linux, paced behaviour unchanged (verify a slow
divider still takes real time, and `./scripts/start.sh`/`./scripts/stop.sh` work as
before); on Windows, the same design simulates unpaced without error.
Both verified by running, not inspection.

### Phase 2 — Backend API surface

Three narrowly-scoped changes, all additive:

1. `export function startBackend(opts)` returning `{ stop() }`, with the
   existing top-level script entry preserved behind an `isMainModule`
   guard so `node dist/server.js` is untouched.
2. GHDL executable resolution threaded through all six F4 sites.
3. HTTP static serving + WS `upgrade` on one port, per F2.

**Exit gate:** `./scripts/start.sh` behaves exactly as before (two-port, LAN
mode, hot reload untouched), *and* the new single-port mode serves the
built frontend plus WS together — verified by pointing a plain browser
at `http://127.0.0.1:9010/` and simulating a design there, with no
Electron involved yet. Proving F2's fix in a browser first means Phase 3
debugs one new thing instead of two.

### Phase 3 — Electron walking skeleton (throwaway-quality, on purpose)

Minimal `main.js`: resolve paths, `startBackend()`, one `BrowserWindow`
doing `loadURL('http://127.0.0.1:9010/')`, teardown on `before-quit`.
No electron-builder, no `electron-builder.yml`, no asar, no icon, no
bundling. Dev mode only, run with `npx electron .`.

**Exit gate:** a real design simulates inside the Electron window, and
quitting leaves no `ghdl.exe` in Task Manager. This is the moment the
architecture is proven; everything after it is packaging.

### Phase 4 — Packaging

esbuild-bundle the backend per F3; write `electron-builder.yml`
(`extraResources` for the bundle, frontend, and GHDL; NSIS per-user);
write `build.ps1`. Add the port-in-use dialog F2 requires.

**Exit gate:** `Setup.exe` builds, installs on the development machine,
launches, simulates, and uninstalls.

### Phase 5 — GHDL vendoring and its GPL-2.0 attribution

`fetch-ghdl.ps1` (pinned version, checksum, preserves `COPYING`, records
the tag), and the installer's license page carrying both the
Workbench's GPL-2.0-only notice and GHDL's separate attribution (§4).
Phase 4 can use a manually-unpacked GHDL to get moving; this phase makes
it reproducible and compliant.

**Exit gate:** a clean clone plus `fetch-ghdl.ps1` plus `build.ps1`
produces a compliant installer with no manual steps.

### Phase 6 — Clean-VM test, documentation, distribution

§10's full test pass on a clean non-admin Windows VM; README updated with
the installer path **and** the unpaced-on-Windows caveat from F1;
distribute.

**Exit gate:** §10 fully checked off, §8 re-verified end to end.

### Build flow (Phase 4 onward)

```
repo root        npm run build ──────────────► dist/            ─┐
server/          npm run build ──► server/dist/ ─► esbuild ─► backend.cjs ─┤
winInstaller/vendor/ghdl/ (fetch-ghdl.ps1) ───────────────────────┤
                                                                  ▼
                              winInstaller/electron/resources/{frontend,backend,ghdl}
                                                                  ▼
                                    npx electron-builder --win (NSIS)
                                                                  ▼
                               winInstaller/output/…-Setup-<version>.exe
```

## 3. `winInstaller/` folder layout

```
winInstaller/
├─ README.md                    how to build the installer
├─ build.ps1                    the §2 build flow, end to end
├─ electron/                    all Electron-specific source, its own Node project
│  ├─ package.json              electron + electron-builder + esbuild (devDeps)
│  ├─ electron-builder.yml      NSIS target, extraResources, appId, icon, license
│  ├─ main.js                   lifecycle, window, startBackend(), GHDL path, teardown
│  ├─ build/
│  │  ├─ icon.ico
│  │  └─ license.txt            Workbench + GHDL notices (§4)
│  └─ resources/                gitignored — populated by build.ps1, never hand-edited
│     ├─ frontend/              ← repo root dist/
│     ├─ backend.cjs            ← esbuild bundle of server/dist (ws inlined, F3)
│     └─ ghdl/                  ← vendor/ghdl/
├─ vendor/                      gitignored — populated by fetch-ghdl.ps1
│  └─ ghdl/                     GHDL win64 mcode + COPYING + VERSION.txt
└─ output/                      gitignored — Setup.exe lands here
```

`winInstaller/electron/` is a complete standalone Node project so it can
be installed and built on its own, consuming only the *build output* of
`src/` and `server/`, never reaching into their tooling.

## 4. Vendored GHDL and GPL-2.0 compliance

Only GHDL needs vendoring (Electron supplies Node). Pin **5.0.1, mcode,
win64** — the version `README.md` says the backend is verified against.
`fetch-ghdl.ps1` downloads the official release asset, verifies a pinned
SHA-256, unpacks to `winInstaller/vendor/ghdl/`, preserves the release's
`COPYING` unmodified, and records the exact tag in `VERSION.txt`.

GHDL is [GPL-2.0](https://github.com/ghdl/ghdl?tab=GPL-2.0-1-ov-file#),
so shipping its binary is GPL distribution and carries obligations:
include its license text, credit the project and exact version, and
point to its source (the public repo at that tag suffices — nothing
extra to host). All three land in `build/license.txt`, shown on the NSIS
license page, with `COPYING` installed next to `ghdl.exe`.

Two things this does **not** change, both settled: GHDL is `spawn()`ed as
a separate process, not linked, so it does not impose GPL on the
Workbench's own code (which is GPL-2.0-only anyway, by choice — F5); and
compiled student designs never leave the machine, so no distribution
event arises for them. (Not legal advice; worth real review if this is
ever distributed beyond students running it locally.)

## 5. Code changes, by phase

| Phase | File | Change |
|---|---|---|
| 1 | `server/src/session.ts` | Platform-conditional pacing: skip `mkfifo`/`openSync`/`startPacing`, pass `pacing_file=""` on win32 (F1) |
| 2 | `server/src/server.ts` | `export startBackend(opts): { stop() }`; `isMainModule` guard preserving the script entry; move signal handlers inside it |
| 2 | `server/src/server.ts` | `http.createServer()` static serving + `WebSocketServer({ noServer: true })` + `upgrade` on `/ghdlsim` (F2) |
| 2 | `server/src/ghdl.ts` | `ghdlExe` resolver replacing two literals; `setGhdlExe()` |
| 2 | `server/src/session.ts` | Four `runCmd('ghdl', …)` sites take the resolved exe (F4) |
| — | `src/**` | **No changes.** F2's fix exists specifically to keep this true |

## 6. electron-builder configuration

```yaml
appId: no.usn.hdl-board
productName: HDLBoard
directories:
  output: ../output
files: [main.js]
extraResources:
  - { from: resources/frontend, to: frontend }
  - { from: resources/backend.cjs, to: backend.cjs }
  - { from: resources/ghdl, to: ghdl }
win: { target: nsis, icon: build/icon.ico }
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  license: build/license.txt
```

Confirm key names against the installed electron-builder's own schema at
implementation time; majors occasionally rename them.

## 7. What must keep working, unchanged

Re-verified at every phase gate, not just at the end:

- `npm run dev` — Vite dev server, hot reload.
- `npm run build` / `npm run preview`.
- `./scripts/start.sh` / `./scripts/stop.sh`, two-port (`STATIC_PORT`, `GHDL_WS_PORT`)
  LAN-accessible mode, **with pacing intact on POSIX**.
- `#gallery`, and `npm run demo` / `tools/bundle.mjs`.
- `node server/dist/server.js` standalone, unchanged in behaviour.

## 8. Open decisions and risks

- **GHDL version** — proceeding with 5.0.1 mcode win64 unless a
  Windows-specific fix argues otherwise. Not a blocker.
- **Unpaced Windows behaviour** (F1) — decided for v1; must be
  documented for students, since it changes what they observe versus the
  lab's Linux setup. Named pipes are the upgrade path if Phase 0's
  opportunistic test is promising.
- **Port 9010 collisions** (F2) — fixed port is a consequence of the
  build-time constant. Mitigation is a clear dialog, not a retry loop.
- **Code signing / SmartScreen** — unsigned NSIS output will likely warn.
  A certificate is real cost, probably unjustified for a course tool;
  otherwise document the "More info → Run anyway" flow. Decide before
  distributing.
- **Install size** — ~150–250MB (Electron) plus ~30–50MB (GHDL). Worth
  telling students before a lab-network download.
- **Phase 0 may find more than F1.** The estimate above assumes pacing is
  the only POSIX dependency; `mkdtempSync`, path handling, and GHDL's
  own Windows behaviour are unverified until that phase runs.

## 9. Testing plan

On a clean, non-admin Windows VM with no Node/GHDL/WSL:

- [ ] Install via `Setup.exe` — no admin prompt.
- [ ] Launch; open a sample design; simulate; flip a switch; `LEDR`/`HEX` react.
- [ ] Unpaced timing behaves as documented (F1) — no hang, no error.
- [ ] Quit — no orphaned `ghdl.exe` in Task Manager.
- [ ] Launch with `start.sh` already holding 9010 — clear dialog, not a silent failure.
- [ ] Uninstall — all files and shortcuts gone.
- [ ] SmartScreen behaviour recorded for the README.

On the development machine, after all phases:

- [ ] Every §7 item, re-run, including paced timing on POSIX.
