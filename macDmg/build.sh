#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds the macOS app for this Mac's processor, end to end, from a clean
# checkout:
#
#   macDmg/build.sh [--skip-app-build]
#
# Produces macDmg/output/HDLBoard-<version>-<arm64|x64>.dmg and its .sha256
# (shasum -a 256 format, so `shasum -a 256 -c` works). Apple silicon builds
# arm64, an Intel Mac x64; one Mac cannot build the other's (common.sh).
#
#   1. GHDL and Icarus trees for this processor (fetch-ghdl.sh,
#      build-iverilog.sh), cached in vendor/<arch>/ until a pin changes.
#   2. verify-simulators.sh: the trees load on MIN_MACOS with system libraries
#      only, and really simulate. Any failure stops the build.
#   3. Frontend and backend, by their own npm scripts (only their dist/ is used).
#   4. resources/ for electron-builder, assembled exactly as linuxAppImage/build.sh
#      and build.ps1 do, then `electron-builder --mac dir`.
#   5. Licenses into the app, checks, sign.sh (ad hoc, or Developer ID when
#      MAC_SIGN_IDENTITY is set), then the DMG: the app beside a link to
#      /Applications, packed with hdiutil.
#
# Host requirements: macOS with the Xcode Command Line Tools, Node.js 20+, and
# from Homebrew bison, autoconf and gperf (brew install bison autoconf gperf).

set -euo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${MAC_DIR}/common.sh"
REPO="$(dirname "${MAC_DIR}")"
ELECTRON_DIR="${REPO}/winInstaller/electron"
RES_DIR="${ELECTRON_DIR}/resources"
OUT_DIR="${MAC_DIR}/output"

skip_app_build=false
while (( $# )); do
  case "$1" in
    --skip-app-build) skip_app_build=true; shift ;;
    *) echo "usage: $0 [--skip-app-build]" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[34m=== mac: %s ===\033[0m\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }

# --- 0. Version and tools ---------------------------------------------------
step "Checking version and tools"
command -v node > /dev/null || die "Node.js not found - install Node 20+"
node "${REPO}/tools/bump-version.mjs" --check || die "package.json versions disagree - run: npm run version:bump -- <x.y.z>"
VERSION="$(node -p "require('${ELECTRON_DIR}/package.json').version")"
DMG_NAME="HDLBoard-${VERSION}-${ARCH}.dmg"
echo "  ${DMG_NAME} (macOS ${MIN_MACOS}+, $(uname -m))"
for tool in hdiutil codesign lipo otool install_name_tool; do
  command -v "${tool}" > /dev/null || die "${tool} not found - install the Xcode Command Line Tools: xcode-select --install"
done

# --- 1. Simulator trees -------------------------------------------------------
step "GHDL and Icarus Verilog trees (${ARCH})"
"${MAC_DIR}/fetch-ghdl.sh"
"${MAC_DIR}/build-iverilog.sh"
sed 's/^/  /' "${VENDOR_DIR}/ghdl/VERSION.txt" "${VENDOR_DIR}/iverilog/VERSION.txt"

# --- 2. Smoke test of the trees ----------------------------------------------
step "Verifying the simulator trees"
"${MAC_DIR}/verify-simulators.sh" || die "verify-simulators.sh failed - the trees are not fit to ship"

# --- 3. Frontend and backend -----------------------------------------------
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
# As linuxAppImage/build.sh: packages first, then Electron's own download with
# retries, then the same checksum-pinned archive through GitHub's asset API.
[[ -f "${ELECTRON_DIR}/node_modules/electron/install.js" ]] || ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm --prefix "${ELECTRON_DIR}" ci
for attempt in 1 2 3 4; do
  if env -u ELECTRON_SKIP_BINARY_DOWNLOAD node "${ELECTRON_DIR}/node_modules/electron/install.js"; then
    break
  fi
  if (( attempt == 4 )); then
    node "${REPO}/linuxAppImage/install-electron-fallback.cjs" "${DOWNLOAD_DIR}" || die "Electron download failed via both release and asset API endpoints"
    break
  fi
  echo "  Electron download failed; retrying in $((attempt * 10)) seconds (${attempt}/4)"
  sleep "$((attempt * 10))"
done
electron_dist="${ELECTRON_DIR}/node_modules/electron/dist"
[[ -x "${electron_dist}/Electron.app/Contents/MacOS/Electron" ]] || die "no Electron.app in ${electron_dist}"
[[ "$(lipo -archs "${electron_dist}/Electron.app/Contents/MacOS/Electron")" == "${MACHO_ARCH}" ]] ||
  die "node_modules/electron holds another processor's Electron - delete winInstaller/electron/node_modules and run again"

icon="${ELECTRON_DIR}/build/icon-mac.png"
[[ -f "${icon}" ]] || die "no ${icon#"${REPO}"/} - render it with winInstaller/make-assets.cjs (it is committed)"

step "Assembling resources/"
# Rebuilt from scratch every time: a stale frontend or simulator left behind
# here would ship silently.
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
  [[ -f "${RES_DIR}/${f}" ]] || die "resources/${f} is missing - the app must not ship without it"
done

step "Running electron-builder (--mac dir --${ARCH})"
rm -rf "${OUT_DIR}/builder"
# electronDist: the Electron installed and checked above, not a second download.
# Signing is sign.sh's, after the simulators are in: identity is null in the yml.
(cd "${ELECTRON_DIR}" && CSC_IDENTITY_AUTO_DISCOVERY=false node_modules/.bin/electron-builder --mac dir "--${ARCH}" --publish never \
  -c.electronDist="${electron_dist}" \
  -c.directories.output="${OUT_DIR}/builder") || die "electron-builder failed"
app=""
for candidate in "${OUT_DIR}/builder"/mac*/HDLBoard.app; do
  [[ -d "${candidate}" ]] && app="${candidate}"
done
[[ -n "${app}" ]] || die "electron-builder produced no HDLBoard.app under ${OUT_DIR}/builder"

# --- 5. Into the app, signing, the DMG ---------------------------------------
step "Finishing HDLBoard.app"
contents="${app}/Contents"
mkdir -p "${contents}/Resources/licenses"
install -m 644 "${MAC_DIR}/LICENSES.txt" "${contents}/Resources/licenses/README.txt"
install -m 644 "${MAC_DIR}/licenses/"*.txt "${contents}/Resources/licenses/"
# Electron's own notices sit beside Electron.app in its download, outside the bundle.
[[ -f "${electron_dist}/LICENSE" && -f "${electron_dist}/LICENSES.chromium.html" ]] ||
  die "no LICENSE or LICENSES.chromium.html beside ${electron_dist}/Electron.app"
install -m 644 "${electron_dist}/LICENSE" "${contents}/Resources/licenses/LICENSE.electron.txt"
install -m 644 "${electron_dist}/LICENSES.chromium.html" "${contents}/Resources/licenses/"
for f in HDLBoard-LICENSE.txt README.txt LLVM-LICENSE.txt GPL-3.0.txt GCC-RUNTIME-LIBRARY-EXCEPTION.txt LICENSE.electron.txt; do
  [[ -f "${contents}/Resources/licenses/${f}" ]] || die "Resources/licenses/${f} is missing - the app must not ship without it"
done
# Executable bits must survive extraResources, or spawn() fails with EACCES.
for exe in Resources/ghdl/bin/ghdl Resources/iverilog/iverilog Resources/iverilog/vvp Resources/iverilog/ivl Resources/iverilog/ivlpp; do
  [[ -x "${contents}/${exe}" ]] || die "${exe} lost its execute permission in packaging"
done
[[ "$(lipo -archs "${contents}/MacOS/HDLBoard")" == "${MACHO_ARCH}" ]] || die "HDLBoard.app is not a ${MACHO_ARCH} app"
# The oldest macOS the simulators load on (verify-simulators.sh checked them
# against it). Set here rather than through electron-builder's -c option, whose
# parser may read 14.0 as the number 14; before signing, which seals Info.plist.
plist="${contents}/Info.plist"
/usr/libexec/PlistBuddy -c "Set :LSMinimumSystemVersion ${MIN_MACOS}" "${plist}" 2> /dev/null ||
  /usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string ${MIN_MACOS}" "${plist}"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "${plist}")" == "${MIN_MACOS}" ]] ||
  die "Info.plist does not declare macOS ${MIN_MACOS} as the minimum"
