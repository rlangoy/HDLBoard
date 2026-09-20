# Web Hosting — host HDLBoard yourself

How to run HDLBoard on a machine of your own so that other people open it in
a browser: a classroom PC serving a lab, a VM, a spare laptop on the same
network. If you only want it on your *own* desktop, the
[Windows installer](../README.md#installing) is simpler, and
[`BUILDING.md`](BUILDING.md) covers a plain developer checkout.

Instructions below for **Debian**, **Ubuntu**, **Alpine Linux**, **macOS**
and **Windows (via WSL2)**.

---

## 1. How it fits together

HDLBoard is two processes, and a browser that talks to both:

```
   browser                         host machine
  ┌─────────┐   HTTP :5173        ┌──────────────────────────────┐
  │         │ ───────────────────▶│  the page (static files)     │
  │  page   │                     │  dist/  —  any web server    │
  │         │   WebSocket :9010   ├──────────────────────────────┤
  │  board  │ ◀──────────────────▶│  node server/dist/server.js  │
  └─────────┘   /ghdlsim          │       └─ spawns ghdl         │
                                  └──────────────────────────────┘
```

**The one rule that decides your whole setup:** the page builds its backend
URL as `ws://<the host you typed in the address bar>:<port>/ghdlsim`
(`src/components/workbench/ghdlClient.ts:33`), where the port is baked in at
build time (default `9010`). So:

- the backend port must be reachable **from each student's browser**, not just
  from the host — opening only the page port gets you a permanently dark board;
- the hostname takes care of itself: whatever address the page was loaded
  from is the address the socket uses, so nothing needs configuring per client;
- one port for everything is possible, with a reverse proxy — see
  [§ 6](#6-one-port-with-a-reverse-proxy).

---

## 2. Requirements

| | Needed | Notes |
|---|---|---|
| **OS** | Linux, macOS, or Windows with WSL2 | `scripts/start.sh` / `stop.sh` are POSIX shell; Windows hosts run them inside WSL |
| **[Node.js](https://nodejs.org/)** | 18+ (20+ recommended) | Runs the backend and builds the page |
| **[GHDL](https://ghdl.github.io/ghdl/)** | any build supporting `--std=08` and `-g<name>=<value>` | Verified against 5.0.1 and 6.0.0, mcode |
| **Ports** | 2 open to clients | Default `5173` (page) and `9010` (backend) |
| **CPU / RAM** | ~1 core and ~150 MB per *active* simulation | Every running session forks its own `ghdl` process |
| **Disk** | the checkout (~300 MB with `node_modules`) | Sessions also write to the system temp directory, one directory each, removed when the browser tab closes |

Nothing else, and no external services or accounts: everything stays on your
machine and your network.

**Sizing.** The backend accepts 32 concurrent sessions by default
(`GHDL_MAX_SESSIONS`) and refuses the 33rd with a clear message rather than
melting. A session only costs CPU while its simulation is actually running,
so a 4-core machine comfortably serves a class of 20–30 students editing and
running in bursts. Raise or lower the cap to match the hardware.

---

## 3. Read this before you expose it

The backend compiles and runs VHDL that anyone who can reach the port sends
it. GHDL is a real compiler and VHDL-2008 has real file I/O, so **anyone who
can reach the backend can run code as the user the backend runs as.** Each
session gets its own temp directory and simulations are killed after a
timeout, but that is scheduling hygiene, not a sandbox. There is no
authentication and no TLS.

Host it accordingly:

- **Good:** a classroom LAN, a lab VLAN, a VPN, a machine you'd hand students
  a shell on anyway.
- **Not good:** a public IP, a cloud VM with an open security group, a port
  forwarded from your home router.

If it must sit somewhere less trusted, run it as a dedicated unprivileged user
(§ 5.3 does this) inside a container or VM you can throw away, and put a VPN
or an authenticating proxy in front.

---

## 4. Install the prerequisites

Pick your platform. Each ends with the same two checks:

```bash
node -v      # v18 or newer
ghdl --version
```

### Debian

Debian 12 (bookworm) and newer package both:

```bash
sudo apt update
sudo apt install -y nodejs npm ghdl git
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
sudo apt install -y nodejs npm ghdl git
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

Node is packaged; **GHDL is not** (checked against 3.24 main and community),
so build it — Alpine has the Ada compiler GHDL needs:

```bash
sudo apk add nodejs npm git build-base gcc-gnat zlib-dev

git clone https://github.com/ghdl/ghdl ~/ghdl-src
cd ~/ghdl-src
./configure --prefix=/usr/local          # mcode backend, the default
make
sudo make install
cd - && ghdl --version
```

A minimal Alpine has `doas` rather than `sudo` — substitute it, or
`apk add sudo` first. The build takes a few minutes. Don't reach for the binaries on GHDL's
releases page: they're linked against glibc and Alpine is musl, so they need
a glibc shim to run at all and misbehave in ways that look like compiler bugs.
If you'd rather not build, run HDLBoard in a Debian container on the Alpine
host instead.

### macOS

With [Homebrew](https://brew.sh/):

```bash
brew install node ghdl git
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

## 5. Get it running

```bash
git clone https://github.com/rlangoy/HDLBoard.git
cd HDLBoard
```

### 5.1 Quick — the dev server

Good for a lab session you start in the morning and stop in the afternoon:

```bash
./scripts/start.sh
```

That installs any missing npm dependencies (and offers to install GHDL if you
skipped § 4), builds the backend, and starts both processes bound to
`0.0.0.0`. Students open `http://<your-ip>:5173/`. Logs are in `.run/*.log`;
`./scripts/stop.sh` stops both.

It's the Vite dev server, so it rebuilds on file changes and does more work
per request than it needs to — fine for a class, not what you want running
for months.

### 5.2 Production — build once, serve static

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
    listen 80;
    server_name hdlboard.example.lan;
    root /srv/HDLBoard/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

Clients then use port 80 for the page and 9010 for the board. To put both on
port 80, see [§ 6](#6-one-port-with-a-reverse-proxy).

### 5.3 Keep the backend running

Everything in this section starts the **backend only**. The backend speaks
WebSocket and nothing else — a browser pointed at it gets `426 Upgrade
Required`, not a page. Serving the page is a separate job, and until you do
it there is no site to open: see [§ 5.4](#54-serve-the-page).

**systemd** (Debian, Ubuntu) — `/etc/systemd/system/hdlboard.service`:

```ini
[Unit]
Description=HDLBoard GHDL backend
After=network.target

[Service]
Type=simple
User=hdlboard
WorkingDirectory=/srv/HDLBoard
ExecStart=/usr/bin/node /srv/HDLBoard/server/dist/server.js
Environment=GHDL_WS_PORT=9010
Environment=GHDL_MAX_SESSIONS=32
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
cd ~/HDLBoard             # your checkout — it must already be built, § 5.2
SRC=$PWD                  # an absolute path, resolved before sudo sees it

sudo sh -eu <<SETUP
[ -f "$SRC/server/dist/server.js" ] || { echo "not a built checkout: $SRC" >&2; exit 1; }
getent group hdlboard >/dev/null || addgroup -S hdlboard
id hdlboard >/dev/null 2>&1 || adduser -S -D -H -h /srv/HDLBoard -s /sbin/nologin -G hdlboard hdlboard
install -d -o hdlboard -g hdlboard /srv/HDLBoard
cp -a "$SRC/." /srv/HDLBoard/
chown -R hdlboard:hdlboard /srv/HDLBoard
install -o hdlboard -g hdlboard /dev/null /var/log/hdlboard.log
SETUP
```

Three things make that safe to run, and to re-run:

- **`cd` first, `$PWD` second.** Don't write `~/HDLBoard` into the block. `~`
  is resolved by whoever is running it, so from a root shell (`sudo su`) it
  becomes `/root/HDLBoard` and the copy fails with
  `cp: can't stat '/root/HDLBoard/.'`.
- **The first line checks before anything is created**, so a wrong path costs
  you an error message rather than a half-built setup.
- **`-e` and the `getent`/`id` guards.** The run stops at the first real
  error, and a second attempt skips what already exists instead of failing
  with `addgroup: group 'hdlboard' in use` and taking the rest down with it.

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
name="HDLBoard GHDL backend"
description="WebSocket backend that compiles and runs VHDL with GHDL"

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
# node. A service's PATH is only /sbin:/usr/sbin:/bin:/usr/bin, so GHDL
# installed anywhere else (a source build in /usr/local, or under a user's
# ~/.local) needs GHDL_EXE with an absolute path.
supervise_daemon_args="--env GHDL_WS_PORT=9010 --env GHDL_MAX_SESSIONS=32"
#supervise_daemon_args="$supervise_daemon_args --env GHDL_EXE=/usr/local/bin/ghdl"

depend() {
	need net
}
```

**3. Enable, start, check:**

```bash
sudo rc-update add hdlboard default
sudo rc-service hdlboard start
sudo rc-service hdlboard status
curl -i http://localhost:9010/ghdlsim     # 426 Upgrade Required = working
tail -f /var/log/hdlboard.log
```

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
four ways it goes wrong:

| Message | Cause |
|---|---|
| `unable to create control fifo: Permission denied` | Not run as root — `supervise-daemon` needs it. Use `sudo` |
| a `--user` or `chown` failure, service never starts | Step 1 skipped: the `hdlboard` user doesn't exist |
| `chdir: No such file or directory` | `/srv/HDLBoard` doesn't exist, or `directory=` points somewhere else |
| Service runs, but every simulation reports GHDL missing | GHDL isn't reachable by the service user — see below |
| `stopped` after a reboot, and no `/var/log/hdlboard.log` at all | It never started node. Step 1 didn't complete — check `id hdlboard` and `ls /srv/HDLBoard/server/dist/server.js` |
| `addgroup: group 'hdlboard' in use`, and nothing after it ran | A partly-completed earlier attempt. Re-run step 1's block as written — the guards make it idempotent |
| `Cannot find module '/srv/HDLBoard/server/dist/server.js'` in the log | The tree was copied before it was built — § 5.2, then copy again |

**A GHDL under someone's home directory won't do.** A service's PATH is only
`/sbin:/usr/sbin:/bin:/usr/bin`, so anything elsewhere needs `GHDL_EXE` with
an absolute path — and that still isn't enough if GHDL was unpacked into a
home directory, because the upstream tarball's launcher resolves `$HOME`:

```console
$ env HOME=/srv/HDLBoard ~/.local/bin/ghdl --version
… /srv/HDLBoard/.local/opt/ghdl/…/ld-linux-x86-64.so.2: not found
```

The service user has its own `$HOME`, so the launcher looks in the wrong
place and every simulation fails while the backend itself looks healthy.
Install GHDL somewhere system-wide — `/usr/local` from the source build in
[§ 4](#alpine-linux), or move the unpacked tree to `/opt/ghdl` and rewrite its
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
    listen 80 default_server;
    listen [::]:80 default_server;
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

Then `http://<host-ip>/` is the page and port 9010 is the board — both have
to be reachable from the client, per [§ 1](#1-how-it-fits-together). Alpine's
nginx runs as the `nginx` user, which only needs to read `/srv/HDLBoard/dist`;
the `install -d` in step 1 already leaves it world-readable.

**launchd** (macOS) — `~/Library/LaunchAgents/lan.hdlboard.plist` with a
`ProgramArguments` array of `/opt/homebrew/bin/node` and the absolute path to
`server/dist/server.js`, `RunAtLoad` true, then
`launchctl load ~/Library/LaunchAgents/lan.hdlboard.plist`.

### 5.4 Serve the page

The backend has no web page in it, so one of these has to be running too:

| | |
|---|---|
| **nginx** (or any static server) | Serves the `dist/` from [§ 5.2](#52-production--build-once-serve-static). The production answer; the OpenRC walkthrough's step 5 above has a complete Alpine recipe, and the same `server {}` block works under Debian, Ubuntu and macOS |
| **`scripts/start.sh`** | Serves the page *and* the backend, via the Vite dev server ([§ 5.1](#51-quick--the-dev-server)). Fine for a lab session, not for a machine that runs unattended — and don't run it alongside the service, they'd both want port 9010 |

A backend with no page in front of it is the most common way this setup looks
finished and isn't: `rc-status`/`systemctl` says started, the port answers
`426`, and a browser still gets nothing.

---

## 6. One port, with a reverse proxy

Two open ports is the default because the page and the backend are separate
servers. You can collapse them into one by telling the build that the backend
lives on the web port, and having the web server proxy `/ghdlsim` to it:

```bash
VITE_GHDL_WS_PORT=80 npm run build     # bake port 80 into the page
```

```nginx
server {
    listen 80;
    server_name hdlboard.example.lan;
    root /srv/HDLBoard/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /ghdlsim {
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
`src/components/workbench/ghdlClient.ts:33`:

```ts
const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
return `${scheme}://${window.location.hostname}:${port}/ghdlsim`;
```

Rebuild, then terminate TLS at nginx and proxy `/ghdlsim` exactly as above.
That change isn't in the repository; you're maintaining a local patch.

---

## 7. Configuration reference

Backend, read at startup:

| Variable | Default | Effect |
|---|---|---|
| `GHDL_WS_PORT` | `9010` | Port the backend listens on |
| `GHDL_MAX_SESSIONS` | `32` | Concurrent sessions before new ones are refused |
| `GHDL_EXE` | `ghdl` | Path to the GHDL binary, if it isn't on `PATH` |

`scripts/start.sh`:

| Variable | Default | Effect |
|---|---|---|
| `STATIC_PORT` | `5173` | Port for the page |
| `GHDL_WS_PORT` | `9010` | Passed through to the backend |
| `HDLBOARD_SKIP_INSTALL` | unset | `1` = check for prerequisites, never install |
| `HDLBOARD_ASSUME_YES` | unset | `1` = install GHDL without prompting |

Frontend, read at **build** time only:

| Variable | Default | Effect |
|---|---|---|
| `VITE_GHDL_WS_PORT` | `9010` | Backend port the page will connect to |

**Changing the backend port means changing it in two places:** rebuild the
page with `VITE_GHDL_WS_PORT=<n> npm run build` *and* start the backend with
`GHDL_WS_PORT=<n>`. They are compiled in independently, and a mismatch shows
up only as a board that never lights.

---

## 8. Open the firewall

Substitute your own ports if you changed them.

```bash
# Debian / Ubuntu (ufw)
sudo ufw allow 5173/tcp && sudo ufw allow 9010/tcp

# Alpine (awall/iptables)
sudo iptables -A INPUT -p tcp -m multiport --dports 5173,9010 -j ACCEPT
sudo rc-service iptables save
```

macOS prompts on first launch — allow `node` to accept incoming connections;
the setting lives in **System Settings → Network → Firewall → Options**.
Windows is the `New-NetFirewallRule` line in [§ 4](#windows-wsl2).

---

## 9. Check it works

From the host:

```bash
curl -I http://localhost:5173/                 # 200
curl -i  http://localhost:9010/ghdlsim         # 426 Upgrade Required — correct
```

`426` is the backend saying "this port speaks WebSocket": it means the backend
is up, not that something is broken.

Then from **another machine**, open `http://<host-ip>:5173/`, and load a
design that proves the round trip — `LEDR <= SW;` — press **Start**, and flip
a switch. If the LEDs follow the switches, the page, the backend and GHDL are
all working together. Nothing else tests all three at once.

---

## 10. Troubleshooting

| Symptom | Cause |
|---|---|
| Page loads, board stays dark, console says the backend is unreachable | The backend port isn't open to the client. The page port being open is not enough — see [§ 1](#1-how-it-fits-together) |
| Works on the host, not from other machines | Firewall ([§ 8](#8-open-the-firewall)), or WSL networking ([§ 4](#windows-wsl2)) |
| Board dark only over HTTPS | Mixed content — [§ 6](#6-one-port-with-a-reverse-proxy) |
| `ghdl not found on PATH` | GHDL isn't installed, or isn't on the service user's `PATH` — set `GHDL_EXE` to its absolute path |
| `EADDRINUSE` | Something already holds the port: `ss -ltnp \| grep 9010`, or an earlier run — `./scripts/stop.sh` |
| `Too many concurrent sessions` | The `GHDL_MAX_SESSIONS` cap; raise it if the hardware can take it |
| Simulation stops after 60 s | A batch run hit its timeout — usually a process with no `wait`, not a hosting problem |
| Page is stale after `git pull` | Rebuild: `npm run build`, and restart the backend. `start.sh` rebuilds the backend for you, not a production `dist/` |

Logs: `.run/backend.log` and `.run/frontend.log` under `scripts/start.sh`,
`journalctl -u hdlboard` under systemd, `rc-service hdlboard status` under
OpenRC.

---

## See also

- [`BUILDING.md`](BUILDING.md) — building from source and the dev workflow
- [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) — the backend's
  wire protocol, session model and limits
- [`Design_Description.md`](Design_Description.md) — the board components and
  known limitations
