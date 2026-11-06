# HDLBoard – Linux AppImage with GHDL and Icarus Verilog

## 1. Goal and scope

Create a portable, 64-bit Linux desktop release of HDLBoard as one AppImage. A student shall be able to download it, start HDLBoard, and simulate VHDL and Verilog offline without installing Node.js, GHDL or Icarus Verilog.

**Architecture:** The same as the Windows version. HDLBoard is a single desktop application with its own window, started by double-clicking. The backend runs inside the Electron process and serves the page and the simulator WebSocket on a loopback port (`127.0.0.1:9010…9019`), exactly as `winInstaller/electron/main.js` does today. There is no separate server to start, no browser, no terminal, and nothing reachable from other machines. Replacing the loopback HTTP/WebSocket layer (for example with Electron IPC) is a separate change for both platforms and is not part of this spec.

**Supported in the first release:** x86-64 **Ubuntu 24.04 LTS** and **Linux Mint 22.x** (based on Ubuntu 24.04, same glibc 2.39). Other distributions, older Ubuntu releases and ARM64 are out of scope and must not be advertised as supported until tested.

**Out of scope:** upgrading Electron or electron-builder, desktop-menu integration, automatic updates, code signing, and any UI or project-format change.

## 2. Starting point (what already exists)

The Windows build is the template. The Linux build reuses its shell and backend unchanged wherever possible.

| Existing piece | Location | Linux reuse |
|---|---|---|
| Electron shell (main, preload, port selection) | `winInstaller/electron/` (Electron 33, electron-builder 25) | Reused as-is; add a `linux` section to `electron-builder.yml` |
| Packaged layout | `extraResources` → `resources/{frontend, backend.mjs, preload.js, settings.default.json, ghdl, iverilog}` | Same layout; only the `ghdl` and `iverilog` trees differ |
| Simulator path resolution | `main.js` `resolvePaths()` uses `process.resourcesPath`; `server/src/ghdlPath.ts` and `server/src/verilog/toolPaths.ts` already handle POSIX names | No backend change expected |
| Port handling | `backendPort.js`: tries 9010…9019, dialog when all are taken; loopback only | Reused as-is |
| Real-time pacing | POSIX FIFO (`mkfifo` in a `mkdtemp` directory under `os.tmpdir()`), selected by `process.platform` | Reused; must be measured on the packaged app (see 7.3) |
| Pinned simulators | GHDL **6.0.0** mcode, Icarus Verilog **13.0** (`fetch-ghdl.ps1`, `fetch-iverilog.ps1`) | Same versions on Linux (see L3) |
| CI and release | `.github/workflows/build-windows.yml`: `workflow_dispatch` → artifact only; `v*` tag → creates or updates a **draft** GitHub Release | Mirrored for Linux (see B4) |
| Version stamping | `tools/bump-version.mjs` stamps every `package.json` from the tag | Reused |

The Windows build, the browser version, `scripts/start.sh`, the Docker image, the project format and the existing release process shall keep their current behavior.

## 3. Requirements

### 3.1 High priority – a working offline application

- **L1. Package:** Produce one file, `HDLBoard-<version>-linux-x86_64.AppImage`, containing the frontend, backend, Electron runtime, GHDL and Icarus Verilog. `<version>` is the version stamped by `tools/bump-version.mjs`.

- **L2. GHDL tree:** Use the upstream release asset `ghdl-mcode-6.0.0-ubuntu24.04-x86_64.tar.gz` (same GHDL version and backend as Windows). Ship its `bin/`, `lib/` and analyzed standard and IEEE libraries under `resources/ghdl/`, so `ghdlInDir()` finds `resources/ghdl/bin/ghdl`. The upstream asset does not document its runtime dependencies; determine them with `ldd` in a clean `ubuntu:24.04` container. Any library not present on a default Ubuntu 24.04 desktop (expected: the GNAT runtime `libgnat-13`) shall be bundled in the tree and found through an `RPATH` of `$ORIGIN/../lib` set with `patchelf`, not through a global `LD_LIBRARY_PATH`.

