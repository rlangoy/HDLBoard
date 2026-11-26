#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Packaged smoke test of a built DMG, the twin of linuxAppImage/smoke-test.sh:
#
#   macDmg/smoke-test.sh [--mounted] [--expect-notarized] <HDLBoard-*.dmg>
#
#   - mounts the DMG read-only, checks the app's signature and that the app
#     and both simulators are this Mac's processor;
#   - copies the app to a folder whose name holds a space and a non-ASCII
#     letter (".../HDL Board ø/"), or with --mounted runs it from the DMG itself,
#     as a student does who never drags it to Applications;
#   - starts it with an empty settings folder (--user-data-dir);
#   - waits for the backend to listen on loopback and the window to load, and
#     checks that the page is served;
#   - starts a VHDL and a Verilog board run through the app's own WebSocket
#     (linuxAppImage/smoke-sessions.mjs), so a live ghdl and vvp exist;
#   - sends the app SIGTERM and checks that it quits through its normal
#     teardown, that no ghdl or vvp is left and that the DMG detaches.
#
# --expect-notarized: Gatekeeper must also accept the app (a notarized
# build). Without it, Gatekeeper's verdict is only printed: an ad hoc build is
# rejected until the student allows it once.
#
# Needs: server/dist (build.sh builds it), node, curl. A logged-in desktop
# session, as GitHub's macOS runners have. Exit code 0 when every check passes.

set -uo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${MAC_DIR}/common.sh"
REPO="$(dirname "${MAC_DIR}")"
START_TIMEOUT=120
READY_TIMEOUT=90
QUIT_TIMEOUT=20

mounted=false
expect_notarized=false
while (( $# > 1 )); do
  case "$1" in
    --mounted) mounted=true; shift ;;
    --expect-notarized) expect_notarized=true; shift ;;
    *) break ;;
  esac
