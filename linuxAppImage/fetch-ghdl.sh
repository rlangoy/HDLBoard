#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Downloads the GHDL release the AppImage bundles, verifies it, and assembles
# linuxAppImage/vendor/ghdl/ — the tree that ships as resources/ghdl/.
#
#   linuxAppImage/fetch-ghdl.sh [--force | --check]
#
# The same GHDL version and backend (6.0.0, mcode) as the Windows build. The
# upstream Ubuntu 24.04 asset is used as-is, minus what HDLBoard never runs:
#
#   kept     bin/ghdl, bin/ghwdump, lib/ghdl/ (the analyzed std and IEEE
#            libraries), lib/libghw.so, lib/libghdlvpi.so
#   dropped  lib/libghdl-6_0_0.so, lib/libghdl.a, lib/libghdl.link, include/
#
# The dropped files are libghdl, the library form of GHDL for pyGHDL and
# language servers. The `ghdl` program does not load it. It is also the only
# file in the asset that needs the GNAT runtime (libgnat-13), which is not on
# a default Ubuntu desktop: without it, nothing in the tree needs a library
# outside glibc, libgcc_s and zlib. The check at the end proves that on every
# run, so a future GHDL that links libgnat into the program fails here.
#
# Idempotent: a no-op while VERSION.txt matches the pin, unless --force.

set -euo pipefail

GHDL_TAG="v6.0.0"
GHDL_ASSET="ghdl-mcode-6.0.0-ubuntu24.04-x86_64.tar.gz"
# The digest GitHub publishes for the asset (releases API, "digest" field).
GHDL_SHA256="30d6a977b8456d140bbafecbbe64b1947a3d92eeae8f5e6d9f528a174f9566e7"

ASSET_URL="https://github.com/ghdl/ghdl/releases/download/${GHDL_TAG}/${GHDL_ASSET}"
# The release archive carries no license text; GPL-2.0 distribution requires
# it, so it comes from the repository at the same tag.
COPYING_URL="https://raw.githubusercontent.com/ghdl/ghdl/${GHDL_TAG}/COPYING.md"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="${HERE}/vendor"
GHDL_DIR="${VENDOR_DIR}/ghdl"
DOWNLOAD_DIR="${VENDOR_DIR}/downloads"
STAMP="ghdl ${GHDL_TAG} mcode ubuntu24.04-x86_64 (${GHDL_ASSET})"

force=false
[[ "${1:-}" == "--force" ]] && force=true

# --check: exit 0 when vendor/ghdl matches the pin, 1 when this script would change it.
if [[ "${1:-}" == "--check" ]]; then
  [[ -f "${GHDL_DIR}/VERSION.txt" ]] && grep -qF "${STAMP}" "${GHDL_DIR}/VERSION.txt"
  exit
fi

if [[ -f "${GHDL_DIR}/VERSION.txt" ]] && ! $force && grep -qF "${STAMP}" "${GHDL_DIR}/VERSION.txt"; then
  echo "GHDL ${GHDL_TAG} already present in vendor/ghdl - nothing to do (use --force to refetch)."
  exit 0
fi

mkdir -p "${DOWNLOAD_DIR}"
archive="${DOWNLOAD_DIR}/${GHDL_ASSET}"

if [[ -f "${archive}" ]] && echo "${GHDL_SHA256}  ${archive}" | sha256sum -c --status; then
  echo "Using cached ${GHDL_ASSET}"
else
  echo "Downloading ${GHDL_ASSET} ..."
  curl -fsSL --retry 3 -o "${archive}" "${ASSET_URL}"
fi

echo "Verifying SHA-256 ..."
actual="$(sha256sum "${archive}" | cut -d' ' -f1)"
if [[ "${actual}" != "${GHDL_SHA256}" ]]; then
  rm -f "${archive}"
  echo "SHA-256 mismatch for ${GHDL_ASSET}:" >&2
  echo "  expected ${GHDL_SHA256}" >&2
  echo "  actual   ${actual}" >&2
  echo "Refusing to unpack. If the upstream asset was legitimately rewritten, update GHDL_SHA256 in this script after verifying the new file by hand." >&2
  exit 1
fi

unpack="$(mktemp -d "${VENDOR_DIR}/_unpack-ghdl.XXXXXX")"
trap 'rm -rf "${unpack}"' EXIT

echo "Unpacking ..."
tar -xzf "${archive}" -C "${unpack}"
src="${unpack}/${GHDL_ASSET%.tar.gz}"
if [[ ! -x "${src}/bin/ghdl" || ! -d "${src}/lib/ghdl/ieee" ]]; then
  echo "Unpacked archive has no bin/ghdl or lib/ghdl/ieee - the asset layout changed. Inspect ${unpack}." >&2
  trap - EXIT
  exit 1
fi

tree="${unpack}/tree"
mkdir -p "${tree}/bin" "${tree}/lib"
cp -a "${src}/bin/ghdl" "${src}/bin/ghwdump" "${tree}/bin/"
cp -a "${src}/lib/ghdl" "${src}/lib/libghw.so" "${src}/lib/libghdlvpi.so" "${tree}/lib/"

echo "Fetching COPYING (GPL-2.0 text, from the repository at ${GHDL_TAG}) ..."
curl -fsSL --retry 3 -o "${tree}/COPYING" "${COPYING_URL}"

cat > "${tree}/VERSION.txt" <<EOF
${STAMP}
Source: https://github.com/ghdl/ghdl/releases/tag/${GHDL_TAG}
Repository at this tag: https://github.com/ghdl/ghdl/tree/${GHDL_TAG}
SHA-256 (${GHDL_ASSET}): ${GHDL_SHA256}
Left out (libghdl, not run by HDLBoard): lib/libghdl-6_0_0.so lib/libghdl.a lib/libghdl.link include/
Bundled libraries: none (bin/ghdl needs only glibc, libgcc_s and zlib)
EOF

echo "Checking shared-library dependencies ..."
missing="$(find "${tree}/bin" "${tree}/lib" -maxdepth 1 -type f \( -perm -u+x -o -name '*.so' \) -exec ldd {} \; 2>&1 | grep 'not found' || true)"
if [[ -n "${missing}" ]]; then
  echo "GHDL tree needs libraries that are not on this system:" >&2
  echo "${missing}" >&2
  trap - EXIT
  exit 1
fi

rm -rf "${GHDL_DIR}"
mv "${tree}" "${GHDL_DIR}"
echo "GHDL ready in vendor/ghdl: $("${GHDL_DIR}/bin/ghdl" --version | head -n 1)"
