#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds Icarus Verilog from the pinned upstream source tag and assembles
# linuxAppImage/vendor/iverilog/ — the flat tree that ships as
# resources/iverilog/ and that the backend runs as `iverilog -B<dir>` and
# `vvp -M<dir>`.
#
#   linuxAppImage/build-iverilog.sh [--force | --check]
#
# Run it on Ubuntu 22.04, the oldest system the AppImage supports: a binary
# built against a newer glibc does not start on an older one. build.sh runs
# it in the pinned ubuntu:22.04 container when the host is something else.
#
# Why build at all: Ubuntu 24.04 packages Icarus 12.0, upstream publishes no
# Linux binaries, and the Windows build ships 13.0.
#
# Build dependencies (apt): build-essential autoconf gperf bison flex
# zlib1g-dev libbz2-dev curl ca-certificates. libreadline-dev is deliberately
# NOT installed: readline only serves vvp's interactive debugger, which the
# backend never opens, and leaving it out keeps a GPL-3.0 library and a
# dependency outside the default desktop out of the tree. zlib and bzip2 are
# on every Ubuntu desktop and give vvp its compressed FST/LXT waveforms.
#
# Idempotent: a no-op while VERSION.txt matches the pin, unless --force.

set -euo pipefail

IVERILOG_TAG="v13_0"
IVERILOG_VERSION="13.0"
SOURCE_URL="https://github.com/steveicarus/iverilog/archive/refs/tags/${IVERILOG_TAG}.tar.gz"
SOURCE_SHA256="c897bbfa9848688982c6d5c30529fc29d68df0b9ff22ffa73bad89db73a7ce49"
SOURCE_FILE="iverilog-${IVERILOG_TAG}.tar.gz"
# --prefix only matters for the default -B/-M paths compiled into the
# programs; the backend always passes the tree explicitly. Nothing else: the
# defaults leave libvvp and libveriuser out, and the --disable- forms must
# NOT be passed, because Icarus's configure.ac treats any form of
# --enable-libvvp/--disable-libvvp as "enable" (vvp then needs libvvp.so).
CONFIGURE_OPTIONS="--prefix=/opt/hdlboard-iverilog"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="${HERE}/vendor"
TREE_DIR="${VENDOR_DIR}/iverilog"
DOWNLOAD_DIR="${VENDOR_DIR}/downloads"
STAMP="iverilog ${IVERILOG_VERSION} (${IVERILOG_TAG}, built on ubuntu22.04-x86_64 from source, configure ${CONFIGURE_OPTIONS})"

force=false
[[ "${1:-}" == "--force" ]] && force=true

# --check: exit 0 when vendor/iverilog matches the pin, 1 when this script would change it.
if [[ "${1:-}" == "--check" ]]; then
  [[ -f "${TREE_DIR}/VERSION.txt" ]] && grep -qF "${STAMP}" "${TREE_DIR}/VERSION.txt"
  exit
fi

if [[ -f "${TREE_DIR}/VERSION.txt" ]] && ! $force && grep -qF "${STAMP}" "${TREE_DIR}/VERSION.txt"; then
  echo "Icarus Verilog ${IVERILOG_VERSION} already present in vendor/iverilog - nothing to do (use --force to rebuild)."
  exit 0
fi

# Keep the cache stamp truthful even when this script is called directly.
. /etc/os-release
[[ "${ID}" == ubuntu && "${VERSION_ID}" == 22.04 && "$(uname -m)" == x86_64 ]] || {
  echo "Build Icarus on Ubuntu 22.04 x86_64 (use build.sh --simulators container)." >&2
  exit 1
}

missing_tools=()
for tool in gcc g++ make autoconf gperf bison flex curl; do
  command -v "${tool}" > /dev/null || missing_tools+=("${tool}")
