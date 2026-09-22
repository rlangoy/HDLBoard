#!/bin/sh
# HDLBoard — one-shot installer for Alpine Linux.
#
# Installs everything needed to serve HDLBoard as a web application on this
# machine, and to keep it running: the built page served by nginx, the GHDL
# backend supervised by OpenRC, both starting at boot.
#
#   wget -O alpineInstall.sh https://raw.githubusercontent.com/rlangoy/HDLBoard/main/scripts/alpineInstall.sh
#   sudo sh alpineInstall.sh
#
# Safe to re-run: every step checks before it acts, so a second run updates
# the checkout, rebuilds and restarts rather than failing on what exists.
#
# Tunables, all optional:
#   HDLBOARD_DIR         where to install          (default /srv/HDLBoard)
#   HDLBOARD_USER        service account           (default hdlboard)
#   HDLBOARD_PAGE_PORT   port nginx serves on      (default 80)
#   GHDL_WS_PORT         port the backend listens on (default 9010)
#   GHDL_MAX_SESSIONS    concurrent simulations    (default 32)
#   HDLBOARD_REPO        git URL to install from
#   HDLBOARD_BRANCH      branch or tag             (default main)
#
# See docs/HOSTING.md for what this does by hand, and for the other platforms.
set -eu

DIR="${HDLBOARD_DIR:-/srv/HDLBoard}"
USR="${HDLBOARD_USER:-hdlboard}"
PAGE_PORT="${HDLBOARD_PAGE_PORT:-80}"
WS_PORT="${GHDL_WS_PORT:-9010}"
MAX_SESSIONS="${GHDL_MAX_SESSIONS:-32}"
REPO="${HDLBOARD_REPO:-https://github.com/rlangoy/HDLBoard.git}"
BRANCH="${HDLBOARD_BRANCH:-main}"
LOG=/var/log/hdlboard.log

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
die()  { printf '\n\033[1mError: %s\033[0m\n' "$1" >&2; exit 1; }

# --- 1. preflight -----------------------------------------------------------
step "Checking the machine"
[ "$(id -u)" -eq 0 ] || die "run this as root: sudo sh $0"
[ -f /etc/alpine-release ] || die "this installer is for Alpine Linux; docs/HOSTING.md covers Debian, Ubuntu, macOS and WSL"
command -v rc-update >/dev/null 2>&1 || die "OpenRC not found — this installer sets up OpenRC services"
info "Alpine $(cat /etc/alpine-release), $(apk --print-arch)"

# --- 2. Node --------------------------------------------------------------
step "Installing Node.js and git"
apk add --no-progress nodejs npm git >/dev/null
command -v node >/dev/null 2>&1 || die "node still not on PATH after 'apk add nodejs'"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 18 ] || die "Node $(node -v) is too old — HDLBoard needs 18 or newer"
info "node $(node -v), npm $(npm -v)"

# --- 3. GHDL ----------------------------------------------------------------
# Not packaged for Alpine (checked against 3.24 main and community), and the
# upstream release binaries are linked against glibc, so on musl they need a
# loader shim and a bundled glibc tree. Building the mcode backend from source
# is the honest route: Alpine has the Ada compiler GHDL needs.
step "Installing GHDL"
if command -v ghdl >/dev/null 2>&1; then
	info "already installed: $(ghdl --version | head -1)"
else
	info "not packaged for Alpine — building the mcode backend from source (a few minutes)"
	# Verified on Alpine 3.24 / x86_64: this sequence builds 7.0.0-dev with
	# GNAT 15.2.0, and the result analyses, elaborates and runs a design.
	apk add --no-progress build-base gcc-gnat zlib-dev >/dev/null
	src=$(mktemp -d)
	git clone --depth 1 https://github.com/ghdl/ghdl "$src" >/dev/null 2>&1 \
		|| die "could not clone https://github.com/ghdl/ghdl — is this machine online?"
	( cd "$src" && ./configure --prefix=/usr/local >/dev/null && make -j"$(nproc)" >/dev/null && make install >/dev/null ) \
		|| die "the GHDL build failed; run it by hand in $src to see why"
	rm -rf "$src"
	command -v ghdl >/dev/null 2>&1 || die "GHDL installed but not on PATH"
	info "built and installed: $(ghdl --version | head -1)"
