#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds the Linux AppImage, end to end, from a clean checkout.
#
#   linuxAppImage/build.sh [--skip-app-build] [--simulators auto|native|container]
#
# Produces linuxAppImage/output/HDLBoard-<version>-x86_64.AppImage
# and its .sha256 (sha256sum format, so `sha256sum -c` works).
#
#   1. GHDL and Icarus trees (fetch-ghdl.sh, build-iverilog.sh). They must be
#      built on Ubuntu 22.04, the oldest supported system: natively when this
#      host is 22.04 (CI), otherwise in the pinned ubuntu:22.04 container.
#   2. verify-simulators.sh, in a clean ubuntu:22.04 container with no extra
#      packages and no network, so a library that only the build machine has
#      fails here and not on a student's desktop.
#   3. Frontend and backend, by their own npm scripts (like build.ps1, this
#      script consumes only their dist/ output).
#   4. resources/ for electron-builder, assembled exactly as build.ps1 does,
#      then `electron-builder --linux dir`.
#   5. The AppImage: linux-unpacked/ plus AppRun (the sandbox check), the
#      .desktop entry and icon, packed with mksquashfs behind the pinned
#      static AppImage runtime, which needs no libfuse2.
#
# Host requirements: Node.js 20+, npm, mksquashfs (squashfs-tools), curl,
# and Docker unless the host is Ubuntu 22.04 with the build packages listed
# in build-iverilog.sh, plus gnat for GHDL.

set -euo pipefail

# The build base for the simulators and the clean container they are checked in.
BUILD_IMAGE="ubuntu:22.04@sha256:076e7bf82319619f28dd0aa9c02ab34b055ad37100395b4f49a2ffba04fb5e11"
BUILD_PACKAGES="build-essential gnat autoconf gperf bison flex zlib1g-dev libbz2-dev curl ca-certificates"
# The static AppImage runtime (FUSE 3 linked in, so no libfuse2 on the host).
# Fixed asset ID from the 2026-10-19 continuous build: the moving tag is not
# used as a download URL. Keep the checksum even if the asset is ever removed.
RUNTIME_TAG="20261019-657374641"
RUNTIME_URL="https://api.github.com/repos/AppImage/type2-runtime/releases/assets/657374641"
RUNTIME_SHA256="617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "${HERE}")"
ELECTRON_DIR="${REPO}/winInstaller/electron"
RES_DIR="${ELECTRON_DIR}/resources"
VENDOR_DIR="${HERE}/vendor"
OUT_DIR="${HERE}/output"

