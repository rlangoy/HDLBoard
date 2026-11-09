# Linux AppImage

Packages HDLBoard as one portable file, `HDLBoard-<version>-x86_64.AppImage`. It holds the
frontend, the backend, the Electron runtime, GHDL 6.0.0 and Icarus Verilog 13.0. A student downloads it, marks it
executable and double-clicks it. No Node.js, GHDL, Icarus, Docker or administrator rights are needed, and it
works offline. Target: x86-64 Ubuntu 22.04/24.04 LTS and Linux Mint 21.x/22.x (minimum glibc 2.35).

The app is the same as the Windows one: the Electron shell in `winInstaller/electron/` starts the backend in
its own process on `127.0.0.1:9010…9019`, and the window loads the page from there. Everything here is
**additive**: the Windows build, the browser version, `scripts/start.sh` and the Docker image behave as before.
Specification: [docs/linux_appimage_spec.md](../docs/linux_appimage_spec.md).

## Building

On Linux, with Node 20+, `mksquashfs` (`squashfs-tools`), `curl`, and Docker:

```sh
linuxAppImage/build.sh
```

Output: `linuxAppImage/output/HDLBoard-<version>-x86_64.AppImage` (~106 MB) and its `.sha256`.

| Flag | Effect |
|---|---|
| `--skip-app-build` | Reuse the existing `dist/` and `server/dist/`, for iterating on packaging alone. |
| `--simulators native` | Build GHDL/Icarus trees on this host (CI does this on its Ubuntu 22.04 runner). |
| `--simulators container` | Build them in the pinned `ubuntu:22.04` container. `auto` (default) picks native on Ubuntu 22.04, container elsewhere. |

The simulators must be built on Ubuntu 22.04, because binaries linked against a newer glibc do not start on an older one.
On any other host `build.sh` therefore builds them in `ubuntu:22.04@sha256:076e…` (pinned in `build.sh`). Both
trees are cached in `vendor/` and rebuilt only when a pin changes. If your user was only just added to the
`docker` group, `build.sh` reaches Docker through `sg docker`, so you don't need to log out first.

What `build.sh` does, in order:

1. **Simulator trees:** `fetch-ghdl.sh` and `build-iverilog.sh` (below).
2. **Clean-system check:** `verify-simulators.sh` runs in a clean `ubuntu:22.04` with no extra packages and
   `--network none`. `ldd` must find every library of every program, target and module. GHDL then analyzes,
   runs a self-checking testbench and writes a GHW. Icarus compiles the fixtures cleanly, passes a batch
   testbench, writes an FST, and drives a board run through the file protocol. Each tool runs with
   `PATH=/usr/bin:/bin` from a directory named `hdlboard smoke … ø`. Any failure stops the build.
3. **Frontend and backend:** their own `npm run build` (only their `dist/` output is used).
4. **`resources/`:** assembled exactly as `build.ps1` does, then the shell's own tests, then
   `electron-builder --linux dir`.
5. **The AppImage:** `linux-unpacked/` plus `AppRun`, `hdlboard.desktop`, the icon and
   `resources/licenses/README.txt`. The executable bits of the simulators are checked. Then
   `mksquashfs` (zstd) runs, and the result is placed behind the pinned static AppImage runtime.

