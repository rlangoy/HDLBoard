#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Notarizes a Developer ID-signed DMG with Apple and staples the ticket to it,
# then rewrites its .sha256. Only for a build signed with MAC_SIGN_IDENTITY
# (sign.sh); an ad hoc build cannot be notarized.
#
#   APPLE_API_KEY_PATH=<AuthKey_XXXX.p8> APPLE_API_KEY_ID=<key id> APPLE_API_ISSUER_ID=<issuer uuid> \
#     macDmg/notarize.sh macDmg/output/HDLBoard-<version>-<arch>.dmg
#
# The key is an App Store Connect API key with the Developer role
# (macDmg/README.md "Notarization"). .github/workflows/build-mac.yml runs this
# only when the repository has those secrets. Not yet run.

set -euo pipefail

[[ $# == 1 && -f "$1" && "$1" == *.dmg ]] || { echo "usage: $0 <HDLBoard-*.dmg>" >&2; exit 2; }
for var in APPLE_API_KEY_PATH APPLE_API_KEY_ID APPLE_API_ISSUER_ID; do
  [[ -n "${!var:-}" ]] || { echo "error: ${var} is not set" >&2; exit 1; }
done
[[ -f "${APPLE_API_KEY_PATH}" ]] || { echo "error: no API key at ${APPLE_API_KEY_PATH}" >&2; exit 1; }
dmg="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
auth=(--key "${APPLE_API_KEY_PATH}" --key-id "${APPLE_API_KEY_ID}" --issuer "${APPLE_API_ISSUER_ID}")

codesign --verify --strict "${dmg}" 2> /dev/null ||
  echo "  note: the DMG itself is not signed; Apple notarizes the app inside it all the same"

echo "Submitting ${dmg##*/} to Apple's notary service (this usually takes a few minutes) ..."
result="$(mktemp)"
trap 'rm -f "${result}"' EXIT
xcrun notarytool submit "${dmg}" "${auth[@]}" --wait --timeout 45m --output-format plist > "${result}"
status="$(/usr/libexec/PlistBuddy -c 'Print :status' "${result}")"
id="$(/usr/libexec/PlistBuddy -c 'Print :id' "${result}")"
echo "  submission ${id}: ${status}"
if [[ "${status}" != Accepted ]]; then
  xcrun notarytool log "${id}" "${auth[@]}" || true
  echo "error: notarization ${status}" >&2
  exit 1
fi

xcrun stapler staple "${dmg}"
xcrun stapler validate "${dmg}"
spctl --assess --type open --context context:primary-signature --verbose=2 "${dmg}"
(cd "$(dirname "${dmg}")" && shasum -a 256 "$(basename "${dmg}")" > "$(basename "${dmg}").sha256")
echo "Notarized and stapled: ${dmg##*/}"