skip_app_build=false
simulators=auto
while (( $# )); do
  case "$1" in
    --skip-app-build) skip_app_build=true; shift ;;
    --simulators) simulators="$2"; shift 2 ;;
    *) echo "usage: $0 [--skip-app-build] [--simulators auto|native|container]" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[36m=== %s ===\033[0m\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }

# Docker, also for a user just added to the docker group in this login
# session (`sg` picks the new group up without logging out).
docker_() {
  if docker info > /dev/null 2>&1; then
    docker "$@"
  elif sg docker -c "docker info" > /dev/null 2>&1; then
    sg docker -c "$(printf '%q ' docker "$@")"
  else
    return 127
  fi
}
have_docker() { docker_ info > /dev/null 2>&1; }

is_ubuntu_2204() { [[ -f /etc/os-release ]] && (. /etc/os-release && [[ "${ID}" == ubuntu && "${VERSION_ID}" == "22.04" ]]); }

# --- 0. One version everywhere: the AppImage is named after it ------------
step "Checking version"
node "${REPO}/tools/bump-version.mjs" --check || die "package.json versions disagree - run: npm run version:bump -- <x.y.z>"
VERSION="$(node -p "require('${ELECTRON_DIR}/package.json').version")"
APPIMAGE_NAME="HDLBoard-${VERSION}-x86_64.AppImage"
echo "  ${APPIMAGE_NAME}"
command -v mksquashfs > /dev/null || die "mksquashfs not found - install squashfs-tools"

# --- 1. Simulator trees, built on Ubuntu 22.04 ----------------------------
step "GHDL and Icarus Verilog trees"
if [[ "${simulators}" == auto ]]; then
  if is_ubuntu_2204; then simulators=native; else simulators=container; fi
fi
if "${HERE}/fetch-ghdl.sh" --check && "${HERE}/build-iverilog.sh" --check; then
  echo "  vendor/ghdl and vendor/iverilog match their pins"
elif [[ "${simulators}" == native ]]; then
  is_ubuntu_2204 || die "--simulators native requires Ubuntu 22.04; use --simulators container"
  "${HERE}/fetch-ghdl.sh"
  "${HERE}/build-iverilog.sh"
elif [[ "${simulators}" == container ]]; then
  have_docker || die "this host is not Ubuntu 22.04 and Docker is not usable - install Docker or use --simulators native"
  echo "  in ${BUILD_IMAGE}"
  docker_ run --rm -v "${HERE}:/work/linuxAppImage" "${BUILD_IMAGE}" bash -c "
    set -e
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq > /dev/null
    apt-get install -y -qq --no-install-recommends ${BUILD_PACKAGES} > /dev/null
    rc=0
    { /work/linuxAppImage/fetch-ghdl.sh && /work/linuxAppImage/build-iverilog.sh; } || rc=\$?
    chown -R $(id -u):$(id -g) /work/linuxAppImage/vendor
    exit \$rc"
else
  die "--simulators must be auto, native or container"
fi
sed 's/^/  /' "${VENDOR_DIR}/ghdl/VERSION.txt" "${VENDOR_DIR}/iverilog/VERSION.txt"

# --- 2. Smoke test, in a clean ubuntu:22.04 -------------------------------
step "Verifying the simulator trees"
if have_docker; then
  echo "  in a clean ${BUILD_IMAGE%@*} (no extra packages, no network)"
  docker_ run --rm --network none \
    -v "${VENDOR_DIR}/ghdl:/sim/ghdl:ro" \
    -v "${VENDOR_DIR}/iverilog:/sim/iverilog:ro" \
    -v "${REPO}/tests/fixtures:/sim/fixtures:ro" \
    -v "${HERE}/verify-simulators.sh:/sim/verify-simulators.sh:ro" \
    "${BUILD_IMAGE}" bash /sim/verify-simulators.sh --ghdl /sim/ghdl --iverilog /sim/iverilog --fixtures /sim/fixtures ||
    die "verify-simulators.sh failed in a clean Ubuntu 22.04 - the trees are not fit to ship"
else
  echo "  warning: no Docker - verifying on this host only, which may have libraries a clean 22.04 lacks" >&2
  "${HERE}/verify-simulators.sh" || die "verify-simulators.sh failed - the trees are not fit to ship"
fi

# --- 3. Frontend and backend ---------------------------------------------
if ! $skip_app_build; then
  step "Building frontend (repo root)"
  [[ -d "${REPO}/node_modules" ]] || npm --prefix "${REPO}" ci
  npm --prefix "${REPO}" run build

  step "Building backend (server/)"
  [[ -d "${REPO}/server/node_modules" ]] || npm --prefix "${REPO}/server" ci
  npm --prefix "${REPO}/server" run build
fi
[[ -f "${REPO}/dist/index.html" ]] || die "no frontend build at ${REPO}/dist - run without --skip-app-build"
[[ -f "${REPO}/server/dist/server.js" ]] || die "no backend build at ${REPO}/server/dist - run without --skip-app-build"

# --- 4. Electron shell, resources/, electron-builder ----------------------
step "Installing desktop build dependencies"
# npm's registry retries do not cover Electron's postinstall download from
# GitHub. Install packages first, then retry that download independently.
[[ -f "${ELECTRON_DIR}/node_modules/electron/install.js" ]] || ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm --prefix "${ELECTRON_DIR}" ci
for attempt in 1 2 3 4; do
  if env -u ELECTRON_SKIP_BINARY_DOWNLOAD node "${ELECTRON_DIR}/node_modules/electron/install.js"; then
    break
  fi
  if (( attempt == 4 )); then
    node "${HERE}/install-electron-fallback.cjs" || die "Electron download failed via both release and asset API endpoints"
    break
  fi
  echo "  Electron download failed; retrying in $((attempt * 10)) seconds (${attempt}/4)"
  sleep "$((attempt * 10))"
done

step "Branding assets"
icon="${ELECTRON_DIR}/build/icon.png"
if [[ ! -f "${icon}" ]]; then
  echo "  rendering icon.png from the project logo"
  render=("${ELECTRON_DIR}/node_modules/.bin/electron" --no-sandbox "${REPO}/winInstaller/make-assets.cjs")
  if [[ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then render=(xvfb-run -a "${render[@]}"); fi
  "${render[@]}"
  # make-assets.cjs also re-renders the Windows assets; those stay as committed.
  git -C "${REPO}" checkout -- winInstaller/electron/build/icon.ico winInstaller/electron/build/installerSidebar.bmp 2> /dev/null || true
  [[ -f "${icon}" ]] || die "icon generation failed"
else
  echo "  using existing build/icon.png"
fi

step "Assembling resources/"
# Rebuilt from scratch every time: a stale frontend or simulator left
# behind here would ship silently.
rm -rf "${RES_DIR}"
mkdir -p "${RES_DIR}"
echo "  backend.mjs (esbuild, ws inlined)"
(cd "${ELECTRON_DIR}" && node build-backend.mjs) || die "backend bundling failed"
echo "  the shell's own tests (backendPort.js)"
shell_tests="$(cd "${ELECTRON_DIR}" && npm test --silent 2>&1)" || { echo "${shell_tests}"; die "the desktop shell's tests failed"; }
echo "  preload.js, settings.default.json"
cp "${ELECTRON_DIR}/preload.js" "${ELECTRON_DIR}/settings.default.json" "${RES_DIR}/"
echo "  frontend/"
cp -a "${REPO}/dist" "${RES_DIR}/frontend"
echo "  ghdl/, iverilog/"
cp -a "${VENDOR_DIR}/ghdl" "${RES_DIR}/ghdl"
cp -a "${VENDOR_DIR}/iverilog" "${RES_DIR}/iverilog"
for f in ghdl/COPYING iverilog/COPYING ghdl/lib/ghdl/src/ieee2008/LICENSE; do
  [[ -f "${RES_DIR}/${f}" ]] || die "resources/${f} is missing - the AppImage must not ship without it"
done

step "Running electron-builder (--linux dir)"
rm -rf "${OUT_DIR}/builder"
(cd "${ELECTRON_DIR}" && node_modules/.bin/electron-builder --linux dir --x64 --publish never \
  -c.directories.output="${OUT_DIR}/builder") || die "electron-builder failed"
unpacked="${OUT_DIR}/builder/linux-unpacked"
[[ -x "${unpacked}/hdlboard" ]] || die "electron-builder produced no ${unpacked}/hdlboard"

# --- 5. The AppImage ------------------------------------------------------
step "Assembling the AppDir"
appdir="${OUT_DIR}/AppDir"
rm -rf "${appdir}"
cp -a "${unpacked}" "${appdir}"
install -m 755 "${HERE}/AppRun" "${appdir}/AppRun"
install -m 644 "${icon}" "${appdir}/hdlboard.png"
ln -s hdlboard.png "${appdir}/.DirIcon"
cat > "${appdir}/hdlboard.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=HDLBoard
Comment=Write VHDL or Verilog and watch it run
Exec=hdlboard %U
Icon=hdlboard
Categories=Development;Electronics;
Terminal=false
StartupWMClass=HDLBoard
X-AppImage-Version=${VERSION}
EOF
install -m 644 "${HERE}/LICENSES.txt" "${appdir}/resources/licenses/README.txt"
# Executable bits must survive extraResources, or spawn() fails with EACCES.
for exe in resources/ghdl/bin/ghdl resources/iverilog/iverilog resources/iverilog/vvp resources/iverilog/ivl resources/iverilog/ivlpp; do
  [[ -x "${appdir}/${exe}" ]] || die "${exe} lost its execute permission in packaging"
done

step "Packing the AppImage"
mkdir -p "${VENDOR_DIR}/downloads"
runtime="${VENDOR_DIR}/downloads/type2-runtime-${RUNTIME_TAG}-x86_64"
if ! echo "${RUNTIME_SHA256}  ${runtime}" | sha256sum -c --status > /dev/null 2>&1; then
  echo "  downloading the AppImage runtime ${RUNTIME_TAG}"
  curl -fsSL --retry 3 -H "Accept: application/octet-stream" -o "${runtime}" "${RUNTIME_URL}"
  if ! echo "${RUNTIME_SHA256}  ${runtime}" | sha256sum -c --status; then
    rm -f "${runtime}"
    die "SHA-256 mismatch for the AppImage runtime ${RUNTIME_TAG} - refusing to use it"
  fi
fi
runtime_headers="$(readelf -l -d "${runtime}")" || die "cannot inspect AppImage runtime (install binutils)"
if grep -Eq 'INTERP|\(NEEDED\)' <<<"${runtime_headers}"; then
  die "AppImage runtime is dynamically linked - refusing to require host libfuse/glibc"
fi
squashfs="${OUT_DIR}/hdlboard.squashfs"
appimage="${OUT_DIR}/${APPIMAGE_NAME}"
rm -f "${squashfs}" "${appimage}" "${appimage}.sha256"
mksquashfs "${appdir}" "${squashfs}" -all-root -noappend -comp zstd -b 1M -quiet -no-progress
cat "${runtime}" "${squashfs}" > "${appimage}"
chmod 755 "${appimage}"
rm -f "${squashfs}"
(cd "${OUT_DIR}" && sha256sum "${APPIMAGE_NAME}" > "${APPIMAGE_NAME}.sha256")

step "Done"
ls -l "${appimage}" "${appimage}.sha256" | awk '{printf "  %6.1f MB  %s\n", $5 / 1048576, $NF}'
