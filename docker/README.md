# Docker — host HDLBoard in containers

The container counterpart of [`scripts/alpineInstall.sh`](../scripts/alpineInstall.sh).
It sets up the same pieces: GHDL (mcode, built from source) and Icarus Verilog
behind the Node backend, with nginx serving the page. It runs on any Linux host
with Docker, and on Windows or macOS with Docker Desktop.

```
   browser                  host
  ┌─────────┐  HTTP + WS  ┌───────────────────────────────────────────────┐
  │  page   │ ──:80─────> │ web (nginx)  ── /hdlsim ──────> backend:9010 │
  │  board  │             │  dist/                        node + hdl      │
  └─────────┘             └───────────────────────────────────────────────┘
```

Only **one port** is published. nginx serves the page and proxies the
WebSocket, which is the setup described in [HOSTING.md § 8](../docs/HOSTING.md#8-one-port-with-a-reverse-proxy).
The backend is reachable only on the compose network. Unlike the bare-metal
install, no second port has to be opened to students.

## Run it

From the repository root:

```sh
docker compose up -d --build     # first build: a few minutes (GHDL compiles)
docker compose ps                # wait for both services to be "healthy"
```

Then open `http://<host>/`.

Stop and start it again (from the same folder):

```sh
docker compose stop      # stop both containers
docker compose start     # start them again, no rebuild
```

The build fails if the `hdlboard` account inside the image cannot analyse,
elaborate and run a VHDL and a Verilog design. These are the
same probes as step 8 of the Alpine installer. To run the full scenario check
from [HOSTING.md § 11](../docs/HOSTING.md#11-check-it-works) against the live backend:

```sh
docker compose exec backend node tools/verify-backend.mjs
```

## Day to day

| Task | Command |
|---|---|
| Backend output | `docker compose logs -f backend` |
| Restart | `docker compose restart backend` |
| Update to the latest checkout | `git pull && docker compose up -d --build` |
| Stop and remove | `docker compose down` |
| Rebuild GHDL too | `docker compose build --no-cache backend` |

`restart: unless-stopped` brings both services back after a reboot, as long as
the Docker daemon starts at boot. On Alpine that means
`rc-update add docker boot`, and on systemd hosts `systemctl enable docker`.

## Settings

Put these in a `.env` file next to `docker-compose.yml`. All of them are optional.

| Variable | Default | Effect |
|---|---|---|
| `HDLBOARD_PAGE_PORT` | `80` | Host port for the page **and** the WebSocket. It is baked into the page, so rebuild after changing it (`up -d --build`) |
| `HDL_MAX_SESSIONS` | `32` | Concurrent simulations before new ones are refused (the older name `GHDL_MAX_SESSIONS` is still read) |
| `GHDL_REF` | `master` | GHDL branch or tag to build, for example `v6.0.0` for a pinned release |
| `ALPINE_VERSION` | `3.24` | Base image for the build and backend stages |

The internal backend port (9010) never has to change, because it isn't
published.

## Notes

- **Security.** Anyone who can load the page can compile and run code in the
  backend container. The container runs as a non-root user with a read-only
  root filesystem, no capabilities and a PID limit. Keep it on a trusted
  network anyway, as described in [HOSTING.md § 3](../docs/HOSTING.md#3-read-this-before-you-expose-it).
  To cap CPU and memory on a shared server, uncomment `cpus` and `mem_limit`
  in `docker-compose.yml`. Budget roughly 1 core and 150 MB per active
  simulation.
- **HTTPS.** HTTPS does not work as shipped, for the same reason given in
  [HOSTING.md § 8](../docs/HOSTING.md#8-one-port-with-a-reverse-proxy): the page
  always opens `ws://`.
- **Architecture.** The Alpine GHDL build is verified on x86_64 only.
