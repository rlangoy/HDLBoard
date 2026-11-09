#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langoy
#
# Builds the Linux AppImage, linuxAppImage/output/HDLBoard-<version>-x86_64.AppImage,
# from this checkout: linuxAppImage/build.sh run after checking the tools it
# needs. See docs/BUILDING.md "Building the Linux AppImage".
#
#   scripts/build-linux-appImage.sh                           the full build
#   scripts/build-linux-appImage.sh --skip-app-build          repackage only, reusing dist/ and server/dist/
#   scripts/build-linux-appImage.sh --simulators container    build GHDL/Icarus in ubuntu:22.04 (default off 22.04)
#   scripts/build-linux-appImage.sh --simulators native       build them on this host (Ubuntu 22.04 only)

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() { echo "$*" >&2; exit 1; }

command -v node > /dev/null \
  || fail "Node.js is not installed. Install Node 20 or newer from https://nodejs.org/ and run this again."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= 20 )) \
  || fail "Node.js $(node --version) is too old. Install Node 20 or newer from https://nodejs.org/ and run this again."
command -v npm > /dev/null || fail "npm is not installed. It comes with Node.js from https://nodejs.org/."
command -v mksquashfs > /dev/null || fail "mksquashfs is not installed. Install it with: sudo apt install squashfs-tools"
command -v curl > /dev/null || fail "curl is not installed. Install it with: sudo apt install curl"

# Docker builds the simulators off Ubuntu 22.04 and checks them in a clean
# container. build.sh decides whether it is needed; this only warns early.
if ! command -v docker > /dev/null; then
  echo "Note: Docker is not installed. The build needs it unless this is Ubuntu 22.04 with the" >&2
  echo "      simulators already built or --simulators native. See linuxAppImage/README.md." >&2
fi

if ! linuxAppImage/build.sh "$@"; then
  fail "The AppImage build failed - see the output above."
fi

echo
version="$(node -p 'require("./winInstaller/electron/package.json").version')"
appimage="linuxAppImage/output/HDLBoard-${version}-x86_64.AppImage"
[[ -f "${appimage}" ]] || fail "The build finished but ${appimage} is missing."
echo "AppImage: $(realpath "${appimage}")"