fi
# Pin the absolute path of the GHDL we just found. OpenRC does put
# /usr/local/bin on a service's PATH (see _LOCAL_PREFIX in
# /usr/libexec/rc/sh/functions.sh), so a source build needs no help — but a
# GHDL installed anywhere else does, and pinning it means the service keeps
# using the one this installer verified.
GHDL_BIN="$(command -v ghdl)"
case "$GHDL_BIN" in
	/home/*|/root/*) info "warning: $GHDL_BIN lives in a home directory; if it is a wrapper that uses \$HOME it will fail for the $USR account" ;;
esac

# --- 4. account and checkout ------------------------------------------------
step "Creating the $USR account and fetching HDLBoard into $DIR"
getent group "$USR" >/dev/null || addgroup -S "$USR"
id "$USR" >/dev/null 2>&1 || adduser -S -D -H -h "$DIR" -s /sbin/nologin -G "$USR" "$USR"
install -d -o "$USR" -g "$USR" "$DIR"

# Stop first: rebuilding under a running backend would swap the files out from
# under it.
if [ -f /etc/init.d/hdlboard ]; then
	rc-service hdlboard stop >/dev/null 2>&1 || true
fi

if [ -d "$DIR/.git" ]; then
	info "updating the existing checkout"
	su -s /bin/sh "$USR" -c "cd '$DIR' && git fetch --depth 1 origin '$BRANCH' && git reset --hard FETCH_HEAD" >/dev/null
else
	info "cloning $REPO ($BRANCH)"
	tmp=$(mktemp -d)
	git clone --depth 1 --branch "$BRANCH" "$REPO" "$tmp/src" >/dev/null 2>&1 \
		|| die "could not clone $REPO"
	# Copy rather than clone straight into $DIR: the directory already exists
	# and git refuses a non-empty target.
	cp -a "$tmp/src/." "$DIR/"
	rm -rf "$tmp"
fi
chown -R "$USR:$USR" "$DIR"
info "$(su -s /bin/sh "$USR" -c "cd '$DIR' && git log --oneline -1")"

# --- 5. build ---------------------------------------------------------------
# VITE_GHDL_WS_PORT is compiled into the page: it is how the browser knows
# which port to open the WebSocket on, and it has to match the backend's
# GHDL_WS_PORT or the board never lights.
step "Building the page and the backend"
su -s /bin/sh "$USR" -c "cd '$DIR' && npm install --no-fund --no-audit" >/dev/null \
	|| die "npm install failed in $DIR"
su -s /bin/sh "$USR" -c "cd '$DIR' && VITE_GHDL_WS_PORT=$WS_PORT npm run build" >/dev/null \
	|| die "the frontend build failed"
su -s /bin/sh "$USR" -c "cd '$DIR/server' && npm install --no-fund --no-audit && npm run build" >/dev/null \
	|| die "the backend build failed"
[ -f "$DIR/dist/index.html" ] || die "no page at $DIR/dist/index.html after the build"
[ -f "$DIR/server/dist/server.js" ] || die "no backend at $DIR/server/dist/server.js after the build"
info "page in $DIR/dist, backend in $DIR/server/dist"

# --- 6. the backend service -------------------------------------------------
step "Installing the OpenRC service"
# Create the log only if it's missing: 'install /dev/null' truncates, which on
# a re-run throws away the history you'd want for working out why the last run
# misbehaved.
[ -f "$LOG" ] || install -m 0644 -o "$USR" -g "$USR" /dev/null "$LOG"
# Keep one copy of whatever was there before, in case it was hand-written.
[ -f /etc/init.d/hdlboard ] && [ ! -f /etc/init.d/hdlboard.bak ] && cp /etc/init.d/hdlboard /etc/init.d/hdlboard.bak
cat > /etc/init.d/hdlboard <<INIT
#!/sbin/openrc-run
# Written by scripts/alpineInstall.sh. See docs/HOSTING.md § 5.3.
name="HDLBoard GHDL backend"
description="WebSocket backend that compiles and runs VHDL with GHDL"

command="$(command -v node)"
command_args="$DIR/server/dist/server.js"
command_user="$USR:$USR"
directory="$DIR"
supervisor="supervise-daemon"
pidfile="/run/\${RC_SVCNAME}.pid"
output_log="$LOG"
error_log="$LOG"

# The environment reaches the daemon through the supervisor, not through a
# plain export: OpenRC builds supervise-daemon's command line from a fixed set
# of variables and passes nothing else through. GHDL_EXE is belt-and-braces
# for a source build in /usr/local, and load-bearing for a GHDL anywhere else.
supervise_daemon_args="--env GHDL_WS_PORT=$WS_PORT --env GHDL_MAX_SESSIONS=$MAX_SESSIONS --env GHDL_EXE=$GHDL_BIN"

depend() {
	need net
}
INIT
chmod +x /etc/init.d/hdlboard
sh -n /etc/init.d/hdlboard || die "generated /etc/init.d/hdlboard is not valid shell"
rc-update add hdlboard default >/dev/null 2>&1 || true
rc-service hdlboard restart
info "backend on port $WS_PORT, log in $LOG"

# --- 7. the page ------------------------------------------------------------
# The backend speaks WebSocket and nothing else — pointed at by a browser it
# answers 426. Something has to serve the page, or there is no site to open.
step "Installing nginx to serve the page on port $PAGE_PORT"
apk add --no-progress nginx >/dev/null
cat > /etc/nginx/http.d/hdlboard.conf <<NGINX
server {
    listen $PAGE_PORT default_server;
    listen [::]:$PAGE_PORT default_server;
    root $DIR/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
# Alpine ships a default site that also claims default_server on port 80;
# leaving it in place makes nginx -t fail with a duplicate.
rm -f /etc/nginx/http.d/default.conf
nginx -t >/dev/null 2>&1 || die "nginx rejected the generated config — see 'nginx -t'"
rc-update add nginx default >/dev/null 2>&1 || true
rc-service nginx restart >/dev/null
info "page served from $DIR/dist"

# --- 8. prove it works ------------------------------------------------------
step "Checking"
rc=0
sleep 2

# 127.0.0.1, not localhost: busybox wget tries ::1 first and the backend
# binds IPv4, so the name resolves to a refused connection. And -S without
# -q, because -q suppresses the response line -S exists to print.
if wget -S -O /dev/null "http://127.0.0.1:$WS_PORT/ghdlsim" 2>&1 | grep -q "426"; then
	info "backend  : 426 Upgrade Required on $WS_PORT (correct — that port speaks WebSocket)"
else
	info "backend  : NOT ANSWERING on $WS_PORT — see $LOG"; rc=1
fi

if wget -q -O /dev/null "http://127.0.0.1:$PAGE_PORT/"; then
	info "page     : served on $PAGE_PORT"
else
	info "page     : NOT SERVED on $PAGE_PORT"; rc=1
fi

# The one check that exercises what the backend actually does for a student:
# analyse, elaborate and run a design, as the service account, with the GHDL
# the service will use.
probe=$(mktemp -d); chown "$USR:$USR" "$probe"
cat > "$probe/probe.vhdl" <<'VHDL'
entity probe is end;
architecture a of probe is begin
  process begin report "hdlboard-probe-ok"; wait; end process;
end;
VHDL
chown "$USR:$USR" "$probe/probe.vhdl"
if su -s /bin/sh "$USR" -c "cd '$probe' && '$GHDL_BIN' -a --std=08 probe.vhdl && '$GHDL_BIN' -e --std=08 probe && '$GHDL_BIN' -r --std=08 probe" 2>&1 | grep -q hdlboard-probe-ok; then
	info "GHDL     : the $USR account can analyse, elaborate and run a design"
else
	info "GHDL     : the $USR account CANNOT run a simulation — the board will stay dark"; rc=1
fi
rm -rf "$probe"

rc-update show 2>/dev/null | grep -q hdlboard && info "at boot   : hdlboard and nginx are in the default runlevel" || { info "at boot   : NOT registered"; rc=1; }

# --- 9. done ----------------------------------------------------------------
ip=$(ip -4 addr show scope global 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1 | head -1)
if [ "$rc" -eq 0 ]; then
	step "HDLBoard is running"
	if [ "$PAGE_PORT" = 80 ]; then page="http://${ip:-<this-host>}/"; else page="http://${ip:-<this-host>}:$PAGE_PORT/"; fi
	info "Open $page"
	info ""
	info "Both ports must be reachable from each student's browser, not just"
	info "from this machine: $PAGE_PORT for the page and $WS_PORT for the board."
	info "The page derives the backend host from the address it was loaded from,"
	info "so there is nothing to configure per client."
	info ""
	info "  rc-service hdlboard status      how the backend is doing"
	info "  tail -f $LOG     its output"
	info "  rc-service hdlboard restart     after changing anything"
	info ""
	info "Anyone who can reach port $WS_PORT can compile and run code on this"
	info "machine as $USR. Keep it on a trusted network — docs/HOSTING.md § 3."
else
	step "Installed, but something above failed"
	info "Fix the lines marked NOT / CANNOT, then re-run this script."
	exit 1
fi
