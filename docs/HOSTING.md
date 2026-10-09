# Web Hosting — host HDLBoard yourself

How to run HDLBoard on a machine of your own so that other people open it in
a browser: a classroom PC serving a lab, a VM, a spare laptop on the same
network. If you only want it on your *own* desktop, the
[Windows installer](../README.md#installing) is simpler, and
[`BUILDING.md`](BUILDING.md) covers a plain developer checkout.

The quickest routes are **Docker** ([§ 4](#4-host-with-docker)) on any host
that runs it, and a **one-command installer for Alpine Linux**
([§ 5](#5-alpine-linux-one-command-install)). Setting it up by hand is covered
for **Debian**, **Ubuntu**, **Alpine Linux**, **macOS** and **Windows (via
WSL2)**. To try it on a Windows PC first, the scripts of
[§ 7.5](#75-native-windows--test-it-on-this-machine) start and check it in two
commands.

---

## 1. How it fits together

HDLBoard is two processes, and a browser that talks to both. The backend starts
GHDL for a VHDL design and Icarus Verilog (`iverilog` + `vvp`) for a Verilog one,
chosen by the file the student marked as top:

```
   browser                         host machine
  ┌─────────┐   HTTP :5173        ┌──────────────────────────────┐
  │         │ ───────────────────▶│  the page (static files)     │
  │  page   │                     │  dist/  —  any web server    │
  │         │   WebSocket :9010   ├──────────────────────────────┤
  │  board  │ ◀──────────────────▶│  node server/dist/server.js  │
  └─────────┘   /hdlsim          │       └─ spawns ghdl / vvp   │
                                  └──────────────────────────────┘
```

**The one rule that decides your whole setup:** the page builds its backend
URL as `ws://<the host you typed in the address bar>:<port>/hdlsim`
(`src/components/workbench/hdlClient.ts:34`), where the port is baked in at
build time (default `9010`). So:

- the backend port must be reachable **from each student's browser**, not just
  from the host — opening only the page port gets you a permanently dark board;
- the hostname takes care of itself: whatever address the page was loaded
  from is the address the socket uses, so nothing needs configuring per client;
- one port for everything is possible, with a reverse proxy — see
  [§ 8](#8-one-port-with-a-reverse-proxy).

---

## 2. Requirements

| | Needed | Notes |
|---|---|---|
| **OS** | Linux, macOS, or Windows with WSL2 | `scripts/start.sh` / `stop.sh` are POSIX shell; Windows hosts run them inside WSL. To test on native Windows, `scripts\start-windows.cmd` ([§ 7.5](#75-native-windows--test-it-on-this-machine)) |
| **[Node.js](https://nodejs.org/)** | 18+ (20+ recommended) | Runs the backend and builds the page |
| **[GHDL](https://ghdl.github.io/ghdl/)** | any build supporting `--std=08` and `-g<name>=<value>` | Verified against 5.0.1 and 6.0.0, mcode |
| **[Icarus Verilog](https://steveicarus.github.io/iverilog/)** (optional) | 12.0 or newer; `iverilog` and `vvp` on the service's `PATH` | Verified against 12.0 and 13.0. Without it VHDL still runs and a Verilog run says the simulator is missing. Install it if students will use Verilog |
| **Ports** | 2 open to clients | Default `5173` (page) and `9010` (backend). The Alpine installer uses `80` and `9010`. Docker, or any setup with the reverse proxy of [§ 8](#8-one-port-with-a-reverse-proxy), needs only `80` |
| **CPU / RAM** | ~1 core and ~150 MB per *active* simulation | Every running session forks its own `ghdl` or `vvp` process |
| **Disk** | the checkout (~300 MB with `node_modules`) | Sessions also write to the system temp directory, one directory each, removed when the browser tab closes |

Nothing else, and no external services or accounts: everything stays on your
machine and your network.

**Sizing.** The backend accepts 32 concurrent sessions by default
(`HDL_MAX_SESSIONS`) and refuses the 33rd with a clear message rather than
melting. A session only costs CPU while its simulation is actually running,
so a 4-core machine comfortably serves a class of 20–30 students editing and
running in bursts. Raise or lower the cap to match the hardware.

---

## 3. Read this before you expose it

The backend compiles and runs VHDL and Verilog that anyone who can reach the
port sends it. GHDL and Icarus Verilog are real compilers, and both languages
have real file I/O (VHDL-2008's `textio`, Verilog's `$fopen`/`$fwrite`), so
**anyone who can reach the backend can run code as the user the backend runs
as.** Each
session gets its own temp directory and simulations are killed after a
timeout, but that is scheduling hygiene, not a sandbox. There is no
authentication and no TLS.

Host it accordingly:

- **Good:** a classroom LAN, a lab VLAN, a VPN, a machine you'd hand students
  a shell on anyway.
- **Not good:** a public IP, a cloud VM with an open security group, a port
  forwarded from your home router.

If it must sit somewhere less trusted, run it as a dedicated unprivileged user
(§ 7.3 does this) inside a container or VM you can throw away, and put a VPN
or an authenticating proxy in front.

---

## Pick a route

| Route | Best for | Ports open to clients | Section |
|---|---|---|---|
| **Docker** | Any Linux host with Docker, or Windows/macOS with Docker Desktop. Nothing installed on the host but Docker | **1** (`80`) | [§ 4](#4-host-with-docker) |
| **Alpine installer** | A dedicated Alpine Linux machine or VM. One script sets up everything as native services | 2 (`80` and `9010`) | [§ 5](#5-alpine-linux-one-command-install) |
| **By hand** | Debian, Ubuntu, macOS, WSL2, or when you want to see every piece | 2 (`5173` and `9010`) | [§ 6](#6-install-the-prerequisites) and [§ 7](#7-get-it-running) |
| **Native Windows, for testing** | Trying it on a Windows PC: two scripts start it and check it, nothing installed but Node.js | 2 (`5173` and `9010`) | [§ 7.5](#75-native-windows--test-it-on-this-machine) |

All of them end in the same place: a page students open in a browser and a
backend that runs their VHDL and Verilog. [§ 11](#11-check-it-works) checks
any of them.

---

## 4. Host with Docker

The quickest route on any machine that has Docker. T
```
   browser                  host
  ┌─────────┐  HTTP + WS  ┌───────────────────────────────────────────────┐
  │  page   │ ──:80─────> │ web (nginx)  ── /hdlsim ──────> backend:9010 │
  │  board  │             │  dist/                        node + hdl      │
  └─────────┘             └───────────────────────────────────────────────┘
```


**Requirements:** Docker Engine with the Compose plugin (`docker compose`), or
Docker Desktop on Windows/macOS. The GHDL build needs about 1 GB of disk and a
few minutes the first time. The image is verified on x86_64.

### 4.1 Start it

From the root of a checkout:

```bash
git clone https://github.com/rlangoy/HDLBoard.git
cd HDLBoard
docker compose up -d --build     # first build: a few minutes (GHDL compiles)
docker compose ps                # wait for both services to be "healthy"
```

Then open `http://localhost/`.

Stop and start it again (from the same folder):

```bash
docker compose stop      # stop both containers
docker compose start     # start them again, no rebuild
```

**The build checks itself.** Before the backend image is tagged, the build
runs the `hdlboard` account's GHDL and Icarus against a small design. If
either one can't analyse, elaborate and run it, the build fails and the old
image stays in place. For the full scenario set against the running backend,
in both languages:

```bash
docker compose exec backend node tools/verify-backend.mjs    # 7/7 passed
```

### 4.2 Settings

Put these in a `.env` file next to `docker-compose.yml`. All are optional.

| Variable | Default | Effect |
|---|---|---|
| `HDLBOARD_PAGE_PORT` | `80` | Host port for the page **and** the WebSocket. It is compiled into the page, so rebuild after changing it (`up -d --build`) |
| `HDL_MAX_SESSIONS` | `32` | Concurrent simulations before new ones are refused |
| `GHDL_REF` | `master` | GHDL branch or tag to build. Set a release tag such as `v6.0.0` for a reproducible build |
| `ALPINE_VERSION` | `3.24` | Base image for the build and backend stages |

A classroom server wants a fixed GHDL, not whatever `master` holds on the day
you rebuild:

```bash
echo GHDL_REF=v6.0.0 >> .env
docker compose up -d --build
docker compose exec backend ghdl --version     # GHDL 6.0.0 …
```

### 4.3 Day to day

| Task | Command |
|---|---|
| Backend output | `docker compose logs -f backend` |
| Restart | `docker compose restart backend` |
| Update to the latest checkout | `git pull && docker compose up -d --build` |
| Stop and remove | `docker compose down` |
| Rebuild GHDL too | `docker compose build --no-cache backend` |

`restart: unless-stopped` brings both containers back after a reboot, as long
as the Docker daemon starts at boot: `systemctl enable docker` on systemd
hosts, `rc-update add docker boot` on Alpine. Docker Desktop has to be set to
start at sign-in.

### 4.4 What the containers do for you

- **Security.** The backend container runs as the unprivileged `hdlboard`
  user, with a read-only root filesystem, no capabilities, no privilege
  escalation and a PID limit. Sessions write only to a `tmpfs` at `/tmp`.
  It is still arbitrary code execution on your hardware, so § 3 applies in
  full. To cap CPU and memory on a shared server, uncomment `cpus` and
  `mem_limit` in `docker-compose.yml`, using the sizing in § 2.
- **No port mismatch.** The page is built with `VITE_HDL_WS_PORT` set to the
  page port, and nginx forwards the WebSocket, so the two-places rule of
  [§ 9](#9-configuration-reference) is handled for you.
- **HTTPS** still does not work as shipped, for the reason in
  [§ 8](#8-one-port-with-a-reverse-proxy).

[`docker/README.md`](../docker/README.md) has the same reference in short
form, next to the Dockerfile.

---

## 5. Alpine Linux: one-command install

For a dedicated Alpine machine or VM, where you want HDLBoard running as
native services rather than in containers.
[`scripts/alpineInstall.sh`](../scripts/alpineInstall.sh) does everything
in [§ 6](#alpine-linux) and [§ 7](#7-get-it-running) for you:

```bash
wget -O alpineInstall.sh https://raw.githubusercontent.com/rlangoy/HDLBoard/main/scripts/alpineInstall.sh
less alpineInstall.sh            # it runs as root, so read it first
sudo sh alpineInstall.sh         # or: doas sh alpineInstall.sh
```

A minimal Alpine has `doas` rather than `sudo`. Use it, or `apk add sudo` first.

### 5.1 What it does

| Step | |
|---|---|
| 1. Preflight | Must be root, on Alpine, with OpenRC |
| 2. Node | Enables the *community* repository if `setup-alpine` left it off (that's where `npm` lives), then installs `nodejs`, `npm` and `git`. Refuses Node older than 18 |
| 3. GHDL | Skipped if `ghdl` is already on `PATH`. Otherwise it builds the mcode backend from GHDL's source into `/usr/local`, which takes a few minutes. GHDL isn't packaged for Alpine, and the upstream binaries are glibc builds that misbehave on musl |
| 3b. Icarus Verilog | `apk add iverilog` (brings `vvp`) |
| 4. Account and checkout | Creates the `hdlboard` system user and clones HDLBoard into `/srv/HDLBoard`. On a re-run it updates the checkout instead |
| 5. Build | `npm install` and builds the page (with the backend port compiled in) and the backend, as `hdlboard` |
| 6. Backend service | Writes `/etc/init.d/hdlboard` (the [§ 7.3](#73-keep-the-backend-running) service, with the GHDL and Icarus paths it just verified pinned), adds it to the `default` runlevel and starts it |
| 7. Page | Installs nginx and serves `/srv/HDLBoard/dist` on port 80, replacing Alpine's default site |
| 8. Checks | The backend answers `426`, the page answers, the `hdlboard` account can run a VHDL *and* a Verilog design, and both services start at boot |

It finishes by printing the URL to open, or by marking each failed check with
`NOT` / `CANNOT`, exiting non-zero and asking you to fix them and re-run.

### 5.2 Settings

Pass them as environment variables. All are optional:

| Variable | Default | Effect |
|---|---|---|
| `HDLBOARD_DIR` | `/srv/HDLBoard` | Where to install |
| `HDLBOARD_USER` | `hdlboard` | The service account |
| `HDLBOARD_PAGE_PORT` | `80` | Port nginx serves the page on |
| `HDL_WS_PORT` | `9010` | Port the backend listens on, compiled into the page as well |
| `HDL_MAX_SESSIONS` | `32` | Concurrent simulations |
| `HDLBOARD_REPO` | the GitHub repository | Git URL to install from, for a fork or a local mirror |
| `HDLBOARD_BRANCH` | `main` | Branch or tag to install |

```bash
sudo env HDLBOARD_PAGE_PORT=8080 HDL_MAX_SESSIONS=48 sh alpineInstall.sh
```

### 5.3 After installing

Unlike Docker, this setup has **two** ports that must be reachable from each
student's browser: the page port (`80`) and the backend port (`9010`), per
[§ 1](#1-how-it-fits-together). A stock Alpine has no firewall, so there is
usually nothing to open. If you run one, see [§ 10](#10-open-the-firewall).

| Task | Command |
|---|---|
| Backend status | `rc-service hdlboard status` |
| Backend output | `tail -f /var/log/hdlboard.log` |
| Restart | `rc-service hdlboard restart` |
| Update to the latest version | Re-run `sudo sh alpineInstall.sh`. It stops the service, updates the checkout, rebuilds and restarts |

**Re-running is safe.** Every step checks before it acts. An existing GHDL is
kept, the log isn't truncated, and a hand-written `/etc/init.d/hdlboard` is
saved once as `hdlboard.bak` before it is replaced.

If a check fails, the troubleshooting table in [§ 7.3](#73-keep-the-backend-running)
covers the OpenRC failure modes one by one.

---

## 6. Install the prerequisites

Pick your platform. Each ends with the same two checks:

```bash
node -v      # v18 or newer
ghdl --version
iverilog -V  # optional: only needed for Verilog designs
```

### Debian

Debian 12 (bookworm) and newer package both:

```bash
sudo apt update
sudo apt install -y nodejs npm ghdl iverilog git
```

On Debian 11 (bullseye) `apt`'s Node is 12 — too old. Install a current one
from [NodeSource](https://github.com/nodesource/distributions) instead:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Ubuntu

Ubuntu 24.04 packages a new enough Node:

```bash
sudo apt update
sudo apt install -y nodejs npm ghdl iverilog git
```

On 22.04 that gives you Node 12, which is too old — install GHDL from `apt` as
above, but Node from [NodeSource](https://github.com/nodesource/distributions)
or [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

GHDL from `apt` is fine on every supported release; check `node -v` before
moving on.

### Alpine Linux

The [one-command installer](#5-alpine-linux-one-command-install) does all of
this for you. The rest of this section, and [§ 7](#7-get-it-running), are
what it does, by hand.

Node and Icarus Verilog are packaged (`iverilog` is in the *community*
repository, which the first command below enables); **GHDL is not** (checked against 3.24 main
and community), so build it — Alpine has the Ada compiler GHDL needs:

```bash
sudo setup-apkrepos -o          # enable community: npm lives there, and a fresh install leaves it off
sudo apk update
sudo apk add nodejs npm git iverilog build-base gcc-gnat zlib-dev

git clone https://github.com/ghdl/ghdl ~/ghdl-src
cd ~/ghdl-src
./configure --prefix=/usr/local          # mcode backend, the default
make -j$(nproc)
sudo make install
cd - && ghdl --version && iverilog -V | head -1
```

Skip the first line and `apk add` fails with `npm (no such package)`: `npm`
is the only package here from the *community* repository, and `setup-alpine`
writes that repository commented out. `setup-apkrepos -o` adds a community
line for each enabled main one, matching the mirror you already use.

A minimal Alpine has `doas` rather than `sudo` — substitute it, or
`apk add sudo` first. The build takes a few minutes (it clones GHDL's
development branch; tested with `7.0.0-dev`, and simulations run correctly
on it). Don't reach for the binaries on GHDL's
releases page: they're linked against glibc and Alpine is musl, so they need
a glibc shim to run at all and misbehave in ways that look like compiler bugs.
If you'd rather not build on the host, use [Docker](#4-host-with-docker),
which builds GHDL inside the image instead.

### macOS

With [Homebrew](https://brew.sh/):

```bash
brew install node ghdl icarus-verilog git
```

Both are current formulas. Apple silicon and Intel are both fine.

### Windows (WSL2)

`start.sh`/`stop.sh` are POSIX shell, so host from WSL — the Windows machine
still serves the LAN, the processes just live in the Linux VM.

In PowerShell as administrator:

```powershell
wsl --install -d Ubuntu
```

Reboot if asked, open the **Ubuntu** terminal, and follow the
[Ubuntu](#ubuntu) steps above inside it. Then make WSL reachable from the
network — this is the step people miss, because WSL2 sits behind its own NAT:

**Either** turn on mirrored networking (Windows 11 22H2+), which makes WSL
share the Windows network stack so nothing else is needed. Create or edit
`C:\Users\<you>\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

then `wsl --shutdown` and reopen the terminal.

**Or** forward the two ports by hand, in an administrator PowerShell, after
starting HDLBoard:

```powershell
$wsl = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=$wsl
netsh interface portproxy add v4tov4 listenport=9010 listenaddress=0.0.0.0 connectport=9010 connectaddress=$wsl
New-NetFirewallRule -DisplayName "HDLBoard" -Direction Inbound -Protocol TCP -LocalPort 5173,9010 -Action Allow
```

WSL's IP changes on every reboot, so with port forwarding you re-run those
first two lines after each restart. Mirrored networking avoids that, and is
worth preferring on a machine that gets rebooted.

---

## 7. Get it running

```bash
git clone https://github.com/rlangoy/HDLBoard.git
cd HDLBoard
```

### 7.1 Quick — the dev server

Good for a lab session you start in the morning and stop in the afternoon:

```bash
./scripts/start.sh
```

That installs any missing npm dependencies (and offers to install GHDL, and
Icarus Verilog, if you skipped § 6 — a missing Icarus only warns, since VHDL runs
without it), builds the backend, and starts both processes bound to
`0.0.0.0`. Students open `http://<your-ip>:5173/`. Logs are in `.run/*.log`;
`./scripts/stop.sh` stops both.

It's the Vite dev server, so it rebuilds on file changes and does more work
per request than it needs to — fine for a class, not what you want running
for months.

### 7.2 Production — build once, serve static

Build the page, then serve `dist/` with any web server:

```bash
npm install
npm run build                      # → dist/, self-contained, relative paths

cd server && npm install && npm run build && cd ..
node server/dist/server.js         # the backend, port 9010
```

`dist/` is plain files with relative asset paths, so it can live at any URL
path. An nginx server block for it:

```nginx
server {
    listen 5173;
    server_name hdlboard.example.lan;
    root /srv/HDLBoard/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

Clients then use port 5173 for the page and 9010 for the board (the same
ports as `scripts/start.sh`). To put both on port 80, see [§ 8](#8-one-port-with-a-reverse-proxy).

### 7.3 Keep the backend running

Everything in this section starts the **backend only**. The backend speaks
WebSocket and nothing else — a browser pointed at it gets `426 Upgrade
Required`, not a page. Serving the page is a separate job, and until you do
it there is no site to open: see [§ 7.4](#74-serve-the-page).

**systemd** (Debian, Ubuntu) — `/etc/systemd/system/hdlboard.service`:

```ini
[Unit]
Description=HDLBoard simulation backend (GHDL and Icarus Verilog)
After=network.target

[Service]
Type=simple
User=hdlboard
WorkingDirectory=/srv/HDLBoard
ExecStart=/usr/bin/node /srv/HDLBoard/server/dist/server.js
Environment=HDL_WS_PORT=9010
Environment=HDL_MAX_SESSIONS=32
Restart=on-failure
# Modest hardening: the backend needs only its own tree and a temp dir.
PrivateTmp=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /srv/HDLBoard hdlboard
sudo systemctl enable --now hdlboard
sudo journalctl -u hdlboard -f
```

**OpenRC** (Alpine) — three steps, and none of them is optional: the service
runs as its own user, from its own directory, and a missing one fails the
start with little explanation.

**1. Create the user and deploy the tree.** Alpine has busybox `adduser`, not
`useradd` (that's the `shadow` package, not installed by default). Run it as
**one** command, not as six pasted `sudo` lines — a multi-line paste into a
terminal that's about to prompt for a sudo password routinely executes the
first line and silently discards the rest:

```bash
cd /path/to/HDLBoard      # your checkout, spelled out — it must be built, § 7.2
SRC=$PWD                  # an absolute path, resolved before sudo sees it

sudo sh -eu <<SETUP
[ -f "$SRC/server/dist/server.js" ] || { echo "not a built checkout: $SRC — cd into your checkout first" >&2; exit 1; }
getent group hdlboard >/dev/null || addgroup -S hdlboard
id hdlboard >/dev/null 2>&1 || adduser -S -D -H -h /srv/HDLBoard -s /sbin/nologin -G hdlboard hdlboard
install -d -o hdlboard -g hdlboard /srv/HDLBoard
cp -a "$SRC/." /srv/HDLBoard/
chown -R hdlboard:hdlboard /srv/HDLBoard
[ -e /var/log/hdlboard.log ] || install -m 644 -o hdlboard -g hdlboard /dev/null /var/log/hdlboard.log
SETUP
```

Three things make that safe to run, and to re-run:

- **Spell the path out; don't use `~` anywhere here.** `~` is whoever's home
  the shell belongs to, so in a root shell (`sudo su`) it's `/root`: a `~`
  inside the block copies from `/root/HDLBoard`, and a `cd ~/HDLBoard` fails
  and silently leaves you somewhere else, which `$PWD` then picks up. Run
  this from your own shell with `sudo`, as written, rather than from `sudo
  su`.
- **The first line checks before anything is created**, so a wrong path costs
  you an error message rather than a half-built setup.
- **`-e` and the `getent`/`id`/`[ -e ]` guards.** The run stops at the first
  real error, and a second attempt skips what already exists instead of
  failing with `addgroup: group 'hdlboard' in use` and taking the rest down
  with it — or, for the log, emptying it (`install` on an existing file
  truncates it).
- **Re-running is also how you redeploy.** After a `git pull` and a rebuild
  (§ 7.2), run the block again and `sudo rc-service hdlboard restart`.

Check all of it landed before going on — **every one of these must print, and
if any of them doesn't, fix that before writing the service file**, because
the failure otherwise surfaces much later as a service that silently refuses
to start:

```bash
id hdlboard                                     # the user, not just the group
ls -ld /srv/HDLBoard                            # owned by hdlboard
ls -l /srv/HDLBoard/server/dist/server.js       # the built backend
```

That last one is the one people miss: `cp -a` of an unbuilt checkout copies a
tree with no `server/dist/`, and the service then starts node against a file
that isn't there.

**2. Write `/etc/init.d/hdlboard`** and `sudo chmod +x` it:

```sh
#!/sbin/openrc-run
name="HDLBoard simulation backend"
description="WebSocket backend that compiles and runs VHDL with GHDL and Verilog with Icarus"

command="/usr/bin/node"
command_args="/srv/HDLBoard/server/dist/server.js"
command_user="hdlboard:hdlboard"
directory="/srv/HDLBoard"
supervisor="supervise-daemon"
pidfile="/run/${RC_SVCNAME}.pid"
output_log="/var/log/hdlboard.log"
error_log="/var/log/hdlboard.log"

# The daemon's environment. A plain `export` at the top of this file is not
# how you set it — pass it to the supervisor, which is what actually spawns
# node. A service's PATH is /bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:
# /usr/local/sbin, so the source build from § 6 (in /usr/local) is found as
# it is, and `apk add iverilog` lands in /usr/bin. GHDL installed anywhere
# else (/opt, or under a user's ~/.local) needs GHDL_EXE with an absolute
# path; an Icarus outside the service's PATH needs IVERILOG_EXE and VVP_EXE
# (alpineInstall.sh pins all three, so the service uses the ones it verified).
supervise_daemon_args="--env HDL_WS_PORT=9010 --env HDL_MAX_SESSIONS=32"
#supervise_daemon_args="$supervise_daemon_args --env GHDL_EXE=/usr/local/bin/ghdl --env IVERILOG_EXE=/opt/iverilog/bin/iverilog"

depend() {
	need net
}
```

**3. Enable, start, check:**

```bash
sudo rc-update add hdlboard default
sudo rc-service hdlboard start
sudo rc-service hdlboard status
curl -si http://localhost:9010/hdlsim | head -1     # 426 Upgrade Required = working
cat /var/log/hdlboard.log                            # "… listening on ws://0.0.0.0:9010/hdlsim"
```

`rc-service … status` and even `start` report success while node is
crash-looping (`supervise-daemon` respawns it up to five times), so the log
line above — not `[ ok ]` — is what tells you it's really up.

**4. Confirm it comes back on its own.** `rc-update add` only registers the
service; it doesn't prove it can start unattended. After a reboot:

```bash
rc-status default          # hdlboard should say [ started ]
```

If it says `stopped` and `/var/log/hdlboard.log` doesn't exist, the service
never got as far as running node — that is the signature of an incomplete
step 1, not of a boot problem. Re-run the three checks at the end of step 1;
the usual finding is that `addgroup` succeeded and `adduser` didn't, so the
group exists but the user doesn't.

If the start fails, the log is the first place to look — and these are the
ways it goes wrong:

| Message | Cause |
|---|---|
| `failed to acquire lock: Permission denied` | Not run as root — `supervise-daemon` needs it. Use `sudo` |
| a `--user` or `chown` failure, service never starts | Step 1 skipped: the `hdlboard` user doesn't exist |
| `chdir: No such file or directory` | `/srv/HDLBoard` doesn't exist, or `directory=` points somewhere else |
| Service runs, but every simulation reports GHDL missing | GHDL isn't reachable by the service user — see below |
| Service runs and VHDL works, but a Verilog run says `Icarus Verilog (iverilog) was not found` | Icarus isn't installed, or isn't on the service user's `PATH` — install it, or set `IVERILOG_EXE` (and `VVP_EXE`) to absolute paths |
| `stopped` after a reboot, and no `/var/log/hdlboard.log` at all | It never started node. Step 1 didn't complete — check `id hdlboard` and `ls /srv/HDLBoard/server/dist/server.js` |
| `addgroup: group 'hdlboard' in use`, and nothing after it ran | A partly-completed earlier attempt. Re-run step 1's block as written — the guards make it idempotent |
| `Cannot find module '/srv/HDLBoard/server/dist/server.js'` in the log | The tree was copied before it was built — § 7.2, then copy again |

**A GHDL under someone's home directory won't do.** A service's PATH doesn't
include home directories, so it needs `GHDL_EXE` with an absolute path — and
that still isn't enough if GHDL was unpacked into a
home directory, because the upstream tarball's launcher resolves `$HOME`:

```console
$ env HOME=/srv/HDLBoard ~/.local/bin/ghdl --version
… /srv/HDLBoard/.local/opt/ghdl/…/ld-linux-x86-64.so.2: not found
```

The service user has its own `$HOME`, so the launcher looks in the wrong
place and every simulation fails while the backend itself looks healthy.
Install GHDL somewhere system-wide — `/usr/local` from the source build in
[§ 6](#alpine-linux), or move the unpacked tree to `/opt/ghdl` and rewrite its
launcher with absolute paths — or, on a single-user machine, skip the
dedicated account and run the service as the user that owns the GHDL install.

`need net` resolves to Alpine's `networking` service, which is in the `boot`
runlevel by default. On a host where the network is managed by something not
registered with OpenRC, drop that line, or the service waits for a dependency
that never starts.

**5. Serve the page.** `rc-status` showing `hdlboard [ started ]` means the
backend is up; it does not mean there's a website. Install a static server
and point it at the `dist/` you deployed:

```bash
sudo apk add nginx

sudo sh -eu <<'CONF'
cat > /etc/nginx/http.d/hdlboard.conf <<'NGINX'
server {
    listen 5173 default_server;
    listen [::]:5173 default_server;
    root /srv/HDLBoard/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
NGINX
rm -f /etc/nginx/http.d/default.conf
nginx -t
CONF

sudo rc-update add nginx default
sudo rc-service nginx start
```

Then `http://<host-ip>:5173/` is the page and port 9010 is the board — both have
to be reachable from the client, per [§ 1](#1-how-it-fits-together). Alpine's
nginx runs as the `nginx` user, which only needs to read `/srv/HDLBoard/dist`;
the `install -d` in step 1 already leaves it world-readable.

**6. Check stop and restart.** Both services should go down and come back
on command. `curl` prints `000` (exit status 7) when nothing is listening:

```bash
probe() {
  echo "page  :5173 $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)"       # 200
  echo "board :9010 $(curl -s -o /dev/null -w '%{http_code}' http://localhost:9010/hdlsim)" # 426
}

probe                                           # 200 and 426: both up
sudo rc-service hdlboard stop; sudo rc-service nginx stop
probe                                           # 000 and 000: both gone
netstat -ltn | grep -E ':(5173|9010) ' || echo "no listeners"
sudo rc-service hdlboard start; sudo rc-service nginx start; sleep 1
probe                                           # 200 and 426 again
```

The `sleep` matters: `start` returns as soon as node is spawned, before it has
bound the port, so an immediate probe can show the board as `000` for a moment
even though nothing is wrong.

`restart` does the same in one step and gives node a new PID. The log shows
`SIGTERM received — shutting down` on each stop, followed by a fresh
`listening on …` line. (Busybox has `netstat` but not `ss`.)

**launchd** (macOS) — `~/Library/LaunchAgents/lan.hdlboard.plist` with a
`ProgramArguments` array of `/opt/homebrew/bin/node` and the absolute path to
`server/dist/server.js`, `RunAtLoad` true, then
`launchctl load ~/Library/LaunchAgents/lan.hdlboard.plist`.

### 7.4 Serve the page

The backend has no web page in it, so one of these has to be running too:

| | |
|---|---|
| **nginx** (or any static server) | Serves the `dist/` from [§ 7.2](#72-production--build-once-serve-static). The production answer; the OpenRC walkthrough's step 5 above has a complete Alpine recipe, and the same `server {}` block works under Debian, Ubuntu and macOS |
| **`scripts/start.sh`** | Serves the page *and* the backend, via the Vite dev server ([§ 7.1](#71-quick--the-dev-server)). Fine for a lab session, not for a machine that runs unattended — and don't run it alongside the service, they'd both want port 9010 |

A backend with no page in front of it is the most common way this setup looks
finished and isn't: `rc-status`/`systemctl` says started, the port answers
`426`, and a browser still gets nothing.

### 7.5 Native Windows — test it on this machine

To try the server on a Windows PC before a lab, with no WSL and no Docker, use
the scripts in `scripts\`. They are the Windows counterparts of `start.sh` and
`stop.sh`, and they use the same GHDL and Icarus Verilog builds the Windows
installer ships. You only need [Node.js](https://nodejs.org/) 18 or newer and
[Git](https://git-scm.com/download/win). For a server that runs for weeks, use
Docker ([§ 4](#4-host-with-docker)) or WSL2 ([§ 6](#windows-wsl2)) instead.

In a Command Prompt or PowerShell window:

```bat
git clone https://github.com/rlangoy/HDLBoard.git
cd HDLBoard
scripts\start-windows.cmd
scripts\test-windows.cmd
```

**`start-windows.cmd`** does every step, and skips each one that is already done:

1. Checks that Node.js 18+ is installed.
2. Runs `npm install` in the repository and in `server\` when `node_modules` is
   missing or older than `package-lock.json`, as after a `git pull`.
3. Downloads GHDL and Icarus Verilog into `winInstaller\vendor\` the first
   time, verified against pinned checksums (about 90 MB, using the installer's
   own `fetch-ghdl.ps1` and `fetch-iverilog.ps1`).
4. Builds the backend.
5. Starts the page (Vite, port `5173`) and the backend (port `9010`) in two
   minimised windows, logging to `.run\frontend.log` and `.run\backend.log`.
   It stops with a message, and starts nothing, if either port is already in use.

It then prints the addresses to open, including one for each of the machine's
network adapters.

**`test-windows.cmd`** runs the checks of [§ 11](#11-check-it-works) in one go,
and exits with 0 only when all of them pass:

```text
PASS  Page http://localhost:5173/ answered 200
PASS  Backend http://localhost:9010/hdlsim answered 426

=== Board scenarios through ws://localhost:9010/hdlsim ===
de1_soc        vhdl     PASS
de1_soc        verilog  PASS
...
7/7 passed against ws://localhost:9010/hdlsim

PASS - the page, the backend, GHDL and Icarus Verilog all work.
```

The board scenarios are those of `tools\verify-backend.mjs`. They run real
VHDL and Verilog designs through the backend, so a pass means the page, the
backend, GHDL and Icarus Verilog all work. What they can't check is a browser on
another machine. For that, open `http://<this-pc's-ip>:5173/` there, press
**Start** and flip a switch.

**From other machines.** The first time the servers start, Windows asks
whether to let Node.js through the firewall. Allow it for **Private**
networks. If you dismissed that prompt, or the network is set to Public, open
the two ports in an administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "HDLBoard" -Direction Inbound -Protocol TCP -LocalPort 5173,9010 -Action Allow
```

**Stop it** with `scripts\stop-windows.cmd`. It stops the Node.js process on
each port and leaves a port held by any other program alone.

**Other ports.** Set them before starting, and use the same values for all
three scripts:

```bat
set STATIC_PORT=8080
set HDL_WS_PORT=9090
scripts\start-windows.cmd
```

If something goes wrong, look in `.run\backend.log` and `.run\frontend.log`
first. A page that loads blank is covered in [§ 12](#12-troubleshooting).

---

### 7.6 Publish projects with your server

Project folders in `dist/projects/` (or `public/projects/` before building) open in HDLBoard as `projects/<name>/<name>.hdlboard.json`, from Open Project or with a `?project=` link. See [PROJECTS.md](PROJECTS.md#publish-projects).

## 8. One port, with a reverse proxy

Two open ports is the default because the page and the backend are separate
servers. You can collapse them into one by telling the build that the backend
lives on the web port, and having the web server proxy `/hdlsim` to it:

```bash
VITE_HDL_WS_PORT=80 npm run build     # bake port 80 into the page
```

```nginx
server {
    listen 80;
    server_name hdlboard.example.lan;
    root /srv/HDLBoard/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /hdlsim {
        proxy_pass http://127.0.0.1:9010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 1d;          # simulations idle between frames
    }
}
```

Now only port 80 has to be open, and 9010 can be bound to loopback by a
firewall rule. `proxy_read_timeout` matters: the default 60 s closes a socket
that's merely waiting for the student to flip a switch.

**HTTPS does not work as shipped.** The page always builds a `ws://` URL, and
browsers block a plain WebSocket from an `https://` page, so a TLS front end
gets you a dark board. It's a one-line change if you need it —
`src/components/workbench/hdlClient.ts:34`:

```ts
const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
return `${scheme}://${window.location.hostname}:${port}/hdlsim`;
```

Rebuild, then terminate TLS at nginx and proxy `/hdlsim` exactly as above.
That change isn't in the repository; you're maintaining a local patch.

---

## 9. Configuration reference

Backend, read at startup:

| Variable | Default | Effect |
|---|---|---|
| `HDL_WS_PORT` | `9010` | Port the backend listens on |
| `HDL_MAX_SESSIONS` | `32` | Concurrent sessions before new ones are refused |
| `GHDL_EXE` | `ghdl` | Path to the GHDL binary, if it isn't on `PATH` |
| `GHDL_DIR` | unset | A GHDL installation (the Windows app ships one); the backend runs `<dir>/bin/ghdl`. Takes precedence over `GHDL_EXE` |
| `IVERILOG_EXE` | `iverilog` | Path to the Icarus Verilog compiler, if it isn't on `PATH` |
| `VVP_EXE` | `vvp` beside `IVERILOG_EXE`, else on `PATH` | Path to Icarus's `vvp` runtime, if it is not beside the compiler |
| `IVERILOG_DIR` | unset | A self-contained Icarus tree (the Windows app ships one); the backend runs it with `-B`/`-M`. Takes precedence over the two above |

The simulator locations can also be given on the command line, where they win over
the variables — `node dist/server.js --iverilog-dir <dir> --ghdl-dir <dir>` (or
`--ghdl-exe <path>`; `--flag=value` works too). An unknown flag stops the backend
with a usage message. The Windows installer uses these flags: it writes the
installation's own `resources\iverilog` and `resources\ghdl` into the shortcuts it
creates.

`scripts/start.sh`:

| Variable | Default | Effect |
|---|---|---|
| `STATIC_PORT` | `5173` | Port for the page |
| `HDL_WS_PORT` | `9010` | Passed through to the backend, and to the page it serves |
| `HDLBOARD_SKIP_INSTALL` | unset | `1` = check for prerequisites, never install |
| `HDLBOARD_ASSUME_YES` | unset | `1` = install GHDL and Icarus Verilog without prompting |

Frontend, read at **build** time only:

| Variable | Default | Effect |
|---|---|---|
| `VITE_HDL_WS_PORT` | `9010` | Backend port the page will connect to |

**Changing the backend port means changing it in two places:** rebuild the
page with `VITE_HDL_WS_PORT=<n> npm run build` *and* start the backend with
`HDL_WS_PORT=<n>`. They are compiled in independently, and a mismatch shows
up only as a board that never lights. (`scripts/start.sh` passes its
`HDL_WS_PORT` to the dev-server page too, so there it is one setting.)

**Older names still work.** These settings were called `GHDL_WS_PORT`,
`GHDL_MAX_SESSIONS` and `VITE_GHDL_WS_PORT` when GHDL was the only
simulator, and the WebSocket path was `/ghdlsim`. The old names are still
read when the new ones are unset, and the backend still answers on
`/ghdlsim`, so an existing service file, `.env` or reverse-proxy rule keeps
working; new setups should use the `HDL_*` names and `/hdlsim`.

---

## 10. Open the firewall

Substitute your own ports if you changed them. The Alpine installer uses `80`
and `9010`, and Docker needs only the page port (`80`). Docker publishes it
itself, but a host firewall such as `ufw` still has to allow it.

```bash
# Debian / Ubuntu (ufw)
sudo ufw allow 5173/tcp && sudo ufw allow 9010/tcp

# Alpine — a stock install has no firewall, so there's nothing to open.
# If you run one, install iptables, allow the ports, and load the rules at boot:
sudo apk add iptables
sudo iptables -A INPUT -p tcp -m multiport --dports 5173,9010 -j ACCEPT
sudo rc-service iptables save
sudo rc-update add iptables
```

If you enable a default-drop policy, allow `22` first or you'll lock yourself
out. (Using the one-port setup of § 8? Open `80` instead of both.)

macOS prompts on first launch — allow `node` to accept incoming connections;
the setting lives in **System Settings → Network → Firewall → Options**.
Windows is the `New-NetFirewallRule` line in [§ 6](#windows-wsl2) (WSL2) or [§ 7.5](#75-native-windows--test-it-on-this-machine) (native).

---

## 11. Check it works

From the host (use your own page port: `80` for Docker and the Alpine
installer, `5173` for `start.sh`). On native Windows, `scripts\test-windows.cmd`
runs all of this section's checks from the host in one go ([§ 7.5](#75-native-windows--test-it-on-this-machine)):

```bash
curl -I http://localhost:5173/                 # 200
curl -i  http://localhost:9010/hdlsim         # 426 Upgrade Required — correct
curl -i  http://localhost/hdlsim              # Docker: the same 426, through nginx
```

`426` is the backend saying "this port speaks WebSocket": it means the backend
is up, not that something is broken.

Then from **another machine**, open `http://<host-ip>:5173/`, and load a
design that proves the round trip — `LEDR <= SW;` — press **Start**, and flip
a switch. If the LEDs follow the switches, the page, the backend and GHDL are
all working together. Nothing else tests all three at once.

Repeat it for Verilog: open `DE1_SoC.v` in the `verilog/` folder of the
starter project, click its dot to make it the top file,
and press **Start**. The console should print `Icarus Verilog version …`
before `Simulation running ...`, and the LEDs should follow the switches.

From the host you can also run the whole scenario set, in both languages,
against the backend (needs Node and `npm install` in `server/`):

```bash
node tools/verify-backend.mjs ws://localhost:9010/hdlsim     # prints PASS/FAIL per scenario, exit 0 if all pass
```

Under Docker the script is already in the backend image:
`docker compose exec backend node tools/verify-backend.mjs`. From a checkout
on the host, `node tools/verify-backend.mjs ws://localhost/hdlsim` runs the
same set through nginx, so it tests the WebSocket proxy too.

---

## 12. Troubleshooting

| Symptom | Cause |
|---|---|
| Page loads, board stays dark, console says the backend is unreachable | The backend port isn't open to the client. The page port being open is not enough — see [§ 1](#1-how-it-fits-together) |
| Works on the host, not from other machines | Firewall ([§ 10](#10-open-the-firewall)), or WSL networking ([§ 6](#windows-wsl2)) |
| Board dark only over HTTPS | Mixed content — [§ 8](#8-one-port-with-a-reverse-proxy) |
| `ghdl not found on PATH` | GHDL isn't installed, or isn't on the service user's `PATH` — set `GHDL_EXE` to its absolute path |
| `Icarus Verilog (iverilog) was not found, so Verilog designs cannot run` | Icarus isn't installed, or isn't on the service user's `PATH` — install it (`apt install iverilog`, `apk add iverilog`, `brew install icarus-verilog`) or set `IVERILOG_EXE`; VHDL is unaffected |
| Verilog console starts with a warning about an untested Icarus version | The installed Icarus is neither 12.x nor 13.x. It usually still works; install 13.0 if compiling or running misbehaves |
| `EADDRINUSE` | Something already holds the port: `ss -ltnp \| grep 9010` (`netstat -ltn` on Alpine), or an earlier run — `./scripts/stop.sh` |
| `Too many concurrent sessions` | The `HDL_MAX_SESSIONS` cap; raise it if the hardware can take it |
| Simulation stops after 60 s | A batch run (a testbench with no ports) hit its timeout — usually a process with no `wait` (VHDL) or no `$finish`/delay (Verilog), not a hosting problem |
| Docker: `failed to connect to the docker API` | The Docker daemon isn't running. Start Docker Desktop, or `systemctl start docker` / `rc-service docker start` |
| Docker: `web` never starts, `backend` is `unhealthy` | `docker compose logs backend`. The healthcheck expects `426` from the backend, and `web` waits for it by design |
| Docker: the build fails at the `RUN <<'PROBE'` step with exit code 2, and the command in the error is full of `\r\n` | The Dockerfile was checked out with CRLF line endings. `.gitattributes` forces LF for `docker/`; re-checkout with `git rm --cached -r docker && git checkout -- docker` |
| Docker: port 80 is already in use | Set `HDLBOARD_PAGE_PORT` in `.env` ([§ 4.2](#42-settings)), then `docker compose up -d --build` |
| Page is blank; console shows `ReferenceError: __APP_VERSION__ is not defined` | The dev server was started outside the repository root, so it never read `vite.config.ts`. Stop whatever holds port 5173 and start it again with `npm run dev` from the repository root — see [BUILDING.md](BUILDING.md#running-the-dev-servers-by-hand-native-windows) |
| Page is stale after `git pull` | Rebuild: `npm run build`, and restart the backend. `start.sh` rebuilds the backend for you, not a production `dist/` |

A design that prints on every clock edge is throttled to 200 console lines a
second, with a summary line for what was dropped — that is by design, not loss.

Logs: `.run/backend.log` and `.run/frontend.log` under `scripts/start.sh`,
`journalctl -u hdlboard` under systemd, `/var/log/hdlboard.log` under OpenRC
(and the Alpine installer), `docker compose logs backend` under Docker.

---

## See also

- [`BUILDING.md`](BUILDING.md) — building from source and the dev workflow
- [`docker/README.md`](../docker/README.md) — the Docker setup in short form
- [`scripts/alpineInstall.sh`](../scripts/alpineInstall.sh) — the Alpine
  installer, commented step by step
- [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) — the backend's
  wire protocol, session model and limits
- [`Verilog_implementation_plan.md`](Verilog_implementation_plan.md) — how the
  Icarus Verilog engine is chosen, compiled and run
- [`Design_Description.md`](Design_Description.md) — the board components and
  known limitations
