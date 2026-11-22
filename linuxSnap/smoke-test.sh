#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Smoke test of the installed snap, the counterpart of
# linuxAppImage/smoke-test.sh:
#
#   sudo snap install --dangerous linuxSnap/output/hdlboard_*.snap
#   linuxSnap/smoke-test.sh
#
#   - starts `snap run hdlboard` (strictly confined, as a student would),
#     under Xvfb when there is no display;
#   - waits for the backend to listen on loopback and the window to load,
#     and checks that the page is served from inside the snap;
#   - starts a VHDL and a Verilog board run through the app's own WebSocket
#     (linuxAppImage/smoke-sessions.mjs), so a live ghdl and vvp exist;
#   - sends the app SIGTERM, and checks that it quits through its normal
#     teardown and that no ghdl or vvp is left.
#
# The snap keeps its settings in ~/snap/hdlboard/current/.config/HDLBoard
# (snapd sets XDG_CONFIG_HOME, so it cannot be pointed elsewhere). The test
# only reads the part of backend.log written after it started.
#
# Needs: server/dist (for smoke-sessions.mjs's ws), curl, ss, pgrep, and
# Xvfb when there is no DISPLAY. Exit code 0 when every check passes.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAP_NAME=hdlboard
START_TIMEOUT=90
READY_TIMEOUT=60
QUIT_TIMEOUT=20

[[ $# == 0 ]] || { echo "usage: $0   (tests the installed ${SNAP_NAME} snap)" >&2; exit 2; }
snap list "${SNAP_NAME}" > /dev/null 2>&1 || { echo "the ${SNAP_NAME} snap is not installed - sudo snap install --dangerous linuxSnap/output/${SNAP_NAME}_*.snap" >&2; exit 2; }

work="$(mktemp -d "${TMPDIR:-/tmp}/hdlboard-snap-smoke.XXXXXX")"
log="${HOME}/snap/${SNAP_NAME}/current/.config/HDLBoard/logs/backend.log"
app_pid="" sessions_pid="" xvfb_pid=""
failures=0

cleanup() {
  [[ -n "${sessions_pid}" ]] && kill "${sessions_pid}" 2> /dev/null
  [[ -n "${app_pid}" ]] && kill -KILL "${app_pid}" 2> /dev/null
  [[ -n "${xvfb_pid}" ]] && kill "${xvfb_pid}" 2> /dev/null
  rm -rf "${work}"
}
trap cleanup EXIT

result() { # status name [detail]
  local mark="PASS"
  if [[ "$1" != 0 ]]; then mark="FAIL"; failures=$((failures + 1)); fi
  printf '%s  %s%s\n' "${mark}" "$2" "${3:+  ($3)}"
}

wait_for() { # seconds command...
  local deadline=$((SECONDS + $1))
  shift
  until "$@"; do
    (( SECONDS < deadline )) || return 1
    sleep 0.2
  done
}

count() { pgrep -x -u "$(id -u)" "$1" | wc -l; }
# This run's part of the log: everything after the size it had at the start.
this_run() { tail -c +"$((log_start + 1))" "${log}" 2> /dev/null; }
in_log() { this_run | grep -q -- "$1"; }

if [[ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  for n in $(seq 99 140); do [[ -e "/tmp/.X11-unix/X${n}" ]] || break; done
  Xvfb ":${n}" -screen 0 1280x800x24 -nolisten tcp > /dev/null 2>&1 &
  xvfb_pid=$!
  export DISPLAY=":${n}"
  wait_for 10 test -e "/tmp/.X11-unix/X${n}" || { echo "Xvfb did not start" >&2; exit 1; }
fi

echo "Smoke test of the installed snap: $(snap list "${SNAP_NAME}" | awk 'NR == 2 {print $1, $2, "rev", $3, $6}')"
log_start="$(stat -c %s "${log}" 2> /dev/null || echo 0)"
baseline_ghdl="$(count ghdl)" baseline_vvp="$(count vvp)"

# snap run execs through snap-confine into AppRun, which execs hdlboard, so
# this PID ends up being the app itself.
snap run "${SNAP_NAME}" > "${work}/app.out" 2>&1 &
app_pid=$!

wait_for "${START_TIMEOUT}" in_log 'backend port:'
result $? "backend starts and listens"
port="$(this_run | sed -n 's/.*backend port: \([0-9]*\).*/\1/p' | tail -n 1)"
if [[ -z "${port}" ]]; then
  echo "--- app output ---"; tail -n 30 "${work}/app.out"
  echo "--- backend.log ---"; this_run | tail -n 30
  exit 1
fi
resources="$(this_run | sed -n 's/.*frontend: \(.*\)\/frontend$/\1/p' | tail -n 1)"
echo "  port      ${port}"
echo "  resources ${resources}"
this_run | sed -n 's/.*\(chromium sandbox: .*\)/  \1/p' | tail -n 1

[[ "${resources}" == /snap/${SNAP_NAME}/* ]]
result $? "runs from the snap" "${resources}"

[[ "$(ss -Hltn "sport = :${port}" | awk '{print $4}')" == "127.0.0.1:${port}" ]]
result $? "listens on 127.0.0.1 only" "$(ss -Hltn "sport = :${port}" | awk '{print $4}' | paste -sd' ')"

page="$(curl -fsS "http://127.0.0.1:${port}/" 2>&1)"
grep -q '<div id="root">' <<<"${page}"
result $? "serves the page"

wait_for 30 in_log 'window loaded'
result $? "window loads the page"

if node "${REPO}/linuxAppImage/smoke-sessions.mjs" "${port}" "${work}/ready" & sessions_pid=$!; wait_for "${READY_TIMEOUT}" test -f "${work}/ready"; then
  result 0 "VHDL and Verilog board runs start"
else
  result 1 "VHDL and Verilog board runs start" "see ${log}"
fi
(( $(count ghdl) > baseline_ghdl && $(count vvp) > baseline_vvp ))
result $? "a ghdl and a vvp are running" "ghdl $(count ghdl), vvp $(count vvp)"

! in_log 'cannot start'
result $? "no simulator start-up failure in the log"

kill -TERM "${app_pid}"
wait_for "${QUIT_TIMEOUT}" bash -c "! kill -0 ${app_pid} 2> /dev/null"
result $? "quits on SIGTERM"
in_log 'stopping backend'
result $? "SIGTERM goes through the normal teardown (before-quit)"
wait_for 10 bash -c "(( \$(pgrep -x -u $(id -u) ghdl | wc -l) <= ${baseline_ghdl} && \$(pgrep -x -u $(id -u) vvp | wc -l) <= ${baseline_vvp} ))"
result $? "no ghdl or vvp left behind" "ghdl $(count ghdl), vvp $(count vvp)"
app_pid=""

if (( failures )); then
  echo "--- app output ---"; tail -n 30 "${work}/app.out"
  echo "--- backend.log ---"; this_run | tail -n 40
  echo
  echo "${failures} check(s) FAILED."
  exit 1
fi
echo
echo "All checks passed."
