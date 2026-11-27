#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds the macOS app, macDmg/output/HDLBoard-<version>-<arm64|x64>.dmg, for
# this Mac's processor: macDmg/build.sh run after checking the tools it needs.
# See docs/BUILDING.md "Building the macOS app".
#
#   scripts/build-mac.sh                    the full build
#   scripts/build-mac.sh --skip-app-build   repackage only, reusing dist/ and server/dist/

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() { echo "$*" >&2; exit 1; }

[[ "$(uname -s)" == Darwin ]] || fail "The macOS app is built on a Mac. GitHub Actions builds both DMGs: .github/workflows/build-mac.yml."
xcode-select -p > /dev/null 2>&1 \
  || fail "The Xcode Command Line Tools are not installed. Install them with: xcode-select --install"
command -v node > /dev/null \
  || fail "Node.js is not installed. Install Node 20 or newer from https://nodejs.org/ and run this again."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= 20 )) \
  || fail "Node.js $(node --version) is too old. Install Node 20 or newer from https://nodejs.org/ and run this again."
command -v brew > /dev/null \
  || fail "Homebrew is not installed (https://brew.sh/). The build needs bison, autoconf and gperf from it."
for formula in bison autoconf gperf; do
  brew list --versions "${formula}" > /dev/null 2>&1 \
    || fail "${formula} is not installed. Install the three with: brew install bison autoconf gperf"
done

if ! macDmg/build.sh "$@"; then
  fail "The macOS build failed - see the output above."
fi

echo
version="$(node -p 'require("./winInstaller/electron/package.json").version')"
case "$(uname -m)" in arm64) arch=arm64 ;; *) arch=x64 ;; esac
dmg="macDmg/output/HDLBoard-${version}-${arch}.dmg"
[[ -f "${dmg}" ]] || fail "The build finished but ${dmg} is missing."
echo "DMG: $(cd "$(dirname "${dmg}")" && pwd)/$(basename "${dmg}")"
