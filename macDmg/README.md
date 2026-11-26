# macOS app

Packages HDLBoard as a Mac app in a disk image, one per processor:

| File | For | Needs |
|---|---|---|
| `HDLBoard-<version>-arm64.dmg` | Apple silicon (M1 and later) | macOS 14 Sonoma or later |
| `HDLBoard-<version>-x64.dmg` | Intel Macs | macOS 12 Monterey or later |

Each holds what the [AppImage](../linuxAppImage/README.md) holds: the frontend, the backend, the Electron runtime,
GHDL 6.0.0 and Icarus Verilog 13.0. A student opens the DMG, drags HDLBoard to Applications and starts it. No
Homebrew, Node.js, GHDL, Icarus, Docker or Xcode is needed, and it works offline. The app is the same as on
Windows and Linux: the Electron shell in `winInstaller/electron/` starts the backend in its own process on
`127.0.0.1:9010…9019`, and the window loads the page from there. Everything here is **additive**: the Windows,
Linux and browser versions behave as before.

## Building

On a Mac, with the Xcode Command Line Tools, Node 20+ and Homebrew:

```sh
xcode-select --install                # once
brew install bison autoconf gperf     # once; macOS's own bison 2.3 is too old for Icarus

macDmg/build.sh                       # or: scripts/build-mac.sh
```

A Mac builds the app for its own processor only. Apple silicon builds `arm64` and an Intel Mac builds `x64`.
`build.sh` refuses to run in a shell under Rosetta. CI builds both (below).

Output: `macDmg/output/HDLBoard-<version>-<arch>.dmg` and its `.sha256`. `--skip-app-build` reuses the existing
`dist/` and `server/dist/`, to iterate on packaging alone.

What `build.sh` does, in order:

1. **Simulator trees** for this processor, in `vendor/<arch>/` (below). Each is rebuilt only when its pin changes.
2. **`verify-simulators.sh`**: every Mach-O file in both trees is this processor's, loads only system libraries
   (`/usr/lib`, `/System`) or files inside the tree, has no absolute rpath, declares no newer macOS than the app,
   and is signed. Then GHDL analyzes, runs a self-checking testbench and writes a GHW. Icarus compiles the
   fixtures cleanly, passes a batch testbench, writes an FST, and drives a board run through the file
   protocol. Each tool runs with `PATH=/usr/bin:/bin`, from a folder named `hdlboard smoke ø…`. Any failure stops
   the build. (On Linux this runs in a clean container. A Mac has none, so the library checks stand in for it.)
3. **Frontend and backend:** their own `npm run build`.
4. **`resources/`:** assembled exactly as `linuxAppImage/build.sh` and `build.ps1` do, then the shell's own
   tests, then `electron-builder --mac dir`. electron-builder signs nothing (`identity: null`).
5. **The app and the DMG:**
   - The license texts go into `Contents/Resources/licenses/`.
   - The simulators' execute bits and the app's processor are checked.
   - `LSMinimumSystemVersion` is set: 14.0 or 12.0.
   - `sign.sh` signs the app.
   - `hdiutil` packs the app beside a link to `/Applications` (UDZO, HFS+).

## Layout

