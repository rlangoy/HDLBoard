#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Smoke test for the assembled GHDL and Icarus Verilog trees. Run by build.sh
# before anything is packaged, by CI inside a clean ubuntu:24.04 container,
# and by hand:
#
#   linuxAppImage/verify-simulators.sh [--ghdl <dir>] [--iverilog <dir>] [--fixtures <dir>]
#
# It runs the tools as the backend will: GHDL from <dir>/bin/ghdl with
# --std=08, Icarus with -B<dir> and -M<dir>; a child environment whose PATH
# holds only /usr/bin and /bin (so a system ghdl or iverilog cannot stand in
# for a missing piece of the tree); from a working directory whose name
# contains a space and a non-ASCII letter. Results are checked, not message
# text. Before that, `ldd` must find every library of every program, target
# and module, because a missing one only shows when that piece is first used.
#
# Exit code 0 when every check passes, 1 otherwise.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GHDL_DIR="${HERE}/vendor/ghdl"
IVERILOG_DIR="${HERE}/vendor/iverilog"
FIXTURES="${HERE}/../tests/fixtures"

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
COMPILE_TIMEOUT=30
BOARD_RUN_TIMEOUT=8
UNPACED_GRANT_LINES=2000

failures=0

result() { # ok name [detail]
  local mark="PASS"
  if [[ "$1" != 0 ]]; then mark="FAIL"; failures=$((failures + 1)); fi
  printf '%s  %s%s\n' "${mark}" "$2" "${3:+  ($3)}"
}

# Runs a tool with only CHILD_PATH and the bare minimum of environment.
clean() { env -i PATH="${CHILD_PATH}" HOME="${HOME:-/tmp}" LANG=C.UTF-8 timeout "${COMPILE_TIMEOUT}" "$@"; }

check_libraries() {
  local tree="$1" name="$2" missing
  # ELF files by their magic, not `file`: a clean ubuntu:24.04 has no `file`.
  missing="$(find "${tree}" -type f -print0 |
    while IFS= read -r -d '' f; do
      [[ "$(head -c 4 "$f" | tr -d '\0')" == $'\x7fELF' ]] || continue
      ldd "$f" 2>&1 | grep 'not found' | sed "s|^|${f#"${tree}"/}: |"
    done)"
  result "$([[ -z "${missing}" ]]; echo $?)" "${name}: every library is found" "${missing//$'\n'/; }"
}

work="$(mktemp -d "${TMPDIR:-/tmp}/hdlboard smoke XXXXXX ø")"
trap 'rm -rf "${work}"' EXIT
cp "${FIXTURES}/project/adder4.vhd" "${FIXTURES}/project/adder4_tb.vhdl" "${work}/"
cp "${FIXTURES}/vhdl/DE1_SoC.vhdl" "${FIXTURES}/vhdl/golden/hdl_board_tb.DE1_SoC.vhdl" "${work}/"
cp "${FIXTURES}/verilog/"*.v "${FIXTURES}/verilog/golden/hdl_board_tb.DE1_SoC.v" "${work}/"
printf '`timescale 1ns/1ps\n' > "${work}/${TIMESCALE_FILE}"
cd "${work}" || exit 1

echo "Verifying GHDL    ${GHDL_DIR}"
echo "          Icarus  ${IVERILOG_DIR}"
echo "  from    ${work}"

# --- libraries ----------------------------------------------------------
check_libraries "${GHDL_DIR}" "GHDL"
check_libraries "${IVERILOG_DIR}" "Icarus"

# --- GHDL ---------------------------------------------------------------
out="$(clean "${GHDL}" --version 2>&1)"
grep -q 'GHDL 6\.0\.0' <<<"${out}" && grep -qi 'mcode' <<<"${out}"
result $? "ghdl --version names 6.0.0 mcode" "$(head -n 1 <<<"${out}")"

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
compile_clean "keyCouter2Led.v" counter8 keyCouter2Led.v
compile_clean "tb_counter8.v" tb_counter8 keyCouter2Led.v tb_counter8.v

out="$(clean "${VVP}" "-M${IVERILOG_DIR}" -n -i tb_counter8.vvp < /dev/null 2>&1)"
rc=$?
grep -qE '^PASS\s*$' <<<"${out}" && [[ ${rc} == 0 ]]
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
    env -i PATH="${CHILD_PATH}" timeout "${BOARD_RUN_TIMEOUT}" "${VVP}" "-M${IVERILOG_DIR}" -n -i board.vvp \
      +input_file=input.txt +output_file=output.txt +poll_interval_ns=10000 +min_dwell_ns=10000 > /dev/null 2>&1 &
  board_pid=$!
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