- **L3. Icarus Verilog tree:** Ubuntu 24.04 packages Icarus 12.0 and upstream publishes no Linux binaries, so build **Icarus Verilog 13.0** from the pinned upstream source tag on the Ubuntu 24.04 build base. Install it, then assemble the **flat directory** the backend already expects (`iverilog`, `vvp`, `ivl`, `ivlpp`, `vvp.tgt`, `vvp.conf`, all `.vpi` modules and any other target/config files) under `resources/iverilog/`, because the backend runs `iverilog -B<dir>` and `vvp -M<dir>` on that one directory. Configure without optional dependencies that are not needed (for example readline) and bundle any remaining non-default library with the same `RPATH` rule as L2.

- **L4. Bundled executables only:** In the packaged app, `main.js` always passes `ghdlDir` and `iverilogDir` from `process.resourcesPath`, so `PATH` is never consulted for simulators. Executable permissions shall survive `extraResources` packaging. If a bundled simulator is missing or fails, report it (L8); never fall back to a system-installed simulator.

- **L5. Offline use:** After download and the documented AppImage prerequisite (L10), the app and both simulators shall work with no network, no administrator rights, no Docker and no locally installed Node.js, GHDL or Icarus Verilog. A failed update check shall not block use. The only system tools used at run time are those present on every Ubuntu 24.04 desktop (for example `mkfifo` from coreutils).

- **L6. Lifecycle and cleanup:** Start the backend in-process and load the window from `http://127.0.0.1:<port>/` as on Windows. On normal quit, and also on `SIGTERM`, `SIGINT` and `SIGHUP` (logout, closing the launching terminal), quit through the existing `before-quit` teardown so that no GHDL or `vvp` child process survives. A surviving child would also keep the AppImage mount busy.

- **L7. Writable data:** Settings, window state, logs and stored projects stay under Electron's `userData` (normally `~/.config/HDLBoard`, honoring `XDG_CONFIG_HOME`). Simulation working files stay under `os.tmpdir()`. Nothing is written inside the AppImage mount. Existing project files open unchanged.

- **L8. Errors:** If the backend, GHDL or Icarus cannot start, show a readable message that names the failed component and the log file path (`~/.config/HDLBoard/logs/backend.log`).

- **L9. Chromium sandbox on Ubuntu 24.04:** Ubuntu 24.04 restricts unprivileged user namespaces through AppArmor, and an AppImage cannot ship the root-owned `chrome-sandbox` helper. Electron AppImages therefore abort at startup on a default Ubuntu 24.04 desktop unless this is handled. Requirement:
  1. The AppImage shall start on a default Ubuntu 24.04 and Mint 22.x desktop without administrator rights.
  2. The launch path (custom `AppRun` wrapper or equivalent) checks whether user namespaces are usable and adds `--no-sandbox` **only** when they are not. The check must run both when the file is double-clicked and when it is started from a terminal.
  3. Keep the existing renderer restrictions in `main.js` (`sandbox: true` in `webPreferences`, `will-navigate` and `setWindowOpenHandler` guards), so the window only ever shows HDLBoard's own loopback origin and opens external links in the system browser.
  4. Document the trade-off, and an optional AppArmor profile that a lab administrator can install to keep the OS sandbox enabled.

- **L10. FUSE:** Ubuntu 24.04 and Mint 22 ship FUSE 3 but not `libfuse.so.2`. Prefer an AppImage runtime that needs no `libfuse2`. If the electron-builder 25 runtime requires it, document `sudo apt install libfuse2t64` as the prerequisite. Documentation shall warn **not** to install the package named `fuse`, which conflicts with FUSE 3 on these releases.

### 3.2 High priority – build and distribution