| File | Purpose |
|---|---|
| `build.sh` | The whole build, as above. |
| `common.sh` | Sourced by the others: this Mac's processor (`ARCH`, `MIN_MACOS`), the Rosetta check, pinned downloads, Mach-O helpers. Written for macOS's bash 3.2 and BSD tools. |
| `fetch-ghdl.sh` | The GHDL tree (below). `--force`, `--check`. |
| `build-iverilog.sh` | Builds the Icarus tree (below). `--force`, `--check`. |
| `verify-simulators.sh` | Step 2. `--ghdl`, `--iverilog`, `--fixtures` to point it elsewhere. |
| `sign.sh` | Signs the app inside out, ad hoc unless `MAC_SIGN_IDENTITY` is set (see [Signing and Gatekeeper](#signing-and-gatekeeper)). |
| `entitlements.plist` | The hardened runtime's entitlements, for a Developer ID build only. |
| `notarize.sh` | Notarizes and staples a Developer ID build. |
| `smoke-test.sh` | The packaged smoke test (see [Testing](#testing)). |
| `LICENSES.txt`, `licenses/` | Ship in `Contents/Resources/licenses/`: where every license text is, and the texts of what is linked into GHDL. |
| `vendor/`, `output/` | Gitignored: downloads, simulator trees, build output. |

Elsewhere: `winInstaller/electron/electron-builder.yml` (its `mac:` section), `package.json` (`dist:mac`),
`main.js` (the darwin parts), `make-assets.cjs` (also writes `build/icon-mac.png`, 1024×1024 on Apple's
icon grid, committed like the other icons), `linuxAppImage/install-electron-fallback.cjs` (also fetches the
macOS Electron), and `.github/workflows/build-mac.yml`.

## The simulator trees

### GHDL: `Contents/Resources/ghdl/`

GHDL **6.0.0** for macOS comes from upstream only for Apple silicon, and only with the LLVM backends; there is
no mcode backend for arm64. So the two processors differ:

| | Apple silicon (arm64) | Intel (x64) |
|---|---|---|
| Backend | **llvm-jit**: compiles in memory, as mcode does. The plain llvm backend would need a linker, so Xcode, on the student's Mac. | **mcode**, as on Windows and Linux |
| Where from | GHDL's own release asset `ghdl-llvm-jit-6.0.0-macos14-aarch64.tar.gz`, pinned by SHA-256 | Built here from the pinned `ghdl-v6.0.0.tar.gz` (the Linux pin) with `--disable-libghdl` |
| Compiler | GHDL's CI, macOS 14 | GNAT 14.2.0-1 from [alire-project/GNAT-FSF-builds](https://github.com/alire-project/GNAT-FSF-builds), pinned by SHA-256, and clang; `MACOSX_DEPLOYMENT_TARGET=12.0` |
| Links | LLVM, zstd and the GNAT runtime statically; otherwise only `/usr/lib` (libSystem, libz, libc++) | The GNAT runtime statically; GCC's `libgcc_s.1.1.dylib`, which goes beside `ghdl` in `bin/` (`@loader_path` rpath); otherwise `/usr/lib` |
| Minimum | macOS 14 (the upstream build) | macOS 12 |

The Intel build is upstream's own recipe up to GHDL 5.1.1 (`ghdl-mcode-5.1.1-macos13-x86_64`). Upstream dropped
it in 6.0.0 only because GitHub retired its macos-13 runners. `fetch-ghdl.sh` deletes the absolute rpaths into
the toolchain that gnatmake records. If a newer Xcode's linker fails on GNAT's objects, set `GHDL_LDFLAGS`
(upstream needed `-Wl,-ld_classic` on Xcode 15). Both trees keep `bin/ghdl`, `bin/ghwdump`, `lib/ghdl/`,
`lib/libghw.dylib` and `lib/libghdlvpi.dylib`, plus `COPYING` from the source tarball and `VERSION.txt`.
`ghdl --version` names the backend: `LLVM JIT code generator` or `mcode JIT code generator`.

### Icarus Verilog: `Contents/Resources/iverilog/`

`build-iverilog.sh` builds **13.0** from the same pinned source tag as Linux (`v13_0`), with clang and Homebrew's
bison. As on Linux, readline (on macOS that would be libedit) and termcap stay out, through configure's cache
variables. `vvp` then links only macOS's own libraries, zlib and bzip2 among them. The flat tree is the same
as on Linux, and the backend runs it as `iverilog -B<dir>` and `vvp -M<dir>`. A tree under a path with a space
(`~/Downloads/HDL Board 2/HDLBoard.app`) is handled as on Linux: the backend links to it from the temporary
folder (`posixLinkPath`).

## Signing and Gatekeeper

The app is signed **ad hoc**, which needs no Apple account. This is the Mac counterpart of the unsigned
Windows installer. Apple silicon runs nothing unsigned at all, so every Mach-O file is signed, inside out:
simulators, Electron's frameworks and helpers, then the app.

Gatekeeper does not trust an ad hoc signature on a downloaded app. On the first start it says *"HDLBoard" Not
Opened* (macOS 15 and 26) or *cannot be opened because Apple cannot check it* (macOS 14). The student allows it once:

- **macOS 15 and 26:** click **Done**, open **System Settings › Privacy & Security**, scroll down to *"HDLBoard" was
  blocked…*, click **Open Anyway** and confirm with the password. From then on it starts normally.
- **macOS 14:** right-click HDLBoard in Applications, choose **Open**, then **Open** again.
- **Either, in Terminal:** `xattr -dr com.apple.quarantine /Applications/HDLBoard.app`.

*Not yet tested on a real Mac:* whether allowing the app also covers `ghdl` and `vvp`, which the app starts from
`Contents/Resources`. If Gatekeeper stops one, the app's start-up check says so (*GHDL could not be started…*),
and the `xattr` line above fixes it. A notarized build does not have the problem.

Each new version is a new ad hoc signature, so after an update macOS asks once more. The keychain also asks
whether HDLBoard may use *HDLBoard Safe Storage*, where the GitHub sign-in is kept: choose **Always Allow**.

### Notarization

With an Apple Developer Program membership ($99/year), the app can be signed with a Developer ID and notarized.
It then opens with no warning at all. `build-mac.yml` does this by itself once the repository has these secrets.
Without them it signs ad hoc, as now. **Not yet run.**

1. In Xcode or at developer.apple.com, create a *Developer ID Application* certificate. Export it with its key
   from Keychain Access as a `.p12` with a password.
2. In App Store Connect › Users and Access › Integrations, create an API key with the *Developer* role. Download
   `AuthKey_<id>.p8` and note the key ID and the issuer ID.
3. Add the repository secrets:

   | Secret | Value |
   |---|---|
   | `MACOS_CERTIFICATE_P12` | `base64 -i certificate.p12` |
   | `MACOS_CERTIFICATE_PASSWORD` | the `.p12`'s password |
   | `MACOS_SIGN_IDENTITY` | `Developer ID Application: <name> (<team id>)` |
   | `APPLE_API_KEY_P8` | the contents of `AuthKey_<id>.p8` |
   | `APPLE_API_KEY_ID` | the key ID |
   | `APPLE_API_ISSUER_ID` | the issuer ID |

With the first three, `sign.sh` signs with the identity, the hardened runtime, a secure timestamp and
`entitlements.plist`. The entitlements let V8, LLVM's JIT and mcode generate code at run time. With all six,
`notarize.sh` also submits the DMG to Apple's notary service, staples the ticket and rewrites the `.sha256`. The
smoke test then also requires Gatekeeper to accept the app. By hand: `MAC_SIGN_IDENTITY="Developer ID
Application: …" macDmg/build.sh`, then `APPLE_API_KEY_PATH=… APPLE_API_KEY_ID=… APPLE_API_ISSUER_ID=…
macDmg/notarize.sh macDmg/output/HDLBoard-*.dmg`.

## Where things live

| What | Where |
|---|---|
| Settings, window state, stored projects, GitHub token, logs | `~/Library/Application Support/HDLBoard/` (`main.js` sets this on macOS; `logs/backend.log`) |
| The projects folder | `~/Documents/HDLBoard Projects` unless one is chosen. macOS asks once before the app opens Documents, Desktop, Downloads or a USB stick. The usage strings in `electron-builder.yml` say why. |
| Simulation working files | `os.tmpdir()` (`/var/folders/…`), as before |
| Inside the app | read-only; nothing is written there |

Uninstalling is moving HDLBoard from Applications to the Trash. The folder above stays.

## How the app differs from the Windows and Linux ones (`main.js`)

- **App menu:** macOS puts the first menu under the app's name. HDLBoard's has *About HDLBoard* (the same dialog
  as the header button), Services, Hide and **Quit ⌘Q**. File, Edit, View and Help follow as elsewhere. Help has
  *Open Logs Folder*, which opens Finder.
- **Closing the window quits**, as on Windows and Linux: the backend and its simulators live with it.
- **Start-up check (L8):** after the window loads, the packaged app starts `ghdl --version` and `vvp -V` from
  its own trees, and names the simulator that cannot run. On Linux this catches a missing library; on a Mac,
  Gatekeeper or a broken signature.
- **Updates:** as on Windows and Linux, the app asks GitHub for the latest release and the student downloads
  the new DMG. Replace the app in Applications; settings and projects stay.
- **Projects page:** a stored project's ⋮ menu says *Show in Finder*.
- `--user-data-dir=<folder>` (Chromium's own switch) puts settings, projects and logs in that folder instead.
  The smoke test uses it.

## Testing

```sh
macDmg/smoke-test.sh [--mounted] [--expect-notarized] macDmg/output/HDLBoard-*.dmg
```

The checks:
- The DMG holds the app and the Applications link, the signature is valid, and the app and both simulators are
  this processor's.
- The app is copied to `…/HDL Board ø/`, or with `--mounted` runs from the DMG itself, with an empty
  `--user-data-dir` that has a space in its name.
- The backend listens on 127.0.0.1 only (`lsof`), and the page and window load.
- A VHDL and a Verilog board run start, with a live `ghdl` and `vvp` (`linuxAppImage/smoke-sessions.mjs`).
- SIGTERM quits through the normal teardown, with no simulator left behind, and the DMG detaches.

Gatekeeper's verdict is printed. It is required only with `--expect-notarized`.

The manual checks on a real Mac are in the runbook [tests/e2e/macos-app.md](../tests/e2e/macos-app.md).

## CI: `.github/workflows/build-mac.yml`

The sibling of `build-linux.yml` and `build-snap.yml`:

- A matrix of **arm64 on `macos-15`** and **x64 on `macos-15-intel`**. macOS 15 is the oldest macOS GitHub
  still offers, since it retired macOS 14 on 2026-11-02.
- **Run workflow** (optional version input) builds both DMGs, then tests each one:
  - checksums;
  - the backend's `npm test` and `npm run test:integration`, with `GHDL_DIR`/`IVERILOG_DIR` in the mounted DMG
    and `HDLBOARD_REQUIRE_SIMULATORS=1`;
  - `smoke-test.sh`.

  It uploads the `.dmg` and `.sha256` as artifacts. A second job runs `smoke-test.sh --mounted` on each DMG
  again on **macOS 26** (`macos-26`, `macos-26-intel`).
- A **`v*` tag** does the same, then attaches both DMGs and their `.sha256` to the tag's **draft** release. It
  creates the draft if it is missing, as the other workflows do. The simulator source tarballs come from
  `build-linux.yml`.
- Signing secrets switch on Developer ID signing and notarization ([Notarization](#notarization)).

## Licenses

The texts sit in `Contents/Resources/`, indexed by `licenses/README.txt` (from `LICENSES.txt`). In Finder:
right-click HDLBoard, *Show Package Contents*.

- HDLBoard: `licenses/HDLBoard-LICENSE.txt` (GPL-2.0-only)
- GHDL: `ghdl/COPYING` (GPL-2.0-or-later); the IEEE libraries: `ghdl/lib/ghdl/src/ieee2008/LICENSE`
- Linked into GHDL: LLVM (`licenses/LLVM-LICENSE.txt`, Apache-2.0 WITH LLVM-exception) and zstd
  (`licenses/zstd-LICENSE.txt`, BSD) on Apple silicon. The GNAT runtime and, on Intel, `libgcc_s` are covered by
  `licenses/GPL-3.0.txt` with `licenses/GCC-RUNTIME-LIBRARY-EXCEPTION.txt`; their source is GCC 14.2.0.
- Icarus Verilog: `iverilog/COPYING` (GPL-2.0-or-later). Built from the same `iverilog-v13_0.tar.gz` that the
  Linux workflow attaches to each release.
- Electron/Chromium: `licenses/LICENSE.electron.txt`, `licenses/LICENSES.chromium.html`

*(Not legal advice; the same caveat as [winInstaller/README.md](../winInstaller/README.md).)*

## Tests

| Date | System | What | Result |
|---|---|---|---|
| | GitHub Actions, macos-15 and macos-15-intel | `build-mac.yml`: build, backend tests against the packaged simulators, `smoke-test.sh` | not yet run |
| | GitHub Actions, macos-26 and macos-26-intel | `smoke-test.sh --mounted` | not yet run |
| | macOS 14, Apple silicon (the arm64 minimum) | Runbook | not yet run: GitHub has no macOS 14 runner any more |
| | A real Mac, Apple silicon and Intel | Runbook (Gatekeeper's Open Anyway, double-click, designs, ⌘Q) | not yet run |
