#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Signs HDLBoard.app from the inside out, after build.sh has put the
# simulators into it (electron-builder signs nothing: identity is null in
# electron-builder.yml).
#
#   macDmg/sign.sh <HDLBoard.app>
#
# Ad hoc by default, which needs no Apple account. Apple silicon runs nothing
# unsigned, and electron-builder's changes (the name, Info.plist) invalidate
# the signature Electron ships with. Gatekeeper then asks the student once, on
# the first start (README.md "Installing on macOS").
#
# With MAC_SIGN_IDENTITY set to a Developer ID Application identity in a
# keychain on the search list ("Developer ID Application: Name (TEAMID)"), it
# signs for notarization instead: that identity, the hardened runtime, a secure
# timestamp, and entitlements.plist on every program. Not yet run: there is no
# Developer ID for this project (macDmg/README.md "Notarization").
#
# Order: every Mach-O file, then the bundles deepest first (Electron's
# frameworks and helper apps), then the app, so each signature seals signed
# contents. Finally codesign --verify --deep --strict.

set -euo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${MAC_DIR}/common.sh"

[[ $# == 1 && -d "$1" && "$1" == *.app ]] || { echo "usage: $0 <HDLBoard.app>" >&2; exit 2; }
app="$(cd "$1" && pwd)"
identity="${MAC_SIGN_IDENTITY:--}"

base=(--force --sign "${identity}")
program=("${base[@]}")
if [[ "${identity}" == "-" ]]; then
  echo "Signing ${app##*/} ad hoc"
else
  echo "Signing ${app##*/} as ${identity} (hardened runtime)"
  base+=(--options runtime --timestamp)
  program=("${base[@]}" --entitlements "${MAC_DIR}/entitlements.plist")
fi

count=0
while IFS= read -r -d '' f; do
  # Programs get the entitlements; libraries and bundles loaded into them do not.
  case "$(file -b "$f")" in
    *executable*) codesign "${program[@]}" "$f" ;;
    *) codesign "${base[@]}" "$f" ;;
  esac
  count=$((count + 1))
done < <(macho_files "${app}/Contents")

# Frameworks and helper apps, deepest first. awk prefixes each path with its
# depth; names hold spaces ("HDLBoard Helper (GPU).app") but no newlines.
while IFS= read -r bundle; do
  case "${bundle}" in
    *.app) codesign "${program[@]}" "${bundle}" ;;
    *) codesign "${base[@]}" "${bundle}" ;;
  esac
  count=$((count + 1))
done < <(find "${app}/Contents" -type d \( -name '*.framework' -o -name '*.app' \) |
  awk -F/ '{ print NF "\t" $0 }' | sort -rn | cut -f2-)

codesign "${program[@]}" "${app}"
codesign --verify --deep --strict --verbose=1 "${app}"
echo "  signed ${count} files and bundles, then the app"
