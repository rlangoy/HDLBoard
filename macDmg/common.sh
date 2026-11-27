# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Shared by the macDmg/ scripts, which source it after setting MAC_DIR to the
# macDmg/ directory: which Mac this is, where its simulator trees go, and the
# helpers they all use. Written for the bash 3.2 that macOS ships, and for the
# BSD tools: no timeout, sha256sum, nproc, readlink -f or sed -i.

[[ "$(uname -s)" == Darwin ]] || { echo "error: the macOS app is built on macOS" >&2; exit 1; }
# On Apple silicon a shell running under Rosetta reports x86_64; an Intel build
# made there would mix architectures.
if [[ "$(sysctl -n sysctl.proc_translated 2> /dev/null || echo 0)" == 1 ]]; then
  echo "error: this shell runs under Rosetta - use a native (arm64) Terminal" >&2
  exit 1
fi

# ARCH names the DMG (electron-builder's arch names), MACHO_ARCH is what lipo
# and otool call it, MIN_MACOS the oldest macOS the app declares and every
# binary in it must load on. arm64: upstream's GHDL is built for macOS 14.
# x64: our own builds target 12; Electron 33 itself needs 11.
case "$(uname -m)" in
  arm64)  ARCH=arm64; MACHO_ARCH=arm64;  MIN_MACOS=14.0; GHDL_BACKEND=LLVM ;;
  x86_64) ARCH=x64;   MACHO_ARCH=x86_64; MIN_MACOS=12.0; GHDL_BACKEND=mcode ;;
  *) echo "error: unsupported processor $(uname -m)" >&2; exit 1 ;;
esac
export MACOSX_DEPLOYMENT_TARGET="${MIN_MACOS}"

VENDOR_DIR="${MAC_DIR}/vendor/${ARCH}"
DOWNLOAD_DIR="${MAC_DIR}/vendor/downloads"

jobs_count() { sysctl -n hw.ncpu; }
sha256_of() { shasum -a 256 "$1" | cut -d' ' -f1; }

# download_verified <url> <file> <sha256>: reuses a cached file that matches,
# else downloads it; refuses anything whose SHA-256 is not the pinned one.
download_verified() {
  local url="$1" file="$2" sha="$3" actual
  mkdir -p "$(dirname "${file}")"
  if [[ -f "${file}" && "$(sha256_of "${file}")" == "${sha}" ]]; then
    echo "Using cached ${file##*/}"
    return 0
  fi
  echo "Downloading ${url} ..."
  curl -fsSL --retry 3 -o "${file}" "${url}" || { rm -f "${file}"; echo "download failed: ${url}" >&2; return 1; }
  actual="$(sha256_of "${file}")"
  if [[ "${actual}" != "${sha}" ]]; then
    rm -f "${file}"
    echo "SHA-256 mismatch for ${file##*/}:" >&2
    echo "  expected ${sha}" >&2
    echo "  actual   ${actual}" >&2
    echo "Refusing to use it. If upstream legitimately replaced the file, update the pin after verifying it by hand." >&2
    return 1
  fi
}

# The Mach-O files under a directory, NUL-separated: programs, dylibs, and
# Icarus's .tgt and .vpi bundles.
macho_files() {
  find "$1" -type f -print0 | while IFS= read -r -d '' f; do
    # A case, not `file | grep -q`: under pipefail grep's early exit could fail the test.
    case "$(file -b "$f")" in Mach-O*) printf '%s\0' "$f" ;; esac
  done
}

# macho_commands <file> <regex>: the name or path each matching load command
# carries (LC_LOAD_DYLIB's library, LC_RPATH's directory, ...).
macho_commands() {
  otool -arch "${MACHO_ARCH}" -l "$1" | awk -v want="$2" '
    $1 == "cmd" { hit = ($2 ~ want) }
    hit && ($1 == "name" || $1 == "path") { print $2 }'
}

# The oldest macOS a Mach-O file says it loads on.
macho_minos() {
  otool -arch "${MACHO_ARCH}" -l "$1" | awk '
    $1 == "cmd" { hit = ($2 == "LC_BUILD_VERSION" || $2 == "LC_VERSION_MIN_MACOSX") }
    hit && ($1 == "minos" || $1 == "version") { print $2; exit }'
}

# version_le a b: whether version a <= version b (major.minor.patch).
version_le() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (x[i] + 0 < y[i] + 0) exit 0; if (x[i] + 0 > y[i] + 0) exit 1 }
    exit 0 }'
}

# Signs every Mach-O file under a directory ad hoc. Apple silicon runs nothing
# unsigned, and install_name_tool, lipo and strip invalidate a signature.
adhoc_sign_tree() {
  macho_files "$1" | while IFS= read -r -d '' f; do
    codesign --force --sign - "$f" > /dev/null || { echo "codesign failed: $f" >&2; exit 1; }
  done
}
