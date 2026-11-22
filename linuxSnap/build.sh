#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds the snap, linuxSnap/output/hdlboard_<version>_amd64.snap, and its
# .sha256 (sha256sum format).
#
#   linuxSnap/build.sh [--skip-appimage-build] [--destructive-mode] [--clean]
#                      [any linuxAppImage/build.sh option]
#
#   1. linuxAppImage/build.sh, which builds and checks everything (simulators
#      in a clean 22.04, frontend, backend, electron-builder) and leaves the
#      finished AppDir in linuxAppImage/output/AppDir. Its options
#      (--skip-app-build, --simulators ...) are passed on.
#      --skip-appimage-build reuses that AppDir as it is.
#   2. output/project/: the AppDir as app/, plus snapcraft.yaml from
#      snapcraft.yaml.in with this build's version.
#   3. snapcraft pack, in an LXD container by default (snapcraft's own
#      default for core24), or with --destructive-mode on an Ubuntu 24.04
#      host itself. --clean throws away snapcraft's cached build first.
#   4. Checks on the result: the simulators kept their execute bits, the
#      metadata carries this version, and the strict-confinement plugs.
#
# Host requirements: those of linuxAppImage/build.sh, plus snapcraft
# (sudo snap install snapcraft --classic) and LXD (sudo snap install lxd &&
# sudo lxd init --auto, and your user in the lxd group). Install and test the
# result with: sudo snap install --dangerous linuxSnap/output/hdlboard_*.snap
# then linuxSnap/smoke-test.sh.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "${HERE}")"
APPIMAGE_DIR="${REPO}/linuxAppImage"
APPDIR="${APPIMAGE_DIR}/output/AppDir"
OUT_DIR="${HERE}/output"
PROJECT="${OUT_DIR}/project"
APP_ID="io.github.rlangoy.HDLBoard"