done
if (( ${#missing_tools[@]} )); then
  echo "Missing build tools: ${missing_tools[*]}" >&2
  echo "Install: sudo apt install build-essential autoconf gperf bison flex zlib1g-dev libbz2-dev curl" >&2
  exit 1
fi

mkdir -p "${DOWNLOAD_DIR}"
archive="${DOWNLOAD_DIR}/${SOURCE_FILE}"
if [[ -f "${archive}" ]] && echo "${SOURCE_SHA256}  ${archive}" | sha256sum -c --status; then
  echo "Using cached ${SOURCE_FILE}"
else
  echo "Downloading ${SOURCE_URL} ..."
  curl -fsSL --retry 3 -o "${archive}" "${SOURCE_URL}"
fi

echo "Verifying SHA-256 ..."
actual="$(sha256sum "${archive}" | cut -d' ' -f1)"
if [[ "${actual}" != "${SOURCE_SHA256}" ]]; then
  rm -f "${archive}"
  echo "SHA-256 mismatch for ${SOURCE_FILE}:" >&2
  echo "  expected ${SOURCE_SHA256}" >&2
  echo "  actual   ${actual}" >&2
  echo "Refusing to build. If upstream legitimately regenerated the tarball, update SOURCE_SHA256 after verifying it by hand." >&2
  exit 1
fi

work="$(mktemp -d "${VENDOR_DIR}/_build-iverilog.XXXXXX")"
trap 'rm -rf "${work}"' EXIT

echo "Unpacking ..."
tar -xzf "${archive}" -C "${work}"
src="${work}/iverilog-${IVERILOG_TAG#v}"
[[ -f "${src}/configure.ac" ]] || { echo "No configure.ac in ${src} - the tarball layout changed." >&2; exit 1; }

echo "Configuring (${CONFIGURE_OPTIONS}) ..."
cd "${src}"
sh autoconf.sh > /dev/null
# shellcheck disable=SC2086 # the options are a word list on purpose
./configure ${CONFIGURE_OPTIONS} > "${work}/configure.log"

echo "Building with $(nproc) jobs ..."
make -j"$(nproc)" > "${work}/make.log" 2>&1 || { tail -n 40 "${work}/make.log" >&2; exit 1; }
make install DESTDIR="${work}/install" > "${work}/install.log" 2>&1 || { tail -n 40 "${work}/install.log" >&2; exit 1; }

# The flat tree: the two programs beside everything they look up under -B
# and -M (ivl, ivlpp, the targets and their .conf files, the .vpi modules,
# .sft tables and include/). That is what lib/ivl/ holds after an install.
prefix="${work}/install/opt/hdlboard-iverilog"
tree="${work}/tree"
mkdir -p "${tree}"
cp -a "${prefix}/lib/ivl/." "${tree}/"
cp -a "${prefix}/bin/iverilog" "${prefix}/bin/vvp" "${tree}/"
strip --strip-unneeded "${tree}/iverilog" "${tree}/vvp" "${tree}/ivl" "${tree}/ivlpp" "${tree}"/*.tgt "${tree}"/*.vpi 2> /dev/null || true
cp "${src}/COPYING" "${tree}/COPYING"

cat > "${tree}/VERSION.txt" <<EOF
${STAMP}
Source: ${SOURCE_URL}
SHA-256 (${SOURCE_FILE}): ${SOURCE_SHA256}
Repository at this tag: https://github.com/steveicarus/iverilog/tree/${IVERILOG_TAG}
Configure options: ${CONFIGURE_OPTIONS}
Optional libraries: zlib, bzip2 (readline not linked)
Built on: $(. /etc/os-release && echo "${PRETTY_NAME}"), $(gcc --version | head -n 1), glibc $(ldd --version | head -n 1 | awk '{print $NF}')
Bundled libraries: none
EOF

if ldd "${tree}/vvp" | grep -q readline; then
  echo "vvp linked readline; uninstall libreadline-dev (see the header of this script)." >&2
  exit 1
fi

echo "Checking shared-library dependencies ..."
missing="$(find "${tree}" -maxdepth 1 -type f \( -perm -u+x -o -name '*.vpi' -o -name '*.tgt' \) -exec ldd {} \; 2>&1 | grep 'not found' || true)"
if [[ -n "${missing}" ]]; then
  echo "Icarus tree needs libraries that are not on this system:" >&2
  echo "${missing}" >&2
  exit 1
fi

rm -rf "${TREE_DIR}"
mv "${tree}" "${TREE_DIR}"
echo "Icarus Verilog ready in vendor/iverilog: $("${TREE_DIR}/iverilog" -B"${TREE_DIR}" -V 2>&1 | head -n 1)"
