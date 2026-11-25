#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langoy
#
# Builds the snap, linuxSnap/output/hdlboard_<version>_amd64.snap, from this
# checkout: linuxSnap/build.sh run after checking the tools it needs. See
# docs/BUILDING.md "Building the Linux snap".
#
#   scripts/build-linux-snap.sh                        the full build (AppImage first, then the snap)
#   scripts/build-linux-snap.sh --skip-appimage-build  repack the snap from the existing AppDir
#   scripts/build-linux-snap.sh --clean                discard snapcraft's cached build first
#
# Also passes on linuxAppImage/build.sh's --skip-app-build and --simulators.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() { echo "$*" >&2; exit 1; }

command -v node > /dev/null \
  || fail "Node.js is not installed. Install Node 20 or newer from https://nodejs.org/ and run this again."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= 20 )) \
  || fail "Node.js $(node --version) is too old. Install Node 20 or newer from https://nodejs.org/ and run this again."
command -v mksquashfs > /dev/null || fail "mksquashfs is not installed. Install it with: sudo apt install squashfs-tools"
command -v curl > /dev/null || fail "curl is not installed. Install it with: sudo apt install curl"
command -v snapcraft > /dev/null || fail "snapcraft is not installed. Install it with: sudo snap install snapcraft --classic"
if [[ " $* " != *" --destructive-mode "* ]] && ! command -v lxc > /dev/null; then
  fail "LXD is not installed. Install it with: sudo snap install lxd && sudo lxd init --auto && sudo usermod -aG lxd \$USER"
fi

if ! linuxSnap/build.sh "$@"; then
  fail "The snap build failed - see the output above."
fi

echo
version="$(node -p 'require("./winInstaller/electron/package.json").version')"
snap="linuxSnap/output/hdlboard_${version}_amd64.snap"
[[ -f "${snap}" ]] || fail "The build finished but ${snap} is missing."
echo "Snap: $(realpath "${snap}")"