- **B1. Layout:** Add `linuxInstaller/` beside `winInstaller/`, containing:

  | File | Purpose |
  |---|---|
  | `README.md` | Maintainer documentation, same structure as `winInstaller/README.md` |
  | `build.sh` | The whole local build: frontend, backend bundle, simulator trees, AppImage, checksum |
  | `fetch-ghdl.sh` | Download, SHA-256 verify, unpack, bundle libraries, write `VERSION.txt` |
  | `build-iverilog.sh` | Download the pinned source, verify, build, assemble the flat tree, write `VERSION.txt` |
  | `verify-simulators.sh` | Smoke test of both trees with a clean `PATH`; `build.sh` fails if it fails |
  | `AppRun` (or launcher) | The sandbox check from L9 |
  | `vendor/`, `output/` | Gitignored, as on Windows |

  The Electron shell stays in `winInstaller/electron/`. Add a `dist:linux` script (`electron-builder --linux AppImage`) and a `linux` section to `electron-builder.yml` (`target: AppImage`, `category: Development`, `artifactName: ${productName}-${version}-linux-x86_64.${ext}`, PNG icon). Extend `make-assets.cjs` to emit a 512×512 PNG icon. Leave the `win` and `nsis` sections untouched.

- **B2. Repeatable inputs:** Pin the GHDL asset name and SHA-256, the Icarus source tag and tarball SHA-256, and the build-base image. Refuse to unpack on a checksum mismatch (same behavior as `fetch-ghdl.ps1`). Each simulator tree contains a `VERSION.txt` with the exact version, source URL, checksum and, for Icarus, the configure options.

- **B3. Compatibility baseline:** Build on `runs-on: ubuntu-24.04` (not `ubuntu-latest`, which will move). In CI, copy the assembled simulator trees into a clean `ubuntu:24.04` container with no extra packages, run `ldd` on every executable and `.vpi` module and fail on any `not found`, then run `verify-simulators.sh` there.

- **B4. GitHub Actions:** Add `.github/workflows/build-linux.yml`, structured like `build-windows.yml`:
  - `workflow_dispatch` (optional version input) → build and upload the AppImage and `.sha256` as workflow artifacts only.
  - `v*` tag → additionally upload both files to the tag's **draft** release, creating the draft if it does not exist. Never publish; publishing stays the maintainer's manual step for both platforms.
  - Both workflows may run at the same time on one tag. Release creation shall tolerate that (create-if-missing, then retry `gh release upload --clobber` if the create lost the race).
  - The log prints the commit SHA and both simulator `VERSION.txt` files.
  - The checksum file is `HDLBoard-<version>-linux-x86_64.AppImage.sha256` in `sha256sum` format, so `sha256sum -c` works.

- **B5. Licenses:** Ship license texts under `resources/` for HDLBoard (GPL-2.0-only), GHDL (GPL-2.0 plus the IEEE library license), Icarus Verilog (GPL-2.0-or-later) and every bundled library (for example the GNAT runtime, GPL with the GCC Runtime Library Exception). Because the AppImage has no installer license page, the maintainer README and the root README state where these files are. For Icarus, which is built from source here, attach the exact source tarball to the release or otherwise make the corresponding source available as GPL requires. *(Not legal advice; the same caveat as `winInstaller/README.md`.)*

### 3.3 Medium priority – user documentation

Add an **"Installing on Linux"** section to the root `README.md` (beside the Windows instructions):

- **D1. Start:** Download, mark as executable (file manager: *Properties → Permissions → Allow executing file as program*; names differ between desktops) or `chmod +x HDLBoard-*.AppImage`, then double-click.
- **D2. Problems:** The FUSE prerequisite from L10, the extraction fallback (`./HDLBoard-*.AppImage --appimage-extract` then `squashfs-root/AppRun`), and that installing a system library requires administrator rights.
- **D3. Facts:** Supported distributions and architecture, offline behavior, bundled simulator versions, checksum verification, where settings, projects and logs live, that updating means replacing the file, and that deleting the AppImage leaves settings and projects in place. No promise of menu integration or automatic updates.

## 4. Implementation order

Each stage is testable on its own before the next starts.

1. **Simulator trees:** `fetch-ghdl.sh`, `build-iverilog.sh`, `verify-simulators.sh`. Done when both trees pass in a clean `ubuntu:24.04` container (B3).
2. **AppImage:** `electron-builder.yml` Linux section, icon, `AppRun` sandbox check, signal handling (L6), `build.sh`. Done when the AppImage starts on a Ubuntu 24.04 desktop and runs one VHDL and one Verilog design.
3. **CI:** `build-linux.yml`. Done when a manual run produces both artifacts and a test tag produces a draft release with both files.
4. **Documentation and acceptance:** README sections, `linuxInstaller/README.md`, the runbook `tests/e2e/linux-appimage.md`, and the checks in section 6.