# electron-builder may leave a pre-release suffix (1.2.4-rc1) out of the short version.
short_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${plist}")"
[[ "${short_version}" == "${VERSION}" || "${short_version}" == "${VERSION%%-*}" ]] ||
  die "Info.plist carries version ${short_version}, not ${VERSION}"

step "Signing"
"${MAC_DIR}/sign.sh" "${app}"

step "Packing ${DMG_NAME}"
staging="${OUT_DIR}/dmg"
dmg="${OUT_DIR}/${DMG_NAME}"
rm -rf "${staging}" "${dmg}" "${dmg}.sha256"
mkdir -p "${staging}"
ditto "${app}" "${staging}/HDLBoard.app"
ln -s /Applications "${staging}/Applications"
# hdiutil now and then fails with "Resource busy" on CI machines; it is not the input's fault.
for attempt in 1 2 3; do
  if hdiutil create -volname "HDLBoard ${VERSION}" -srcfolder "${staging}" -fs HFS+ -format UDZO \
    -imagekey zlib-level=9 -ov "${dmg}" > /dev/null; then
    break
  fi
  (( attempt < 3 )) || die "hdiutil create failed"
  echo "  hdiutil create failed; retrying in 10 seconds (${attempt}/3)"
  sleep 10
done
rm -rf "${staging}"
if [[ "${MAC_SIGN_IDENTITY:--}" != "-" ]]; then
  codesign --force --sign "${MAC_SIGN_IDENTITY}" --timestamp "${dmg}"
fi
hdiutil verify "${dmg}" > /dev/null 2>&1 || die "hdiutil verify failed for ${DMG_NAME}"
(cd "${OUT_DIR}" && shasum -a 256 "${DMG_NAME}" > "${DMG_NAME}.sha256")

step "Done"
ls -l "${dmg}" "${dmg}.sha256" | awk '{printf "  %6.1f MB  %s\n", $5 / 1048576, $NF}'
echo "  test: macDmg/smoke-test.sh ${dmg#"${REPO}"/}"
