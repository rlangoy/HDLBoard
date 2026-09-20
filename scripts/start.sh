#!/usr/bin/env bash
# Starts the frontend (Vite dev server) and the GHDL backend as a pair,
# tracked by PID so this script won't double-start or fail to find a
# running instance — ghdl_implementation_plan.md § 7 / § 9.
#
# Usage:   ./scripts/start.sh   (from the repository root, or anywhere)
# Config:  STATIC_PORT=8080 GHDL_WS_PORT=9090 ./scripts/start.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."   # repository root

STATIC_PORT="${STATIC_PORT:-5173}"
export GHDL_WS_PORT="${GHDL_WS_PORT:-9010}"

mkdir -p .run

start_one() {
  local name="$1" pidfile="$2" logfile="$3"
  shift 3
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return
  fi
  rm -f "$pidfile"
  ("$@" > "$logfile" 2>&1 & echo $! > "$pidfile")
  sleep 0.3
  if kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name started (pid $(cat "$pidfile")), log: $logfile"
  else
    echo "$name failed to start — see $logfile" >&2
    rm -f "$pidfile"
    exit 1
  fi
}

if ! command -v ghdl >/dev/null 2>&1; then
  echo "ghdl not found on PATH — install it first (see docs/BUILDING.md)." >&2
  exit 1
fi

if [ ! -d server/node_modules ]; then
  echo "server/node_modules missing — run 'npm install' inside server/ first." >&2
  exit 1
fi
# server/dist is gitignored, so a `git pull` updates server/src but not
# the JavaScript actually run — a stale build silently runs old behaviour
# (ghdl_implementation_plan.md § 5.13). Rebuild whenever any source file
# is newer than the build, or the build is missing.
if [ ! -f server/dist/server.js ] || [ -n "$(find server/src -newer server/dist/server.js -print -quit)" ]; then
  echo "server/dist missing or older than server/src — rebuilding backend..."
  (cd server && npm run build) || { echo "Backend build failed." >&2; exit 1; }
fi

start_one "backend" .run/backend.pid .run/backend.log \
  node server/dist/server.js

# The local binary directly, not `npx vite`: npx runs vite as a *child*
# process, so `$!`/stop.sh's `kill` would only ever reach npx's own PID
# and leave vite itself orphaned, still holding the port — caught by
# actually running stop.sh and checking with lsof, not by reading this
# script (ghdl_implementation_plan.md § 10, "run it and observe").
start_one "frontend" .run/frontend.pid .run/frontend.log \
  ./node_modules/.bin/vite --host --port "$STATIC_PORT"

cat <<EOF

Frontend: http://localhost:${STATIC_PORT}/
Backend:  ws://localhost:${GHDL_WS_PORT}/ghdlsim

Both also bind 0.0.0.0, so any device on the same network can reach them
via this machine's IP instead of localhost — the frontend resolves the
backend host from whatever host the page was loaded from, so this needs
no extra configuration (ghdl_implementation_plan.md § 6.4).

Stop with ./scripts/stop.sh
EOF
