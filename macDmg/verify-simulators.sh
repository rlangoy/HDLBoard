#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Smoke test for the assembled GHDL and Icarus Verilog trees on macOS, the
# twin of linuxAppImage/verify-simulators.sh. Run by build.sh before anything
# is packaged, and by hand:
#
#   macDmg/verify-simulators.sh [--ghdl <dir>] [--iverilog <dir>] [--fixtures <dir>]
#
# Where Linux runs ldd in a clean container, a Mac has no such container, so
# the tree is checked for what would make it depend on the build machine:
# every Mach-O file is this processor's, loads only system libraries or files
# inside the tree, has no absolute rpath, declares no newer macOS than the app
# (MIN_MACOS, common.sh), and carries a valid signature (Apple silicon runs
# nothing unsigned). Then the tools run as the backend runs them: GHDL from
# <dir>/bin/ghdl with --std=08, Icarus with -B<dir> and -M<dir>; with only
# PATH=/usr/bin:/bin (so a Homebrew ghdl or iverilog cannot stand in for a
# missing piece); from a working directory whose name holds a space and a
# non-ASCII letter. Results are checked, not message text.
#
# Exit code 0 when every check passes, 1 otherwise.

set -uo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${MAC_DIR}/common.sh"

GHDL_DIR="${VENDOR_DIR}/ghdl"
IVERILOG_DIR="${VENDOR_DIR}/iverilog"
FIXTURES="${MAC_DIR}/../tests/fixtures"

while (( $# )); do
  case "$1" in
    --ghdl) GHDL_DIR="$2"; shift 2 ;;
    --iverilog) IVERILOG_DIR="$2"; shift 2 ;;
    --fixtures) FIXTURES="$2"; shift 2 ;;
    *) echo "usage: $0 [--ghdl <dir>] [--iverilog <dir>] [--fixtures <dir>]" >&2; exit 2 ;;
  esac
done
GHDL_DIR="$(cd "${GHDL_DIR}" && pwd)"
IVERILOG_DIR="$(cd "${IVERILOG_DIR}" && pwd)"
FIXTURES="$(cd "${FIXTURES}" && pwd)"

GHDL="${GHDL_DIR}/bin/ghdl"
IVERILOG="${IVERILOG_DIR}/iverilog"
VVP="${IVERILOG_DIR}/vvp"
CHILD_PATH="/usr/bin:/bin"
TIMESCALE_FILE="_hdlboard_ts.v"
COMPILE_TIMEOUT=60
BOARD_RUN_TIMEOUT=10
UNPACED_GRANT_LINES=2000

failures=0

result() { # ok name [detail]
  local mark="PASS"
  if [[ "$1" != 0 ]]; then mark="FAIL"; failures=$((failures + 1)); fi
  printf '%s  %s%s\n' "${mark}" "$2" "${3:+  ($3)}"
}

# run_limited <seconds> <command...>: macOS has no `timeout`. The watchdog's
# output goes nowhere, so a $(...) around this does not wait for its sleep.
run_limited() {
  local limit="$1" pid watchdog rc
  shift
  "$@" &
  pid=$!
  ( sleep "${limit}" && kill -TERM "${pid}" ) > /dev/null 2>&1 &
  watchdog=$!
  wait "${pid}"
  rc=$?
  pkill -P "${watchdog}" > /dev/null 2>&1
  kill "${watchdog}" > /dev/null 2>&1
  wait "${watchdog}" 2> /dev/null
  return "${rc}"
}

# Runs a tool with only CHILD_PATH and the bare minimum of environment.
clean() { run_limited "${COMPILE_TIMEOUT}" env -i PATH="${CHILD_PATH}" HOME="${HOME:-/tmp}" LANG=en_US.UTF-8 "$@"; }

