#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds Icarus Verilog 13.0 for this Mac's processor from the pinned upstream
# source tag (the same tarball linuxAppImage/build-iverilog.sh pins) and
# assembles macDmg/vendor/<arch>/iverilog/: the flat tree that ships as
# HDLBoard.app/Contents/Resources/iverilog/ and that the backend runs as
# `iverilog -B<dir>` and `vvp -M<dir>`.
#
#   macDmg/build-iverilog.sh [--force | --check]
#
# Needs the Xcode Command Line Tools (clang, make, flex) and, from Homebrew,
# bison 3 (macOS ships bison 2.3, too old for Icarus's grammar), autoconf and
# gperf: brew install bison autoconf gperf.
#
# As on Linux, vvp is built without readline: macOS would offer libedit in its
# place, which serves only vvp's interactive debugger, never opened by the
# backend. zlib and bzip2 come with macOS and give vvp its FST/LXT waveforms.
# MACOSX_DEPLOYMENT_TARGET (common.sh) makes every binary load on MIN_MACOS.
#
# Idempotent: a no-op while VERSION.txt matches the pin, unless --force.

set -euo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${MAC_DIR}/common.sh"

IVERILOG_TAG="v13_0"
IVERILOG_VERSION="13.0"
SOURCE_URL="https://github.com/steveicarus/iverilog/archive/refs/tags/${IVERILOG_TAG}.tar.gz"
SOURCE_SHA256="c897bbfa9848688982c6d5c30529fc29d68df0b9ff22ffa73bad89db73a7ce49"
SOURCE_FILE="iverilog-${IVERILOG_TAG}.tar.gz"
# --prefix only sets the default -B/-M paths compiled into the programs; the
# backend always passes the tree. Never pass --disable-libvvp (see the Linux script).
CONFIGURE_OPTIONS="--prefix=/opt/hdlboard-iverilog"
# configure's cache variables: no readline (libedit on macOS), no termcap.
NO_READLINE="ac_cv_lib_readline_readline=no ac_cv_lib_readline_add_history=no ac_cv_lib_history_add_history=no ac_cv_header_readline_readline_h=no ac_cv_header_readline_history_h=no ac_cv_lib_termcap_tputs=no"

TREE_DIR="${VENDOR_DIR}/iverilog"
STAMP="iverilog ${IVERILOG_VERSION} (${IVERILOG_TAG}, built on macos-${MACHO_ARCH} from source, macOS ${MIN_MACOS}+, configure ${CONFIGURE_OPTIONS}, no readline)"

force=false
[[ "${1:-}" == "--force" ]] && force=true

# --check: exit 0 when vendor/<arch>/iverilog matches the pin, 1 when this script would change it.
if [[ "${1:-}" == "--check" ]]; then
  [[ -f "${TREE_DIR}/VERSION.txt" ]] && grep -qF "${STAMP}" "${TREE_DIR}/VERSION.txt"
  exit
fi
if [[ -f "${TREE_DIR}/VERSION.txt" ]] && ! $force && grep -qF "${STAMP}" "${TREE_DIR}/VERSION.txt"; then
  echo "Icarus Verilog ${IVERILOG_VERSION} already present in vendor/${ARCH}/iverilog - nothing to do (use --force to rebuild)."
  exit 0
fi

# Homebrew's bison is keg-only: it is never on PATH by itself.
if command -v brew > /dev/null && [[ -d "$(brew --prefix bison 2> /dev/null)/bin" ]]; then
  PATH="$(brew --prefix bison)/bin:${PATH}"
fi
missing_tools=()
for tool in clang clang++ make autoconf gperf bison flex curl; do
  command -v "${tool}" > /dev/null || missing_tools+=("${tool}")
done
if (( ${#missing_tools[@]} )); then
  echo "Missing build tools: ${missing_tools[*]}" >&2
  echo "Install: xcode-select --install && brew install bison autoconf gperf" >&2
  exit 1
fi
bison_major="$(bison --version | head -n 1 | sed -E 's/.* ([0-9]+)\.[0-9.]+$/\1/')"
(( bison_major >= 3 )) || { echo "bison $(bison --version | head -n 1) is too old; brew install bison" >&2; exit 1; }

download_verified "${SOURCE_URL}" "${DOWNLOAD_DIR}/${SOURCE_FILE}" "${SOURCE_SHA256}"
mkdir -p "${VENDOR_DIR}"
work="$(mktemp -d "${VENDOR_DIR}/_build-iverilog.XXXXXX")"
trap 'rm -rf "${work}"' EXIT

echo "Unpacking ..."
tar -xzf "${DOWNLOAD_DIR}/${SOURCE_FILE}" -C "${work}"
src="${work}/iverilog-${IVERILOG_TAG#v}"
[[ -f "${src}/configure.ac" ]] || { echo "No configure.ac in ${src} - the tarball layout changed." >&2; exit 1; }

echo "Configuring (${CONFIGURE_OPTIONS}, macOS ${MIN_MACOS}+) ..."
cd "${src}"
sh autoconf.sh > /dev/null
# shellcheck disable=SC2086 # the options are word lists on purpose
env ${NO_READLINE} CC=clang CXX=clang++ ./configure ${CONFIGURE_OPTIONS} > "${work}/configure.log" ||
  { tail -n 40 "${work}/configure.log" >&2; exit 1; }

echo "Building with $(jobs_count) jobs ..."
make -j"$(jobs_count)" > "${work}/make.log" 2>&1 || { tail -n 40 "${work}/make.log" >&2; exit 1; }
make install DESTDIR="${work}/install" > "${work}/install.log" 2>&1 || { tail -n 40 "${work}/install.log" >&2; exit 1; }

# The flat tree, as on Linux: the two programs beside everything they look up
# under -B and -M (lib/ivl/ after an install).
prefix="${work}/install/opt/hdlboard-iverilog"
tree="${work}/tree"
mkdir -p "${tree}"
cp -a "${prefix}/lib/ivl/." "${tree}/"
cp -a "${prefix}/bin/iverilog" "${prefix}/bin/vvp" "${tree}/"
# -x: local symbols only. The .tgt and .vpi bundles export what ivl and vvp call.
macho_files "${tree}" | while IFS= read -r -d '' f; do strip -x "$f" 2> /dev/null || true; done
cp "${src}/COPYING" "${tree}/COPYING"
adhoc_sign_tree "${tree}"

cat > "${tree}/VERSION.txt" <<EOF
${STAMP}
Source: ${SOURCE_URL}
SHA-256 (${SOURCE_FILE}): ${SOURCE_SHA256}
Repository at this tag: https://github.com/steveicarus/iverilog/tree/${IVERILOG_TAG}
Configure options: ${CONFIGURE_OPTIONS} (readline and termcap left out)
Optional libraries: zlib, bzip2 (from macOS)
Built on: macOS $(sw_vers -productVersion) $(uname -m), $(clang --version | head -n 1), MACOSX_DEPLOYMENT_TARGET=${MIN_MACOS}
Bundled libraries: none
EOF

vvp_libraries="$(macho_commands "${tree}/vvp" 'DYLIB$')"
if grep -Eq 'readline|libedit|termcap|ncurses' <<<"${vvp_libraries}"; then
  echo "vvp linked a line-editing library (see the header of this script):" >&2
  echo "${vvp_libraries}" >&2
  exit 1
fi

rm -rf "${TREE_DIR}"
mv "${tree}" "${TREE_DIR}"
echo "Icarus Verilog ready in vendor/${ARCH}/iverilog: $("${TREE_DIR}/iverilog" -B"${TREE_DIR}" -V 2>&1 | head -n 1)"
