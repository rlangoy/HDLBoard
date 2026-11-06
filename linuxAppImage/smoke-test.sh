#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Packaged smoke test of a built AppImage (acceptance check 4):
#
#   linuxAppImage/smoke-test.sh [--mounted] [--in <dir>] <HDLBoard-*.AppImage>
#
#   - extracts it (--appimage-extract, as CI has no FUSE to rely on) into a
#     temporary directory or <dir>, or with --mounted runs the file itself;
#   - starts it with an empty settings directory, under Xvfb when there is
#     no display;
#   - waits for the backend to listen on loopback and the window to load,
#     and checks that the page is served;
#   - starts a VHDL and a Verilog board run through the app's own WebSocket
#     (smoke-sessions.mjs), so a live ghdl and vvp exist;
#   - sends the app SIGTERM, and checks that it quits through its normal
#     teardown, that no ghdl or vvp is left and, with --mounted, that the
#     AppImage's mount is gone.
#
# Needs: server/dist (build.sh builds it), curl, pgrep, and Xvfb when
# there is no DISPLAY. Exit code 0 when every check passes.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_TIMEOUT=90
READY_TIMEOUT=60
QUIT_TIMEOUT=20

mounted=false
parent=""
while (( $# > 1 )); do
  case "$1" in
    --mounted) mounted=true; shift ;;
    --in) parent="$2"; shift 2 ;;
    *) break ;;
  esac
done
[[ $# == 1 && -f "$1" ]] || { echo "usage: $0 [--mounted] [--in <dir>] <HDLBoard-*.AppImage>" >&2; exit 2; }
appimage="$(readlink -f "$1")"

work="$(mktemp -d "${TMPDIR:-/tmp}/hdlboard-smoke.XXXXXX")"
[[ -n "${parent}" ]] || parent="${work}"
mkdir -p "${parent}"
log="${work}/config/HDLBoard/logs/backend.log"
app_pid="" sessions_pid="" xvfb_pid=""
failures=0

cleanup() {
  [[ -n "${sessions_pid}" ]] && kill "${sessions_pid}" 2> /dev/null
  [[ -n "${app_pid}" ]] && kill -KILL "${app_pid}" 2> /dev/null
  [[ -n "${xvfb_pid}" ]] && kill "${xvfb_pid}" 2> /dev/null
  rm -rf "${work}" "${parent}/squashfs-root"
}
trap cleanup EXIT

result() { # status name [detail]
  local mark="PASS"
  if [[ "$1" != 0 ]]; then mark="FAIL"; failures=$((failures + 1)); fi
  printf '%s  %s%s\n' "${mark}" "$2" "${3:+  ($3)}"
}

# Polls `condition` (a command) once every 0.2 s for up to $1 seconds.
wait_for() {
  local deadline=$((SECONDS + $1))
  shift
  until "$@"; do
    (( SECONDS < deadline )) || return 1
    sleep 0.2
  done
}

count() { pgrep -x -u "$(id -u)" "$1" | wc -l; }
in_log() { grep -q -- "$1" "${log}" 2> /dev/null; }
app_alive() { kill -0 "${app_pid}" 2> /dev/null; }

if [[ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  for n in $(seq 99 140); do [[ -e "/tmp/.X11-unix/X${n}" ]] || break; done
  Xvfb ":${n}" -screen 0 1280x800x24 -nolisten tcp > /dev/null 2>&1 &
  xvfb_pid=$!
  export DISPLAY=":${n}"
  wait_for 10 test -e "/tmp/.X11-unix/X${n}" || { echo "Xvfb did not start" >&2; exit 1; }
fi

if $mounted; then
  launcher="${appimage}"
else
  (cd "${parent}" && "${appimage}" --appimage-extract > /dev/null) || { echo "--appimage-extract failed" >&2; exit 1; }
  launcher="${parent}/squashfs-root/AppRun"
fi

echo "Smoke test of ${appimage##*/}"
echo "  launcher  ${launcher}"
baseline_ghdl="$(count ghdl)" baseline_vvp="$(count vvp)"

XDG_CONFIG_HOME="${work}/config" "${launcher}" > "${work}/app.out" 2>&1 &
app_pid=$!

wait_for "${START_TIMEOUT}" in_log 'backend port:'
result $? "backend starts and listens"
port="$(sed -n 's/.*backend port: \([0-9]*\).*/\1/p' "${log}" 2> /dev/null | tail -n 1)"
if [[ -z "${port}" ]]; then
  echo "--- app output ---"; tail -n 30 "${work}/app.out"
  echo "--- backend.log ---"; tail -n 30 "${log}" 2> /dev/null
  exit 1
fi
resources="$(sed -n 's/.*frontend: \(.*\)\/frontend$/\1/p' "${log}" | tail -n 1)"
echo "  port      ${port}"
echo "  resources ${resources}"
sed -n 's/.*\(chromium sandbox: .*\)/  \1/p' "${log}" | tail -n 1

[[ "$(ss -Hltn "sport = :${port}" | awk '{print $4}')" == "127.0.0.1:${port}" ]]
result $? "listens on 127.0.0.1 only" "$(ss -Hltn "sport = :${port}" | awk '{print $4}' | paste -sd' ')"

page="$(curl -fsS "http://127.0.0.1:${port}/" 2>&1)"
grep -q '<div id="root">' <<<"${page}"
result $? "serves the page"

wait_for 30 in_log 'window loaded'
result $? "window loads the page"

if node "${HERE}/smoke-sessions.mjs" "${port}" "${work}/ready" & sessions_pid=$!; wait_for "${READY_TIMEOUT}" test -f "${work}/ready"; then
  result 0 "VHDL and Verilog board runs start"
else
  result 1 "VHDL and Verilog board runs start" "see ${log}"
fi
(( $(count ghdl) > baseline_ghdl && $(count vvp) > baseline_vvp ))
result $? "a ghdl and a vvp are running" "ghdl $(count ghdl), vvp $(count vvp)"

mount_point=""
$mounted && mount_point="$(dirname "${resources}")"

kill -TERM "${app_pid}"
wait_for "${QUIT_TIMEOUT}" bash -c "! kill -0 ${app_pid} 2> /dev/null"
result $? "quits on SIGTERM"
# Chromium's own handler turns SIGTERM, SIGINT and SIGHUP into a normal quit.
in_log 'stopping backend'
result $? "SIGTERM goes through the normal teardown (before-quit)"
wait_for 10 bash -c "(( \$(pgrep -x -u $(id -u) ghdl | wc -l) <= ${baseline_ghdl} && \$(pgrep -x -u $(id -u) vvp | wc -l) <= ${baseline_vvp} ))"
result $? "no ghdl or vvp left behind" "ghdl $(count ghdl), vvp $(count vvp)"
if [[ -n "${mount_point}" ]]; then
  wait_for 10 bash -c "! grep -qF ' ${mount_point} ' /proc/mounts"
  result $? "the AppImage mount is gone" "${mount_point}"
fi
app_pid=""

if (( failures )); then
  echo "--- backend.log ---"; tail -n 40 "${log}" 2> /dev/null
  echo
  echo "${failures} check(s) FAILED."
  exit 1
fi
echo
echo "All checks passed."
