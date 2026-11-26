#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Puts GHDL 6.0.0 for this Mac's processor in macDmg/vendor/<arch>/ghdl, the
# tree that ships as HDLBoard.app/Contents/Resources/ghdl/.
#
#   macDmg/fetch-ghdl.sh [--force | --check]
#
#   arm64 (Apple silicon): upstream's own macOS 14 build with the llvm-jit
#     backend, checksum-pinned. GHDL has no mcode backend for arm64. llvm-jit
#     compiles in memory as mcode does, so, unlike the plain llvm backend, it
#     needs no linker or Xcode on the student's Mac. Its ghdl links LLVM, zstd
#     and the GNAT runtime statically and loads only system libraries.
#   x64 (Intel): built here with the mcode backend, as on Windows and Linux,
#     from the checksum-pinned GHDL source (the tarball linuxAppImage/fetch-ghdl.sh
#     pins) and the checksum-pinned GNAT 14.2.0-1 from alire-project/GNAT-FSF-builds.
#     That is upstream's own recipe up to 5.1.1 (ghdl-mcode-*-macos13-x86_64),
#     dropped in 6.0.0 only because GitHub retired its macos-13 runners. The GNAT
#     runtime is linked statically; GCC's libgcc_s.1.1.dylib goes beside ghdl in
#     bin/, where its @loader_path rpath finds it.
#
# Both trees keep bin/ghdl, bin/ghwdump, lib/ghdl/, lib/libghw.dylib and
# lib/libghdlvpi.dylib, plus COPYING (from the source tarball) and VERSION.txt.
# Every Mach-O file is signed ad hoc. verify-simulators.sh then checks the tree.
#
# Idempotent: a no-op while VERSION.txt matches the pin, unless --force.

set -euo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${MAC_DIR}/common.sh"

GHDL_TAG="v6.0.0"
GHDL_VERSION="6.0.0"
# The source, for COPYING on both arches and the x64 build. Same pin as Linux.
SOURCE_URL="https://github.com/ghdl/ghdl/archive/refs/tags/${GHDL_TAG}.tar.gz"
SOURCE_SHA256="2d84fbd0b238a26928e89a0256274072c6b40af1969a4f4c7be57ec3515bc622"
SOURCE_FILE="ghdl-${GHDL_TAG}.tar.gz"
# arm64: from the release's inventory.json.
BINARY_NAME="ghdl-llvm-jit-${GHDL_VERSION}-macos14-aarch64"
BINARY_URL="https://github.com/ghdl/ghdl/releases/download/${GHDL_TAG}/${BINARY_NAME}.tar.gz"
BINARY_SHA256="d6614149b301d77fae680372ce98d3df4d2932a3e0601bf520e0b962276240f8"
# x64: the GNAT toolchain upstream used for its last Intel builds.
GNAT_VERSION="14.2.0-1"
GNAT_NAME="gnat-x86_64-darwin-${GNAT_VERSION}"
GNAT_URL="https://github.com/alire-project/GNAT-FSF-builds/releases/download/gnat-${GNAT_VERSION}/${GNAT_NAME}.tar.gz"
GNAT_SHA256="bfef513a8f7f665563c1e64046083e52dfd90aa63665bb2248fac293d0ef841e"
CONFIGURE_OPTIONS="--prefix=/opt/hdlboard-ghdl --disable-libghdl"
# Extra linker flags for the x64 build. Upstream needed -Wl,-ld_classic on
# macos-13's Xcode 15; set GHDL_LDFLAGS if a newer Xcode's linker fails too.
GHDL_LDFLAGS="${GHDL_LDFLAGS:-}"

GHDL_DIR="${VENDOR_DIR}/ghdl"
if [[ "${ARCH}" == arm64 ]]; then
  STAMP="ghdl ${GHDL_TAG} llvm-jit macos14-aarch64 upstream (${BINARY_SHA256})"
else
  STAMP="ghdl ${GHDL_TAG} mcode macos-x86_64 source (${SOURCE_SHA256}, GNAT ${GNAT_VERSION}, macOS ${MIN_MACOS}+, ${CONFIGURE_OPTIONS})"
fi

force=false
[[ "${1:-}" == "--force" ]] && force=true

# --check: exit 0 when vendor/<arch>/ghdl matches the pin, 1 when this script would change it.
if [[ "${1:-}" == "--check" ]]; then
  [[ -f "${GHDL_DIR}/VERSION.txt" ]] && grep -qF "${STAMP}" "${GHDL_DIR}/VERSION.txt"
  exit
fi
if [[ -f "${GHDL_DIR}/VERSION.txt" ]] && ! $force && grep -qF "${STAMP}" "${GHDL_DIR}/VERSION.txt"; then
  echo "GHDL ${GHDL_TAG} already present in vendor/${ARCH}/ghdl - nothing to do (use --force to rebuild)."
  exit 0
fi

download_verified "${SOURCE_URL}" "${DOWNLOAD_DIR}/${SOURCE_FILE}" "${SOURCE_SHA256}"
mkdir -p "${VENDOR_DIR}"
work="$(mktemp -d "${VENDOR_DIR}/_build-ghdl.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
tar -xzf "${DOWNLOAD_DIR}/${SOURCE_FILE}" -C "${work}"
src="${work}/ghdl-${GHDL_VERSION}"
[[ -f "${src}/COPYING.md" ]] || { echo "No COPYING.md in ${SOURCE_FILE} - the tarball layout changed." >&2; exit 1; }
tree="${work}/tree"
mkdir -p "${tree}/bin" "${tree}/lib"