## 5. Implementation notes

- Package native trees through `extraResources` (outside `app.asar`), as on Windows.
- The Windows 8.3 short-path workaround (`withUsableBundledDir`) is Windows-only. The AppImage mount path (`/tmp/.mount_*`) contains no spaces, but the extraction fallback can. Test Icarus from a spaced and non-ASCII path (for example `~/Nedlastinger/HDL Board ø/`); if `iverilog -B` fails there, fix it in `toolPaths.ts` with a POSIX equivalent (for example a symlink without spaces in the temp directory) and a unit test.
- Keep Linux-specific code in `linuxInstaller/` and behind `process.platform === 'linux'` checks in `main.js`. Do not change shared frontend or backend behavior.

## 6. Acceptance checks

Integration tests that skip a simulator do **not** count as a pass. Add an environment variable (for example `HDLBOARD_REQUIRE_SIMULATORS=1`) that turns the existing "skip if missing" into a failure, and set it in the Linux workflow.

**Automated (CI):**

1. **Artifact:** The workflow produces the versioned AppImage and its `.sha256`; the log shows the commit and both simulator versions.
2. **Simulators in a clean container:** B3 passes.
3. **Backend tests against the packaged trees:** `npm test` and `npm run test:integration` in `server/`, with `GHDL_DIR` and `IVERILOG_DIR` pointing into the extracted AppImage's `resources/`, and `HDLBOARD_REQUIRE_SIMULATORS=1`.
4. **Packaged smoke test:** Start the extracted AppImage under Xvfb, wait for the backend to listen on 127.0.0.1:9010, confirm the page loads, then stop it and confirm no `ghdl` or `vvp` process remains.
5. **Regression:** The frontend tests and the Windows workflow still pass.

**Manual (runbook `tests/e2e/linux-appimage.md`, on real desktops):**

6. **Clean offline start:** On a clean Ubuntu 24.04 desktop and a clean Mint 22.x desktop (no Node.js, GHDL or Icarus; network off), start the actual AppImage by double-click. Record whether `--no-sandbox` was applied (L9).
7. **VHDL:** On the virtual board, a switch drives an LED. A VHDL testbench runs and its waveform opens. `blinkTest.vhdl` toggles at about 2 Hz (250 ms) and stops when requested. This closes the "POSIX pacing not re-checked" gap listed in `winInstaller/README.md`.
8. **Verilog:** The same board and testbench checks with a Verilog design.
9. **Bundled tools only:** With fake failing `ghdl`, `iverilog` and `vvp` first on `PATH`, both languages still work. Launch from another directory and from a path containing a space and `ø`.
10. **Persistence and cleanup:** Save and reopen a project; restart and confirm settings persist. Close the window, and separately kill the app with `SIGTERM`; no simulator process remains and the mount disappears. With a second copy running, it gets port 9011.
11. **Failure:** Remove execute permission from the bundled `ghdl` in an extracted copy; the error names GHDL and the log path.
12. **FUSE fallback:** On a system without `libfuse2`, the documented D2 steps work.

Record in `linuxInstaller/README.md` which checks ran, on which distributions, with which simulator versions, and which could not be completed. Do not list a distribution as supported without a passing manual run.

## 7. References

- [HDLBoard Windows desktop build](https://github.com/rlangoy/HDLBoard/blob/main/winInstaller/README.md)
- [HDLBoard build and test instructions](https://github.com/rlangoy/HDLBoard/blob/main/docs/BUILDING.md)
- [GHDL releases](https://github.com/ghdl/ghdl/releases) (`ghdl-mcode-6.0.0-ubuntu24.04-x86_64.tar.gz`)
- [AppImage best practices](https://docs.appimage.org/reference/best-practices.html)
- [AppImage FUSE troubleshooting](https://docs.appimage.org/user-guide/troubleshooting/fuse.html)
