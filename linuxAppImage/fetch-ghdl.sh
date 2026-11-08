#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds GHDL 6.0.0 mcode from checksum-pinned source on Ubuntu 22.04.
# Retains the historical script name for callers.
# Usage: linuxAppImage/fetch-ghdl.sh [--force | --check]
# Requires build-essential, gnat, zlib1g-dev, curl and ca-certificates.
# libghdl (the Python/language-server library) is not needed by HDLBoard.
#
set -euo pipefail

GHDL_TAG="v6.0.0"
GHDL_ASSET="ghdl-${GHDL_TAG}.tar.gz"
GHDL_SHA256="2d84fbd0b238a26928e89a0256274072c6b40af1969a4f4c7be57ec3515bc622"
ASSET_URL="https://github.com/ghdl/ghdl/archive/refs/tags/${GHDL_TAG}.tar.gz"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="${HERE}/vendor"
GHDL_DIR="${VENDOR_DIR}/ghdl"
DOWNLOAD_DIR="${VENDOR_DIR}/downloads"
STAMP="ghdl ${GHDL_TAG} mcode ubuntu22.04-x86_64 source (${GHDL_SHA256}, --disable-libghdl)"

force=false
[[ "${1:-}" == "--force" ]] && force=true

# --check: exit 0 when vendor/ghdl matches the pin, 1 when this script would change it.
if [[ "${1:-}" == "--check" ]]; then
  [[ -f "${GHDL_DIR}/VERSION.txt" ]] && grep -qF "${STAMP}" "${GHDL_DIR}/VERSION.txt"
  exit
fi

if [[ -f "${GHDL_DIR}/VERSION.txt" ]] && ! $force && grep -qF "${STAMP}" "${GHDL_DIR}/VERSION.txt"; then
  echo "GHDL ${GHDL_TAG} already present in vendor/ghdl - nothing to do (use --force to rebuild)."
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

# Reject a newer build host even when invoked directly.
. /etc/os-release
[[ "${ID}" == ubuntu && "${VERSION_ID}" == 22.04 && "$(uname -m)" == x86_64 ]] || {
  echo "Build GHDL on Ubuntu 22.04 x86_64 (use build.sh --simulators container)." >&2
  exit 1
}
for tool in gcc gnatmake make; do
  command -v "${tool}" > /dev/null || { echo "Missing build tool: ${tool}" >&2; exit 1; }
done

unpack="$(mktemp -d "${VENDOR_DIR}/_build-ghdl.XXXXXX")"
trap 'rm -rf "${unpack}"' EXIT
tar -xzf "${archive}" -C "${unpack}"
src="${unpack}/ghdl-${GHDL_TAG#v}"
mkdir -p "${unpack}/build"
(
  cd "${unpack}/build" || exit 1
  "${src}/configure" --prefix=/opt/hdlboard-ghdl --disable-libghdl || exit 1
  # GHDL uses gnatmake internally; parallelize that rather than make.
  make GNATMAKE="gnatmake -j$(nproc)" || exit 1
  make install DESTDIR="${unpack}/install"
) > "${unpack}/build.log" 2>&1 || { tail -n 60 "${unpack}/build.log" >&2; exit 1; }

prefix="${unpack}/install/opt/hdlboard-ghdl"
tree="${unpack}/tree"
mkdir -p "${tree}/bin" "${tree}/lib"
cp -a "${prefix}/bin/ghdl" "${prefix}/bin/ghwdump" "${tree}/bin/"
cp -a "${prefix}/lib/ghdl" "${prefix}/lib/libghw.so" "${prefix}/lib/libghdlvpi.so" "${tree}/lib/"
cp "${src}/COPYING.md" "${tree}/COPYING"
cat > "${tree}/VERSION.txt" <<EOF
${STAMP}
Source: ${ASSET_URL}
Repository at this tag: https://github.com/ghdl/ghdl/tree/${GHDL_TAG}
SHA-256 (${GHDL_ASSET}): ${GHDL_SHA256}
Configure options: --prefix=/opt/hdlboard-ghdl --disable-libghdl
Built on: ${PRETTY_NAME}, $(gnatmake --version | head -n 1)
Bundled libraries: none (GNAT runtime linked statically by upstream build)
EOF

# GNAT is present on the build machine but not on a clean desktop.
if ldd "${tree}/bin/ghdl" | grep -q libgnat; then
  echo "GHDL unexpectedly links a shared GNAT runtime." >&2
  exit 1
fi

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