# Why a Mach-O file would not load on a student's Mac, or nothing.
macho_problems() {
  local f="$1" archs lib name rpaths found minos
  archs="$(lipo -archs "$f" 2> /dev/null)"
  [[ "${archs}" == "${MACHO_ARCH}" ]] || echo "architecture '${archs}', expected ${MACHO_ARCH}"
  rpaths="$(macho_commands "$f" '^LC_RPATH$')"
  while IFS= read -r lib; do
    [[ -z "${lib}" ]] && continue
    case "${lib}" in
      /usr/lib/* | /System/Library/*) ;;
      @rpath/*)
        name="${lib#@rpath/}" found=""
        while IFS= read -r rpath; do
          [[ -z "${rpath}" ]] && continue
          rpath="${rpath/#@loader_path/$(dirname "$f")}"
          rpath="${rpath/#@executable_path/$(dirname "$f")}"
          [[ -f "${rpath}/${name}" ]] && found=yes
        done <<<"${rpaths}"
        [[ -n "${found}" ]] || echo "loads ${lib}, not found through its rpaths"
        ;;
      @loader_path/* | @executable_path/*)
        [[ -f "$(dirname "$f")/${lib#@*_path/}" ]] || echo "loads ${lib}, not in the tree"
        ;;
      *) echo "loads ${lib}, which is outside the tree and the system" ;;
    esac
  done <<<"$(macho_commands "$f" '^LC_(LOAD|LOAD_WEAK|REEXPORT|LAZY_LOAD)_DYLIB$')"
  while IFS= read -r rpath; do
    [[ -n "${rpath}" && "${rpath}" != @* ]] && echo "absolute rpath ${rpath}"
  done <<<"${rpaths}"
  minos="$(macho_minos "$f")"
  [[ -z "${minos}" ]] || version_le "${minos}" "${MIN_MACOS}" || echo "needs macOS ${minos}, newer than ${MIN_MACOS}"
  codesign --verify "$f" > /dev/null 2>&1 || echo "no valid signature"
}

check_tree() {
  local tree="$1" name="$2" problems="" count=0 f p
  while IFS= read -r -d '' f; do
    count=$((count + 1))
    p="$(macho_problems "$f")"
    [[ -n "${p}" ]] && problems+="${f#"${tree}"/}: ${p//$'\n'/, }; "
  done < <(macho_files "${tree}")
  (( count > 0 )) || problems="no Mach-O files found"
  result "$([[ -z "${problems}" ]]; echo $?)" "${name}: ${count} Mach-O files load on macOS ${MIN_MACOS}+ ${MACHO_ARCH} with system libraries only" "${problems}"
}

work="$(mktemp -d "${TMPDIR:-/tmp}"/"hdlboard smoke ø.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
cp "${FIXTURES}/project/adder4.vhd" "${FIXTURES}/project/adder4_tb.vhdl" "${work}/"
cp "${FIXTURES}/vhdl/DE1_SoC.vhdl" "${FIXTURES}/vhdl/golden/hdl_board_tb.DE1_SoC.vhdl" "${work}/"
cp "${FIXTURES}/verilog/"*.v "${FIXTURES}/verilog/golden/hdl_board_tb.DE1_SoC.v" "${work}/"
printf '`timescale 1ns/1ps\n' > "${work}/${TIMESCALE_FILE}"
cd "${work}" || exit 1

echo "Verifying GHDL    ${GHDL_DIR}"
echo "          Icarus  ${IVERILOG_DIR}"
echo "  from    ${work}"

# --- the trees as Mach-O files --------------------------------------------
check_tree "${GHDL_DIR}" "GHDL"
check_tree "${IVERILOG_DIR}" "Icarus"

# --- GHDL ---------------------------------------------------------------
out="$(clean "${GHDL}" --version 2>&1)"
grep -q 'GHDL 6\.0\.0' <<<"${out}" && grep -q "${GHDL_BACKEND} JIT code generator" <<<"${out}"
result $? "ghdl --version names 6.0.0 and the ${GHDL_BACKEND} JIT code generator" "$(tr '\n' ' ' <<<"${out}")"

out="$(clean "${GHDL}" -a --std=08 adder4.vhd adder4_tb.vhdl 2>&1)"
result $? "VHDL analysis with ieee.numeric_std" "${out}"

out="$(clean "${GHDL}" -r --std=08 adder4_tb --wave=adder4.ghw 2>&1)"
rc=$?
grep -q 'PASS: all 256 additions correct' <<<"${out}" && [[ ${rc} == 0 ]]
result $? "VHDL testbench prints PASS" "exit ${rc}"
[[ -s adder4.ghw ]]
result $? "VHDL testbench writes a GHW waveform"

out="$(clean "${GHDL}" -a --std=08 DE1_SoC.vhdl hdl_board_tb.DE1_SoC.vhdl 2>&1 && clean "${GHDL}" -e --std=08 hdl_board_tb 2>&1)"
result $? "VHDL board wrapper analyzes and elaborates" "${out}"

# --- Icarus -------------------------------------------------------------
iverilog() { clean "${IVERILOG}" "-B${IVERILOG_DIR}" -Wall -Wno-timescale -I. "$@" "${TIMESCALE_FILE}"; }

out="$(clean "${IVERILOG}" "-B${IVERILOG_DIR}" -V 2>&1)"
grep -q 'Icarus Verilog version 13\.0' <<<"${out}"
result $? "iverilog -V names 13.0" "$(head -n 1 <<<"${out}")"

compile_clean() { # label top sources...
  local label="$1" top="$2" out rc
  shift 2
  out="$(iverilog -s "${top}" -o "${top}.vvp" "$@" 2>&1)"
  rc=$?
  [[ ${rc} == 0 && -z "${out}" ]]
  result $? "compiles clean: ${label}" "exit ${rc}${out:+, ${out//$'\n'/; }}"
}
compile_clean "DE1_SoC.v" DE1_SoC DE1_SoC.v
compile_clean "blinkTest.v" blinkTest blinkTest.v
compile_clean "keyCouter2Led.v" keyCouter2Led keyCouter2Led.v
compile_clean "tb_counter8.v" tb_counter8 keyCouter2Led.v tb_counter8.v

out="$(clean "${VVP}" "-M${IVERILOG_DIR}" -n -i tb_counter8.vvp < /dev/null 2>&1)"
rc=$?
grep -qE '^PASS[[:space:]]*$' <<<"${out}" && [[ ${rc} == 0 ]]
result $? "batch testbench prints PASS" "exit ${rc}"

printf '%s\n' 'module dump; reg [3:0] n = 0;' \
  'initial begin $dumpfile("dump.fst"); $dumpvars; repeat (8) #1 n = n + 1; $finish; end endmodule' > dump.v
out="$(iverilog -s dump -o dump.vvp dump.v 2>&1 && clean "${VVP}" "-M${IVERILOG_DIR}" -n dump.vvp -fst < /dev/null 2>&1)"
rc=$?
[[ ${rc} == 0 && -s dump.fst ]]
result $? "vvp writes an FST waveform (zlib)" "exit ${rc}"

# The board run: relative file names and stdin grants, as the backend gives them.
board_state=""
if out="$(iverilog -s hdl_board_tb -o board.vvp hdl_board_tb.DE1_SoC.v DE1_SoC.v 2>&1)"; then
  printf '1 10101010101111\n' > input.txt
  rm -f output.txt
  yes '' | head -n "${UNPACED_GRANT_LINES}" |
    env -i PATH="${CHILD_PATH}" "${VVP}" "-M${IVERILOG_DIR}" -n -i board.vvp \
      +input_file=input.txt +output_file=output.txt +poll_interval_ns=10000 +min_dwell_ns=10000 > /dev/null 2>&1 &
  board_pid=$! # vvp itself: env execs it
  deadline=$((SECONDS + BOARD_RUN_TIMEOUT))
  while (( SECONDS < deadline )); do
    sleep 0.05
    line="$(head -n 1 output.txt 2> /dev/null || true)"
    if [[ "${line}" =~ ^([01]{10})([01]{42})\ ([0-9]+)$ ]] && (( BASH_REMATCH[3] >= 1 )); then
      board_state="${BASH_REMATCH[1]} ${BASH_REMATCH[2]}"
      break
    fi
  done
  kill "${board_pid}" 2> /dev/null
  wait "${board_pid}" 2> /dev/null
else
  result 1 "Verilog board wrapper compiles" "${out}"
fi
[[ "${board_state}" == "1010101010 $(printf '1%.0s' {1..42})" ]]
result $? "board run: switches reach the LEDs, displays blank" "${board_state:-no expected state in output.txt}"

if (( failures )); then
  echo
  echo "${failures} check(s) FAILED."
  exit 1
fi
echo
echo "All checks passed."
