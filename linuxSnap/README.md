# Linux snap

Packages HDLBoard as a strictly confined snap, `hdlboard_<version>_amd64.snap`, for the
[Snap Store](https://snapcraft.io/) and for `snap install --dangerous`. It holds exactly what the
[AppImage](../linuxAppImage/README.md) holds: the frontend, the backend, the Electron runtime, GHDL 6.0.0 and
Icarus Verilog 13.0. Nothing is compiled twice: `build.sh` runs the AppImage build and packs the
**same AppDir** into the snap, so every check the AppImage build makes also covers the snap.

## Building

On x86-64 Linux, with everything the AppImage build needs, plus snapcraft and LXD:

```sh
sudo snap install snapcraft --classic
sudo snap install lxd && sudo lxd init --auto
sudo usermod -aG lxd "$USER"          # build.sh uses `sg lxd` until you log in again

linuxSnap/build.sh                    # or: scripts/build-linux-snap.sh
```

Output: `linuxSnap/output/hdlboard_<version>_amd64.snap` (~101 MB) and its `.sha256`. The AppImage is built
on the way, in `linuxAppImage/output/`.

| Flag | Effect |
|---|---|
| `--skip-appimage-build` | Pack the existing `linuxAppImage/output/AppDir` as it is (a couple of minutes). It must carry this version. |
| `--skip-app-build`, `--simulators …` | Passed to `linuxAppImage/build.sh`. |
| `--clean` | Discard snapcraft's cached build (its LXD instance) first. |
| `--destructive-mode` | Build on the host instead of in LXD. Only on Ubuntu 24.04, the release core24 is based on. |

The first `snapcraft pack` creates an LXD instance and downloads core24 and the GNOME SDK (~10–20 min). Later
builds reuse that instance.

What `build.sh` does:

1. `linuxAppImage/build.sh` (see its README): simulators, frontend, backend, electron-builder, AppDir.
2. `output/project/`: the AppDir as `app/`, without the AppImage-only `.DirIcon` and desktop entry; a
   desktop entry for snapcraft in `usr/share/applications/`; the icon; and `snap/snapcraft.yaml` from
   `snapcraft.yaml.in`, with this version, and grade `devel` for a pre-release (`1.2.4-rc1`), else `stable`.
3. `snapcraft pack` (the `dump` plugin: the files go in unchanged).
4. Checks on the `.snap`: the simulators kept their execute bits, the licenses, icon and desktop entry are
   there, and `meta/snap.yaml` carries this version, strict confinement and the plugs below.

## Testing

```sh
sudo snap install --dangerous linuxSnap/output/hdlboard_*.snap
linuxSnap/smoke-test.sh
```

The same checks as the AppImage's smoke test, against the installed, confined snap (`snap run hdlboard`):
the backend listens on 127.0.0.1 only, the page and window load, a VHDL and a Verilog board run start (live
`ghdl` and `vvp`), and SIGTERM quits through the normal teardown with no simulator left behind.

Then start it from the applications menu like a student would. `sudo snap remove hdlboard` removes it again.

## How the snap is put together

| | |
|---|---|
| Base | `core24`. The simulators are built on Ubuntu 22.04 (glibc 2.35), so they run on core24's newer glibc; they need only glibc, libstdc++, zlib, bzip2 and `/bin/sh`, which core24 has. |
| Libraries | The `gnome` extension supplies GTK 3, fonts, themes and Mesa (from the shared `gnome-46-2404` and `mesa-2404` snaps). The snap itself adds only `libnss3`, `libnspr4` and `libasound2t64`. snapcraft's library linter finds nothing missing; it calls the NSS modules and `libghdlvpi.so` "unused", because they are loaded with `dlopen`. |
| Launcher | The AppImage's own `AppRun`. It sees that it is running as the snap (`$SNAP` is its own directory) and adds `--no-sandbox` without probing, logging `chromium sandbox: off (--no-sandbox) - snap hdlboard: strict confinement instead of Chromium's sandbox`. |
| Settings, projects, logs | `~/snap/hdlboard/current/.config/HDLBoard/` (snapd sets `XDG_CONFIG_HOME`). Kept across updates. `snap remove` keeps a snapshot of it for 31 days; `snap remove --purge` does not. |
| Temporary files | The snap's private `/tmp`. |
| Updates | snapd installs new versions from the Store, so the app never asks GitHub. `main.js` sees `$SNAP` and passes `--hdlboard-updates-managed-by=snap` to the preload. The start-up check is then off whatever was stored, its switch is hidden, and Settings › Updates and About say "New versions are installed automatically by the Snap Store." with no "Check now". |

### Interfaces (plugs)

| Plug | Connected automatically | Why |
|---|---|---|
| `network`, `network-bind` | yes | The backend listens on `127.0.0.1:9010…9019`; GitHub sign-in and publishing. |
| `browser-support` | yes | What Chromium needs (shared memory and so on). **Without `allow-sandbox`**, which would need a manual store review; strict confinement confines the renderer instead. |
| `desktop`, `desktop-legacy`, `wayland`, `x11`, `opengl`, `gsettings` | yes | From the gnome extension: windows, fonts, file dialogs through the portal, opening links in the browser. |
| `home` | yes | A projects folder anywhere in the home folder (not hidden files). |
| `removable-media` | no | Projects on a USB stick: `sudo snap connect hdlboard:removable-media`. |
| `password-manager-service` | no | The GitHub token is kept in the desktop keyring via Electron's `safeStorage`. Without it, Electron falls back to its weaker built-in key. `sudo snap connect hdlboard:password-manager-service`. |

Known harmless AppArmor denials in the kernel log: `/etc/vulkan/…` (Chromium looks for Vulkan drivers, then
uses GL) and `org.bluez` (Chromium's Bluetooth probe). Neither affects the app.

## CI: `.github/workflows/build-snap.yml`

On `ubuntu-22.04`, like the AppImage workflow, sharing its simulator cache:

- **Run workflow** (optional version input) builds the snap, installs it with `--dangerous`, runs
  `smoke-test.sh` under Xvfb, and uploads the `.snap` and `.sha256` as artifacts.
- A **`v*` tag** does the same, then attaches both to the tag's **draft** GitHub release (created if missing,
  as the AppImage and Windows workflows do), and, if the store secret is set, uploads to the store's
  **edge** channel. Promotion to beta/candidate/stable is always by hand.

LXD on the runner needs `iptables -P FORWARD ACCEPT`, because Docker's DROP policy would cut the build instance
off from the archive; the workflow does that.

## Publishing to the Snap Store

Not done yet. The steps, once:

1. Create an account at <https://snapcraft.io/> (Ubuntu One) and `snapcraft login`.
2. `snapcraft register hdlboard` (the name is first come, first served).
3. Upload a first build by hand and look at the result in the store dashboard:
   `snapcraft upload --release=edge linuxSnap/output/hdlboard_<version>_amd64.snap`.
   The automatic review should pass: strict confinement, and no plug that needs a manual review.
4. Optionally ask for auto-connection of `password-manager-service` on the
   [forum](https://forum.snapcraft.io/c/store-requests/19), so the GitHub token is kept in the keyring without a
   manual `snap connect`.
5. For CI uploads, create a credential limited to this snap and the edge channel, and store it as the repository
   secret `SNAPCRAFT_STORE_CREDENTIALS`:

   ```sh
   snapcraft export-login --snaps=hdlboard --channels=edge --acls=package_access,package_push,package_update,package_release -
   ```

   From then on each `v*` tag uploads to edge. Release it to stable with
   `snapcraft release hdlboard <revision> stable`, or from the dashboard.

The store listing (summary, description, links, icon) comes from the snap's own metadata: the summary in
`snapcraft.yaml.in`, the description from the AppStream metainfo
(`linuxAppImage/io.github.rlangoy.HDLBoard.metainfo.xml.in`, shared with the AppImage). Screenshots are added in
the dashboard.

## Tests

| Date | System | What | Result |
|---|---|---|---|
| 2026-11-22 | Ubuntu 22.04 desktop (build host), snapcraft 9.2.1, LXD | `build.sh` (full), `snap install --dangerous`, `smoke-test.sh` | Pass, 11/11; library linter: nothing missing |
| | Ubuntu 24.04 desktop | Install from the store, start from the menu, run designs | not yet run |
| | GitHub Actions | `build-snap.yml` | not yet run |