done
[[ $# == 1 && -f "$1" ]] || { echo "usage: $0 [--mounted] [--expect-notarized] <HDLBoard-*.dmg>" >&2; exit 2; }
dmg="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"

work="$(mktemp -d "${TMPDIR:-/tmp}"/"hdlboard-smoke.XXXXXX")"
mnt="${work}/mnt"
userdata="${work}/user data"
log="${userdata}/logs/backend.log"
app_pid="" sessions_pid=""
failures=0

detach() { hdiutil detach "${mnt}" -quiet 2> /dev/null || hdiutil detach "${mnt}" -force -quiet 2> /dev/null; }
cleanup() {
  [[ -n "${sessions_pid}" ]] && kill "${sessions_pid}" 2> /dev/null
  [[ -n "${app_pid}" ]] && kill -KILL "${app_pid}" 2> /dev/null
  [[ -d "${mnt}" ]] && detach
  rm -rf "${work}"
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

count() { pgrep -x -U "$(id -u)" "$1" | wc -l | tr -d ' '; }
in_log() { grep -q -- "$1" "${log}" 2> /dev/null; }
app_gone() { ! kill -0 "${app_pid}" 2> /dev/null; }
simulators_gone() { (( $(count ghdl) <= baseline_ghdl && $(count vvp) <= baseline_vvp )); }

mkdir -p "${mnt}"
hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "${mnt}" "${dmg}" > /dev/null || { echo "hdiutil attach failed" >&2; exit 1; }
[[ -d "${mnt}/HDLBoard.app" && -L "${mnt}/Applications" ]]
result $? "the DMG holds HDLBoard.app and a link to Applications"
if $mounted; then
  app="${mnt}/HDLBoard.app"
else
  mkdir -p "${work}/HDL Board ø"
  ditto "${mnt}/HDLBoard.app" "${work}/HDL Board ø/HDLBoard.app"
  app="${work}/HDL Board ø/HDLBoard.app"
fi
contents="${app}/Contents"

echo "Smoke test of ${dmg##*/}"
echo "  app       ${app}"

out="$(codesign --verify --deep --strict "${app}" 2>&1)"
result $? "the signature is valid" "${out}"
signer="$(codesign -dv "${app}" 2>&1 | sed -n 's/^Authority=//p' | head -n 1)"
echo "  signed    ${signer:-ad hoc}"
verdict="$(spctl --assess --type execute -vv "${app}" 2>&1)"
if $expect_notarized; then
  result "$(grep -q 'source=Notarized Developer ID' <<<"${verdict}"; echo $?)" "Gatekeeper accepts the notarized app" "${verdict//$'\n'/; }"
else
  echo "  gatekeeper ${verdict//$'\n'/; } (an ad hoc build is allowed once by the student)"
fi
archs=""
for f in MacOS/HDLBoard Resources/ghdl/bin/ghdl Resources/iverilog/vvp Resources/iverilog/ivl; do
  archs+="${f##*/}=$(lipo -archs "${contents}/${f}" 2> /dev/null) "
done
[[ "${archs}" == "HDLBoard=${MACHO_ARCH} ghdl=${MACHO_ARCH} vvp=${MACHO_ARCH} ivl=${MACHO_ARCH} " ]]
result $? "the app and the simulators are ${MACHO_ARCH}" "${archs}"

baseline_ghdl="$(count ghdl)" baseline_vvp="$(count vvp)"
"${contents}/MacOS/HDLBoard" --user-data-dir="${userdata}" > "${work}/app.out" 2>&1 &
app_pid=$!

wait_for "${START_TIMEOUT}" in_log 'backend port:'
result $? "backend starts and listens"
port="$(sed -n 's/.*backend port: \([0-9]*\).*/\1/p' "${log}" 2> /dev/null | tail -n 1)"
if [[ -z "${port}" ]]; then
  echo "--- app output ---"; tail -n 30 "${work}/app.out"
  echo "--- backend.log ---"; tail -n 30 "${log}" 2> /dev/null
  exit 1
fi
echo "  port      ${port}"
echo "  resources $(sed -n 's/.*frontend: \(.*\)\/frontend$/\1/p' "${log}" | tail -n 1)"

listening="$(lsof -nP -a -iTCP:"${port}" -sTCP:LISTEN -Fn 2> /dev/null | sed -n 's/^n//p' | sort -u | tr '\n' ' ')"
[[ "${listening}" == "127.0.0.1:${port} " ]]
result $? "listens on 127.0.0.1 only" "${listening}"

page="$(curl -fsS "http://127.0.0.1:${port}/" 2>&1)"
grep -q '<div id="root">' <<<"${page}"
result $? "serves the page"

wait_for 30 in_log 'window loaded'
result $? "window loads the page"

node "${REPO}/linuxAppImage/smoke-sessions.mjs" "${port}" "${work}/ready" &
sessions_pid=$!
wait_for "${READY_TIMEOUT}" test -f "${work}/ready"
result $? "VHDL and Verilog board runs start" "see ${log}"
(( $(count ghdl) > baseline_ghdl && $(count vvp) > baseline_vvp ))
result $? "a ghdl and a vvp are running" "ghdl $(count ghdl), vvp $(count vvp)"

kill -TERM "${app_pid}"
wait_for "${QUIT_TIMEOUT}" app_gone
result $? "quits on SIGTERM"
in_log 'stopping backend'
result $? "SIGTERM goes through the normal teardown (before-quit)"
wait_for 10 simulators_gone
result $? "no ghdl or vvp left behind" "ghdl $(count ghdl), vvp $(count vvp)"
app_pid=""
kill "${sessions_pid}" 2> /dev/null
wait "${sessions_pid}" 2> /dev/null
sessions_pid=""

# Nothing of the app's may hold a file on the DMG open once it has quit.
wait_for 10 hdiutil detach "${mnt}" -quiet
result $? "the DMG detaches"

if (( failures )); then
  echo "--- backend.log ---"; tail -n 40 "${log}" 2> /dev/null
  echo
  echo "${failures} check(s) FAILED."
  exit 1
fi
echo
echo "All checks passed."