skip_appimage_build=false
destructive=false
clean=false
appimage_args=()
while (( $# )); do
  case "$1" in
    --skip-appimage-build) skip_appimage_build=true; shift ;;
    --destructive-mode) destructive=true; shift ;;
    --clean) clean=true; shift ;;
    --skip-app-build) appimage_args+=("$1"); shift ;;
    --simulators) appimage_args+=("$1" "$2"); shift 2 ;;
    *) echo "usage: $0 [--skip-appimage-build] [--destructive-mode] [--clean] [--skip-app-build] [--simulators auto|native|container]" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[35m=== snap: %s ===\033[0m\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }

# snapcraft talks to LXD as a member of the lxd group; `sg` picks up a group
# the user was only just added to, without logging out (as build.sh does for docker).
snapcraft_() {
  if $destructive || lxc info > /dev/null 2>&1; then
    snapcraft "$@"
  elif sg lxd -c "lxc info" > /dev/null 2>&1; then
    sg lxd -c "$(printf '%q ' snapcraft "$@")"
  else
    die "LXD is not usable - install it (sudo snap install lxd && sudo lxd init --auto, then sudo usermod -aG lxd \$USER) or use --destructive-mode on Ubuntu 24.04"
  fi
}

# --- 0. Version and tools ---------------------------------------------------
step "Checking version and tools"
command -v node > /dev/null || die "Node.js not found - install Node 20+"
node "${REPO}/tools/bump-version.mjs" --check || die "package.json versions disagree - run: npm run version:bump -- <x.y.z>"
VERSION="$(node -p "require('${REPO}/winInstaller/electron/package.json').version")"
(( ${#VERSION} <= 32 )) || die "snap versions are at most 32 characters: ${VERSION}"
# A pre-release (1.2.4-rc1) is a devel snap: the store only lets devel
# snaps into the edge and beta channels, never candidate or stable.
if [[ "${VERSION}" == *-* ]]; then GRADE=devel; else GRADE=stable; fi
SNAP_FILE="hdlboard_${VERSION}_amd64.snap"
echo "  ${SNAP_FILE} (grade ${GRADE})"
command -v snapcraft > /dev/null || die "snapcraft not found - install it: sudo snap install snapcraft --classic"
command -v unsquashfs > /dev/null || die "unsquashfs not found - install squashfs-tools"
if $destructive; then
  (. /etc/os-release && [[ "${ID}" == ubuntu && "${VERSION_ID}" == 24.04 ]]) ||
    die "--destructive-mode builds on the host itself, so the host must be Ubuntu 24.04 (core24)"
fi

# --- 1. The AppImage build, for its AppDir ------------------------------------
if $skip_appimage_build; then
  step "Reusing ${APPDIR#"${REPO}"/}"
else
  step "Building the AppImage (linuxAppImage/build.sh)"
  "${APPIMAGE_DIR}/build.sh" ${appimage_args[@]+"${appimage_args[@]}"}
fi
[[ -x "${APPDIR}/hdlboard" && -x "${APPDIR}/AppRun" ]] || die "no AppDir at ${APPDIR} - run without --skip-appimage-build"
metainfo="${APPDIR}/usr/share/metainfo/${APP_ID}.metainfo.xml"
grep -q "release version=\"${VERSION}\"" "${metainfo}" ||
  die "the AppDir is not version ${VERSION} (see ${metainfo}) - run without --skip-appimage-build"

# --- 2. The snapcraft project -----------------------------------------------
step "Assembling output/project/"
mkdir -p "${PROJECT}"
# app/ is rebuilt every time; snapcraft notices the change and re-stages it.
rm -rf "${PROJECT}/app" "${PROJECT}/snap" "${PROJECT}/hdlboard.png" "${PROJECT}"/*.snap
cp -a "${APPDIR}" "${PROJECT}/app"
# AppImage-only files: the icon goes to meta/gui (the yaml's icon:), the
# desktop entry is rewritten below for snapcraft.
mv "${PROJECT}/app/hdlboard.png" "${PROJECT}/hdlboard.png"
rm -f "${PROJECT}/app/.DirIcon" "${PROJECT}/app/${APP_ID}.desktop"
mkdir -p "${PROJECT}/app/usr/share/applications"
# snapcraft points Exec at the snap's command and Icon at meta/gui/icon.png.
cat > "${PROJECT}/app/usr/share/applications/${APP_ID}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=HDLBoard
Comment=Write VHDL or Verilog and watch it run
Exec=hdlboard %U
Icon=hdlboard
Categories=Development;Electronics;
Terminal=false
StartupWMClass=HDLBoard
EOF
mkdir -p "${PROJECT}/snap"
sed -e "s/@VERSION@/${VERSION}/g" -e "s/@GRADE@/${GRADE}/g" "${HERE}/snapcraft.yaml.in" > "${PROJECT}/snap/snapcraft.yaml"
grep -q "^version: \"${VERSION}\"$" "${PROJECT}/snap/snapcraft.yaml" || die "snapcraft.yaml does not carry version ${VERSION}"

# --- 3. snapcraft pack -------------------------------------------------------
step "snapcraft pack ($($destructive && echo "on this host" || echo "in LXD"))"
# snapcraft only writes inside its project tree, and the path is the one
# inside the LXD instance, so it must be relative. Moved out below.
pack_args=(--output "${SNAP_FILE}")
$destructive && pack_args+=(--destructive-mode)
rm -f "${OUT_DIR}/${SNAP_FILE}" "${OUT_DIR}/${SNAP_FILE}.sha256"
if $clean; then (cd "${PROJECT}" && snapcraft_ clean $($destructive && echo --destructive-mode)); fi
(cd "${PROJECT}" && snapcraft_ pack "${pack_args[@]}") || die "snapcraft pack failed"
[[ -f "${PROJECT}/${SNAP_FILE}" ]] || die "snapcraft produced no ${SNAP_FILE}"
mv "${PROJECT}/${SNAP_FILE}" "${OUT_DIR}/${SNAP_FILE}"

# --- 4. Checks on the snap itself ---------------------------------------------
step "Checking the snap"
listing="$(unsquashfs -lls "${OUT_DIR}/${SNAP_FILE}")"
for exe in AppRun hdlboard resources/ghdl/bin/ghdl resources/iverilog/iverilog resources/iverilog/vvp resources/iverilog/ivl resources/iverilog/ivlpp; do
  grep -Eq "^-rwx.* squashfs-root/${exe}$" <<<"${listing}" || die "${exe} is missing or lost its execute permission in the snap"
done
for f in resources/ghdl/COPYING resources/iverilog/COPYING resources/licenses/HDLBoard-LICENSE.txt meta/gui/icon.png meta/gui/hdlboard.desktop; do
  grep -q " squashfs-root/${f}$" <<<"${listing}" || die "${f} is missing from the snap"
done
snap_yaml="$(unsquashfs -cat "${OUT_DIR}/${SNAP_FILE}" meta/snap.yaml)"
grep -q "^version: '\?${VERSION}'\?$" <<<"${snap_yaml}" || die "meta/snap.yaml does not carry version ${VERSION}"
grep -q "^confinement: strict$" <<<"${snap_yaml}" || die "the snap is not strictly confined"
for plug in network-bind browser-support home; do
  grep -q "^ *- ${plug}$" <<<"${snap_yaml}" || die "meta/snap.yaml lacks the ${plug} plug"
done
(cd "${OUT_DIR}" && sha256sum "${SNAP_FILE}" > "${SNAP_FILE}.sha256")

step "Done"
ls -l "${OUT_DIR}/${SNAP_FILE}" "${OUT_DIR}/${SNAP_FILE}.sha256" | awk '{printf "  %6.1f MB  %s\n", $5 / 1048576, $NF}'
echo "  install and test: sudo snap install --dangerous ${OUT_DIR#"${REPO}"/}/${SNAP_FILE} && linuxSnap/smoke-test.sh"