# Copies the pieces HDLBoard runs from an installed GHDL prefix into the tree.
take_from_prefix() {
  local prefix="$1"
  cp -a "${prefix}/bin/ghdl" "${prefix}/bin/ghwdump" "${tree}/bin/"
  cp -a "${prefix}/lib/ghdl" "${prefix}/lib/libghw.dylib" "${prefix}/lib/libghdlvpi.dylib" "${tree}/lib/"
}

if [[ "${ARCH}" == arm64 ]]; then
  download_verified "${BINARY_URL}" "${DOWNLOAD_DIR}/${BINARY_NAME}.tar.gz" "${BINARY_SHA256}"
  tar -xzf "${DOWNLOAD_DIR}/${BINARY_NAME}.tar.gz" -C "${work}"
  # libghdl, libgnat and libgcc_s serve only libghdl (the Python/language-server library); ghdl itself needs none of them.
  take_from_prefix "${work}/${BINARY_NAME}"
  built_with="upstream release asset ${BINARY_NAME}.tar.gz (SHA-256 ${BINARY_SHA256}), built by GHDL's CI on macOS 14"
else
  for tool in clang make; do
    command -v "${tool}" > /dev/null || { echo "Missing build tool: ${tool} (install the Xcode Command Line Tools: xcode-select --install)" >&2; exit 1; }
  done
  download_verified "${GNAT_URL}" "${DOWNLOAD_DIR}/${GNAT_NAME}.tar.gz" "${GNAT_SHA256}"
  echo "Unpacking GNAT ${GNAT_VERSION} ..."
  tar -xzf "${DOWNLOAD_DIR}/${GNAT_NAME}.tar.gz" -C "${work}"
  gnat="${work}/${GNAT_NAME}"
  [[ -x "${gnat}/bin/gnatmake" ]] || { echo "No gnatmake in ${GNAT_NAME} - the toolchain layout changed." >&2; exit 1; }
  mkdir -p "${work}/build"
  echo "Building GHDL ${GHDL_TAG} (mcode, macOS ${MIN_MACOS}+) with $(jobs_count) jobs ..."
  (
    cd "${work}/build" || exit 1
    export PATH="${gnat}/bin:${PATH}"
    # shellcheck disable=SC2086 # the options are a word list on purpose
    CC=clang LDFLAGS="${GHDL_LDFLAGS}" "${src}/configure" ${CONFIGURE_OPTIONS} || exit 1
    make GNATMAKE="gnatmake -j$(jobs_count)" || exit 1
    make install DESTDIR="${work}/install"
  ) > "${work}/build.log" 2>&1 || { tail -n 60 "${work}/build.log" >&2; exit 1; }
  take_from_prefix "${work}/install/opt/hdlboard-ghdl"
  # GCC's unwinder, which the Ada runtime inside ghdl calls, is a shared library on macOS.
  # (Captured first: under pipefail, grep -q at the end of a pipe can fail a match.)
  libraries="$(macho_commands "${tree}/bin/ghdl" 'DYLIB$')"
  if grep -qx '@rpath/libgcc_s.1.1.dylib' <<<"${libraries}"; then
    lipo "${gnat}/lib/libgcc_s.1.1.dylib" -thin "${MACHO_ARCH}" -output "${tree}/bin/libgcc_s.1.1.dylib" 2> /dev/null ||
      cp "${gnat}/lib/libgcc_s.1.1.dylib" "${tree}/bin/libgcc_s.1.1.dylib"
    rpaths="$(macho_commands "${tree}/bin/ghdl" '^LC_RPATH$')"
    grep -qx '@loader_path/*' <<<"${rpaths}" || install_name_tool -add_rpath @loader_path "${tree}/bin/ghdl"
  fi
  # gnatmake records the toolchain's own folders as rpaths; they exist only on the build machine.
  macho_files "${tree}" | while IFS= read -r -d '' f; do
    macho_commands "$f" '^LC_RPATH$' | { grep -v '^@' || true; } | while IFS= read -r rpath; do
      install_name_tool -delete_rpath "${rpath}" "$f"
    done
  done
  built_with="built from source with $("${gnat}/bin/gnatmake" --version | head -n 1) and $(clang --version | head -n 1), MACOSX_DEPLOYMENT_TARGET=${MIN_MACOS}"
fi

cp "${src}/COPYING.md" "${tree}/COPYING"
adhoc_sign_tree "${tree}"
cat > "${tree}/VERSION.txt" <<EOF
${STAMP}
Source: ${SOURCE_URL}
Repository at this tag: https://github.com/ghdl/ghdl/tree/${GHDL_TAG}
SHA-256 (${SOURCE_FILE}): ${SOURCE_SHA256}
Binary: ${built_with}
Built on: macOS $(sw_vers -productVersion) $(uname -m)
Bundled libraries: $([[ -f "${tree}/bin/libgcc_s.1.1.dylib" ]] && echo "bin/libgcc_s.1.1.dylib (GCC runtime, GPL-3.0 with the GCC Runtime Library Exception)" || echo none)
EOF

rm -rf "${GHDL_DIR}"
mv "${tree}" "${GHDL_DIR}"
echo "GHDL ready in vendor/${ARCH}/ghdl: $("${GHDL_DIR}/bin/ghdl" --version | head -n 1)"
