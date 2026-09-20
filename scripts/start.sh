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

# --- dependencies -----------------------------------------------------------
# docs/BUILDING.md § Prerequisites: GHDL, plus Node 18+ and npm. Everything
# here is idempotent, so a second run just confirms and moves on.
# Set HDLBOARD_SKIP_INSTALL=1 to check only and never install anything.

confirm() {
  # Installing packages touches the system, so ask first — unless the caller
  # already said yes (HDLBOARD_ASSUME_YES=1) or there's nobody to ask.
  local prompt="$1" reply
  if [ "${HDLBOARD_ASSUME_YES:-0}" = "1" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    echo "Not running interactively — rerun with HDLBOARD_ASSUME_YES=1, or install it yourself." >&2
    return 1
  fi
  read -r -p "$prompt [Y/n] " reply
  case "$reply" in
    ""|[Yy]|[Yy][Ee][Ss]) return 0 ;;
    *) return 1 ;;
  esac
}

# Node and npm are the one thing this script can't bootstrap: npm is how it
# installs everything else, and a distro's `node` is often too old anyway.
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 18+ and npm are required but not on PATH." >&2
  echo "Install them from https://nodejs.org/ (see docs/BUILDING.md), then rerun." >&2
  exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 18 ]; then
  echo "Node $(node -v) is too old — HDLBoard needs 18+ (20+ recommended)." >&2
  exit 1
fi

# GHDL, via whichever package manager this machine has — the same commands
# docs/BUILDING.md lists per platform.
if ! command -v ghdl >/dev/null 2>&1; then
  if [ "${HDLBOARD_SKIP_INSTALL:-0}" = "1" ]; then
    echo "ghdl not found on PATH — install it first (see docs/BUILDING.md)." >&2
    exit 1
  fi

  if command -v apt-get >/dev/null 2>&1;   then ghdl_install=(apt-get install -y ghdl)
  elif command -v dnf >/dev/null 2>&1;     then ghdl_install=(dnf install -y ghdl)
  elif command -v pacman >/dev/null 2>&1;  then ghdl_install=(pacman -S --noconfirm ghdl)
  elif command -v zypper >/dev/null 2>&1;  then ghdl_install=(zypper install -y ghdl)
  elif command -v apk >/dev/null 2>&1;     then ghdl_install=(apk add ghdl)
  elif command -v brew >/dev/null 2>&1;    then ghdl_install=(brew install ghdl)
  else
    echo "ghdl not found, and no known package manager to install it with." >&2
    echo "Install GHDL by hand — docs/BUILDING.md lists the command per platform." >&2
    exit 1
  fi

  # brew refuses to run under sudo; the distro managers need it unless we're
  # already root.
  if [ "${ghdl_install[0]}" != "brew" ] && [ "$(id -u)" -ne 0 ]; then
    if ! command -v sudo >/dev/null 2>&1; then
      echo "ghdl not found, and neither root nor sudo is available to install it." >&2
      echo "Install it by hand: ${ghdl_install[*]} (see docs/BUILDING.md)." >&2
      exit 1
    fi
    ghdl_install=(sudo "${ghdl_install[@]}")
  fi

  echo "ghdl not found on PATH. It can be installed with:"
  echo "    ${ghdl_install[*]}"
  if ! confirm "Install GHDL now?"; then
    echo "Skipped — install GHDL, then rerun (docs/BUILDING.md)." >&2
    exit 1
  fi
  "${ghdl_install[@]}" || {
    echo "Installing ghdl failed. GHDL isn't packaged everywhere — see the" >&2
    echo "per-platform table in docs/BUILDING.md, or build from" >&2
    echo "https://github.com/ghdl/ghdl/releases." >&2
    exit 1
  }
  command -v ghdl >/dev/null 2>&1 || {
    echo "ghdl still not on PATH after installing — open a new shell and retry." >&2
    exit 1
  }
fi

# npm dependencies for both projects. node_modules' mtime moves on every
# install, so a manifest newer than it means the lockfile changed (a `git
# pull`, typically) and the tree needs refreshing.
npm_install_if_needed() {
  local name="$1" dir="$2"
  local modules="$dir/node_modules"
  if [ -d "$modules" ] \
     && [ ! "$dir/package.json" -nt "$modules" ] \
     && [ ! "$dir/package-lock.json" -nt "$modules" ]; then
    return
  fi
  if [ "${HDLBOARD_SKIP_INSTALL:-0}" = "1" ]; then
    echo "$name dependencies missing or stale — run 'npm install' in $dir/." >&2
    exit 1
  fi
  if [ -d "$modules" ]; then
    echo "$name dependencies out of date — running npm install in $dir/..."
  else
    echo "$name dependencies missing — running npm install in $dir/..."
  fi
  (cd "$dir" && npm install) || { echo "npm install failed in $dir/." >&2; exit 1; }
  touch "$modules"
}

npm_install_if_needed "frontend" .
npm_install_if_needed "backend" server

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
