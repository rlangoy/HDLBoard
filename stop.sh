#!/usr/bin/env bash
# Stops whatever ./start.sh started, by PID. Safe to run when nothing is
# running — it just reports that.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

stop_one() {
  local name="$1" pidfile="$2"
  if [ ! -f "$pidfile" ]; then
    echo "$name not running (no pidfile)"
    return
  fi
  local pid
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "$name stopped (pid $pid)"
  else
    echo "$name pidfile stale (pid $pid not running)"
  fi
  rm -f "$pidfile"
}

stop_one "frontend" .run/frontend.pid
stop_one "backend" .run/backend.pid