To test a build: `linuxAppImage/smoke-test.sh [--mounted] [--in <dir>] linuxAppImage/output/HDLBoard-*.AppImage`
(see [Tests](#tests)).

## Layout

| File | Purpose |
|---|---|
| `build.sh` | The whole build, as above. |
| `fetch-ghdl.sh` | Downloads and verifies the pinned GHDL source, builds mcode with GNAT on Ubuntu 22.04, checks its libraries, writes `VERSION.txt`. `--force`, `--check`. |
| `build-iverilog.sh` | Downloads the pinned Icarus source tag, verifies it, builds it, assembles the flat tree, writes `VERSION.txt`. `--force`, `--check`. |
| `verify-simulators.sh` | The smoke test of both trees (step 2). `--ghdl`, `--iverilog`, `--fixtures` to point it elsewhere. |
| `AppRun` | The AppImage's entry point: the sandbox check (below), then `exec hdlboard`. |
| `LICENSES.txt` | Ships as `resources/licenses/README.txt`: where every license text is. |
| `smoke-test.sh`, `smoke-sessions.mjs` | The packaged smoke test. |
| `vendor/`, `output/` | Gitignored: downloads, simulator trees, build output. |

Elsewhere: `winInstaller/electron/electron-builder.yml` (its `linux:` section), `package.json` (`dist:linux`),
`main.js` (Linux-only parts behind `process.platform === 'linux'`), `make-assets.cjs` (also writes
`build/icon.png`, 512×512, committed like `icon.ico`), and `.github/workflows/build-linux.yml`.

The embedded static type2-runtime is pinned to upstream's 2026-10-19 build (asset ID
`657374641`) and SHA-256 `617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46`.
The download uses the fixed asset URL rather than the moving `continuous` tag. Its statically linked
libfuse removes the need to install `libfuse2`; normal mounting still requires kernel FUSE support.

## The simulator trees

### GHDL: `resources/ghdl/`

Built from the checksum-pinned GHDL **6.0.0** source on Ubuntu 22.04 with GNAT and the mcode backend.
The script retains its historical name, `fetch-ghdl.sh`. Upstream's Ubuntu 24.04 binary requires
newer glibc symbols and cannot be reused for this baseline. This keeps the same version/backend as Windows.

Configure uses `--prefix=/opt/hdlboard-ghdl --disable-libghdl`. GHDL's build links its GNAT runtime
statically. We retain `bin/ghdl`, `bin/ghwdump`, `lib/ghdl/`, `lib/libghw.so` and `lib/libghdlvpi.so`.
The source archive supplies `COPYING.md`; the exact archive is attached to releases as `ghdl-v6.0.0.tar.gz`.

No extra shared libraries are bundled. The clean Ubuntu 22.04 container check verifies every ELF dependency
and runs real simulations from a relocated tree. Both simulator stamps and the CI cache identify the
22.04 baseline so old Ubuntu 24.04 binaries cannot silently survive the migration.

### Icarus Verilog: `resources/iverilog/`

Ubuntu 24.04 packages Icarus 12.0 and upstream publishes no Linux binaries, so `build-iverilog.sh` builds
**13.0** from the source tarball of tag `v13_0` (pinned SHA-256). It installs into a staging prefix and copies
`lib/ivl/*` (ivl, ivlpp, the targets and their `.conf` files, the `.vpi` modules, `.sft` tables, `include/`),
next to the `iverilog` and `vvp` programs. That flat directory is what the backend runs as `iverilog -B<dir>`
and `vvp -M<dir>`.

- **Configure options:** only `--prefix`. `libreadline-dev` is not installed, so `vvp` has no interactive
  debugger (never used) and links only glibc, libstdc++, zlib and bzip2, which every desktop has. The script
  fails if `vvp` links readline.
- **Do not pass `--disable-libvvp`.** Icarus's `configure.ac` treats *any* form of the option as "enable",
  and `vvp` then needs a `libvvp.so` that is not in the tree.
- `VERSION.txt` records the source URL, checksum, configure options, compiler and glibc of the build.

### Install paths with a space

`iverilog` runs `<-B dir>/ivlpp` and `<-B dir>/ivl` through `system()`, without quotes. On Windows that is `cmd.exe`
(the existing 8.3 short-path fix); on Linux it is `sh`, which splits the path at a space. The mounted AppImage
(`/tmp/.mount_HDLBo…`) never has a space, but the extraction fallback can, for example
`~/Nedlastinger/HDL Board ø/squashfs-root/`. So the backend now does the POSIX equivalent of the Windows fix:
when the tree's path contains anything the shell would split or expand, it links to the tree from a
`hdlboard-iverilog-*` directory in the temporary directory and passes that link instead
(`server/src/verilog/shortPath.ts` `posixLinkPath`, unit-tested). The link is removed when the backend exits.
Non-ASCII letters are fine for `sh` and are left alone. `verilog.spacedInstall.test.ts`, which used to be
Windows-only, now also runs on Linux against an extracted tree under `Nedlastinger/HDL Board ø/`.

## The Chromium sandbox

Ubuntu 24.04 and Mint 22 restrict unprivileged user namespaces through AppArmor
(`kernel.apparmor_restrict_unprivileged_userns=1`). Chromium's sandbox needs them, or else a root-owned setuid
`chrome-sandbox`, which an AppImage cannot carry. Without handling, Electron aborts at startup with SIGTRAP on
a default desktop. (This build machine, Ubuntu 25.10, has the same restriction.)

`AppRun` probes for exactly what Chromium needs: `unshare --user --map-root-user /bin/true`. It adds
`--no-sandbox` only if that fails. This happens on every start, whether double-clicked or started from a terminal.
`backend.log` records the outcome (`chromium sandbox: on`, or `off (--no-sandbox) - <reason>`).
`HDLBOARD_SANDBOX=on|off` overrides the probe.

**The trade-off.** Without the OS sandbox, a renderer compromised by a Chromium bug would run with the student's
own rights. That risk is small here, because the window never leaves HDLBoard's own origin. Kept as on Windows:
`sandbox: true`, `contextIsolation`, no Node in the renderer, the `will-navigate` guard and the
`setWindowOpenHandler` guard, so any other page opens in the system browser. The GitHub sign-in window is
separate, partitioned and sandboxed, and only loads `https://github.com/`. Electron AppImages such as VS Code,
Obsidian and Cursor make the same choice on these releases.

**Keeping the sandbox on (lab administrators).** An AppArmor profile that grants user namespaces to the
AppImage restores it. The probe then succeeds and the app runs sandboxed. Put the AppImage at a fixed path, then:

```sh
sudo tee /etc/apparmor.d/hdlboard > /dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile hdlboard /opt/HDLBoard/HDLBoard-*.AppImage flags=(unconfined) {
  userns,
  include if exists <local/hdlboard>
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/hdlboard
```

Change the path to where the file actually lives (`@{HOME}/Applications/HDLBoard-*.AppImage` covers a per-user
copy). *This profile has not been tested yet*; check that `backend.log` says `chromium sandbox: on` afterwards.

## FUSE and the AppImage runtime

Ubuntu 24.04 and Mint 22 have FUSE 3 but not `libfuse.so.2`, which the classic AppImage runtime, and
electron-builder 25's AppImage target, need. This build instead uses the **static type2 runtime**
([AppImage/type2-runtime](https://github.com/AppImage/type2-runtime), 2026-10-19 build `fedfad5`, pinned by SHA-256 in
`build.sh`). It has FUSE linked in, so **no `libfuse2` is needed**. It was tested on this machine, which has only FUSE 3: the
mounted AppImage ran and its mount disappeared on exit. The runtime still needs the system's `fusermount3`
(package `fuse3`, installed on every Ubuntu desktop) and `/dev/fuse`. Where those are missing (containers,
locked-down machines), `--appimage-extract` then `squashfs-root/AppRun` works without FUSE.

This is why `electron-builder` only lays out the app (`--linux dir`) and `build.sh` packs the AppImage itself: the
custom `AppRun` and the static runtime are both things electron-builder 25's AppImage target cannot do.

## Where things live

| What | Where |
|---|---|
| Settings, window state, stored projects, GitHub token | `~/.config/HDLBoard/` (`$XDG_CONFIG_HOME/HDLBoard`); `main.js` sets this on Linux. (Windows keeps its existing `hdl-board-desktop` folder.) |
| Log | `~/.config/HDLBoard/logs/backend.log` |
| Simulation working files | `os.tmpdir()`, as before |
| Inside the AppImage | read-only; nothing is written there |

## Startup errors (L8)

If the backend cannot start, the existing dialog shows the error and the log path. After the window loads,
the packaged Linux app starts `ghdl --version` and `vvp -V` from its own trees. If one fails (lost execute bit,
missing library), a dialog names it, for example *GHDL could not be started, so VHDL designs will not simulate*,
with the reason and the log path. The other language keeps working. It never falls back to a system copy:
`main.js` always passes the bundled `ghdlDir`/`iverilogDir`, so `PATH` is never consulted.

## Quitting (L6)

Chromium's own handler turns SIGTERM, SIGINT and SIGHUP (logout, a closed terminal, Ctrl+C, `kill`) into a normal
quit. So these, like closing the window, reach the existing `before-quit` teardown, which kills each simulator's
process group. This was verified for all three signals; no extra code was needed. The smoke test checks it with a live
`ghdl` and `vvp`.

## CI: `.github/workflows/build-linux.yml`

The twin of `build-windows.yml`, on `runs-on: ubuntu-22.04`:

- **Run workflow** (optional version input) builds, tests, and uploads the AppImage and `.sha256` as artifacts.
- A **`v*` tag** does the same, then uploads both, plus both simulator source tarballs, to the tag's **draft**
  release. It creates the draft if it is missing and never publishes it. If the Windows workflow wins the race to
  create the draft, the create fails and the upload is retried into the existing draft with `--clobber`.
  `build-windows.yml` got the same fallback.
- The log shows the commit and both `VERSION.txt` files.
- Tests: the clean-container check (inside `build.sh`). Then `npm test` and `npm run test:integration` in `server/`,
  with `GHDL_DIR`/`IVERILOG_DIR` pointing into the extracted AppImage and `HDLBOARD_REQUIRE_SIMULATORS=1`, which turns
  "skip, simulator not found" into a failure (`server/src/testSupport/requireTool.ts`). Then `smoke-test.sh` under Xvfb. A second job downloads the same AppImage and runs the packaged
  smoke test on Ubuntu 24.04, including both VHDL and Verilog sessions.

## Licenses

There is no installer page, so the texts sit in the AppImage under `resources/`, indexed by
`resources/licenses/README.txt` (from `LICENSES.txt`). To read them: `./HDLBoard-*.AppImage --appimage-extract`.

- HDLBoard: `licenses/HDLBoard-LICENSE.txt` (GPL-2.0-only)
- GHDL: `ghdl/COPYING` (GPL-2.0-or-later); the IEEE libraries: `ghdl/lib/ghdl/src/ieee2008/LICENSE`
- Icarus Verilog: `iverilog/COPYING` (GPL-2.0-or-later). It is built from source here, so the release workflow
  attaches the exact source tarball (`iverilog-v13_0.tar.gz`) to each release.
- Electron/Chromium: `LICENSE.electron.txt`, `LICENSES.chromium.html` beside the program.
- No other library is bundled (GHDL: none; Icarus: none).

*(Not legal advice; the same caveat as [winInstaller/README.md](../winInstaller/README.md).)*

## Where this differs from the spec

| Spec | Here | Why |
|---|---|---|
| Folder `linuxInstaller/` | `linuxAppImage/` | Named by the maintainer. |
| L2: bundle `libgnat-13` with `RPATH` | Nothing bundled; libghdl left out | `ldd`: `bin/ghdl` does not need it (see above). |
| L10: libfuse2 as the prerequisite if needed | Static runtime, no libfuse2 | The spec's preferred outcome; `libfuse2t64` is documented only as a fallback. |
| B1: `dist:linux` = `electron-builder --linux AppImage`, `artifactName` in the yml | `--linux dir`; the AppImage name is set in `build.sh` | electron-builder's AppImage target cannot take a custom AppRun or the static runtime. |
| L6: handle SIGTERM/SIGINT/SIGHUP | No new code | Chromium already does it (verified). |
| L7: `~/.config/HDLBoard` | Set explicitly on Linux | Electron's default would have been `~/.config/hdl-board-desktop`. |

## Tests

Validation of the new baseline (2026-11-08):
- GHDL 6.0.0 mcode and Icarus 13.0 built successfully in the pinned Ubuntu 22.04 container.
- All 15 `verify-simulators.sh` checks passed in clean Ubuntu 22.04 and Ubuntu 24.04 containers,
  with no extra packages and networking disabled.
- The pinned static runtime reported `fedfad5`; ELF inspection found no interpreter or shared-library
  requirements. A small zstd AppImage extracted successfully on Ubuntu 22.04 without libfuse installed.
- Bash syntax and workflow YAML parsing passed.
- Full desktop packaging/smoke tests for this revision remain to be run by CI; manual desktop tests remain pending.

The table below records the previous 24.04 build.

| Check | Status (2026-11-05, this machine) |
|---|---|
| Simulator trees in a clean `ubuntu:24.04`, offline (B3, check 2) | Pass, 15/15 |
| Backend tests against the packaged trees, `HDLBOARD_REQUIRE_SIMULATORS=1` (check 3) | Unit 432 pass (2 Windows-only skips); integration 151/151 pass, none skipped, ~25 s |
| Packaged smoke test (check 4): extracted; mounted via FUSE; extracted under `…/Nedlastinger/HDL Board ø/` | Pass, all three |
| Frontend tests (check 5) | 2675 pass |
| L8: `ghdl` without its execute bit | `backend.log`: `GHDL cannot start: …/ghdl --version: EACCES`; the dialog itself is check 11 of the runbook |
| Manual checks 6–12 on real desktops ([runbook](../tests/e2e/linux-appimage.md)) | **Not yet run** |

### Tested on

| Date | System | What | Result |
|---|---|---|---|
| 2026-11-05 | Ubuntu 25.10 build host (AppArmor userns restriction on, FUSE 3 only, no libfuse2) | `build.sh`; `smoke-test.sh` extracted, `--mounted`, and under a path with a space and `ø`; sandbox probe → `--no-sandbox` | Pass |
| 2026-11-05 | `ubuntu:24.04` container, no extra packages, no network | `verify-simulators.sh` | Pass |
| 2026-11-08 | Ubuntu 22.04 and 24.04 clean containers | Rebuilt simulators, offline checks | Pass, 15/15 on each |
| | Ubuntu 22.04 desktop | Runbook checks 6?12 | not yet run |
| | Ubuntu 24.04 desktop | Runbook checks 6–12 | not yet run |
| | Linux Mint 22.x desktop | Runbook checks 6–12 | not yet run |

Ubuntu 22.04/24.04 and Mint 21/22 are the *target*. They count as supported only after a passing manual run.

## Backend fixes this build needed

Both affect Linux generally (`scripts/start.sh`, Docker), not only the AppImage:

- **A stopped Verilog board run could keep running.** `vvp` catches SIGTERM and finishes only when its scheduler
  next runs, which never happens while a paced run is blocked reading its next grant from stdin. Every Stop,
  Reset or closed tab could leave a `vvp` behind, and the integration tests hung for that reason. `kill()` now
  also closes the run's stdin, and sends SIGKILL if the process is still there after 2 s
  (`server/src/runtime.ts`, with tests). On Windows `kill()` always ended the process outright, so the bug never
  showed there.
- **An Icarus tree under a path with a space** (the extraction fallback): see [Install paths with a space](#install-paths-with-a-space).

## Known gaps

- Checks 6–12 (real desktops, offline, double-click, `blinkTest` pacing at ~250 ms through the POSIX FIFO) are
  manual and have not been run.
- The AppArmor profile above is untested.
- The workflow has not run on GitHub yet. Its steps ran here one by one, and the release step's
  create/race/upload logic was run against a stand-in `gh`. Run it once from **Actions → Build Linux AppImage →
  Run workflow** before tagging a release. The Windows workflow's new race fallback is untested (no PowerShell here).
- **Circular `` `include ``s are slow to report on Linux.** Icarus gives up only when it runs out of file
  descriptors, which takes 0.02 s at `ulimit -n 1024`, ~0.9 s at 65536 (GitHub's runner), and ~7 s at 524288
  (this desktop session). Integration test I-V19 expects 1 s, so the workflow runs the tests with
  `ulimit -n 4096`. A real fix would be in the backend: detect the cycle before compiling, or lower the
  limit for the compile.
