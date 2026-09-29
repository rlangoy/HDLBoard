# Building HDLBoard from source

This is for developing HDLBoard, or running it in a browser from a checkout.
If you only want to *use* it, the [Windows installer](../README.md#installing)
needs none of this.

## Prerequisites

| Tool | Purpose | Minimum |
|---|---|---|
| [GHDL](https://ghdl.github.io/ghdl/) | Compiles and simulates the VHDL | Anything supporting `--std=08` and `-g<name>=<value>` (verified against 5.0.1, mcode) |
| [Icarus Verilog](https://steveicarus.github.io/iverilog/) | Compiles and simulates Verilog designs (optional: VHDL works without it) | 12.0 or newer (verified against 12.0 and 13.0; `iverilog` and `vvp` on `PATH`) |
| [Node.js](https://nodejs.org/) + npm | Frontend build and the backend | Node 18+ (20+ recommended) |

Nothing else, and no external services: the backend runs on your machine or
LAN and nothing leaves it.

Install Node.js from [nodejs.org](https://nodejs.org/). GHDL you can leave to
`scripts/start.sh`, which installs it on first run — so on Linux and macOS you
can skip ahead to [Install and run](#install-and-run). To install it yourself
instead, or if your platform isn't one the script covers, use the command for
your platform and check it with `ghdl --version`:

| Platform | Command |
|---|---|
| Ubuntu / Debian | `sudo apt install ghdl` |
| Fedora | `sudo dnf install ghdl` |
| macOS | `brew install ghdl` |
| Icarus Verilog (optional) | `sudo apt install iverilog` · `sudo dnf install iverilog` · `brew install icarus-verilog` · `apk add iverilog` |
| Windows | Use [WSL2](https://learn.microsoft.com/windows/wsl/install) with Ubuntu (recommended — `scripts/start.sh`/`scripts/stop.sh` assume POSIX), or a native build from the [GHDL releases](https://github.com/ghdl/ghdl/releases) |

## Install and run

```bash
./scripts/start.sh        # both servers  ➜  http://localhost:5173/
./scripts/stop.sh         # stop them
```

Before starting anything, `start.sh` makes sure the prerequisites are there:

- **GHDL** — if it isn't on `PATH`, the script prints the install command for
  your package manager (`apt-get`, `dnf`, `pacman`, `zypper`, `apk` or `brew`,
  with `sudo` where needed) and asks before running it.
- **Icarus Verilog** — for Verilog designs; the same package-manager ladder, but a
  missing or declined install only warns, since VHDL runs without it.
- **npm dependencies** — runs `npm install` in the repository root and in
  `server/` when `node_modules` is missing, or when a `package.json` /
  `package-lock.json` is newer than it, which is what a `git pull` leaves
  behind.
- **The backend build** — rebuilds `server/dist/` when it's missing or older
  than `server/src/`.

All of it is idempotent, so a second run just confirms and starts. Node.js is
the exception: npm is what installs everything else, so the script only checks
for Node 18+ and points at [nodejs.org](https://nodejs.org/) if it's missing or
too old.

Two environment variables adjust that behaviour:

| Variable | Effect |
|---|---|
| `HDLBOARD_SKIP_INSTALL=1` | Check only — report anything missing and exit instead of installing |
| `HDLBOARD_ASSUME_YES=1` | Don't prompt before installing GHDL or Icarus Verilog (needed for non-interactive runs, which otherwise refuse) |

Doing it by hand instead is still just the two npm projects:

```bash
npm install                                              # frontend
cd server && npm install && npm run build && cd ..       # backend
```

`scripts/start.sh` honours `STATIC_PORT` and `HDL_WS_PORT`
(`STATIC_PORT=8080 HDL_WS_PORT=9090 ./scripts/start.sh`). Logs land in `.run/*.log`
and PIDs in `.run/*.pid`, so it won't double-start.

Frontend only, with hot reload (the board stays dark — Start needs the
backend):

```bash
npm run dev
```

A production build on a specific port:

```bash
npm run build
npx vite preview --port 8123 --host
```

The page you land on is the workbench. The static component gallery is at the
`#gallery` hash, e.g. `http://localhost:5173/#gallery`.

Both servers bind to `0.0.0.0`, so another device on the network can open
`http://<host-ip>:5173/` with no configuration change.

## Scripts

Root project:

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build into `dist/` |
| `npm run preview` | Serve the last `dist/` build |
| `npm run typecheck` | Type-check only |
| `npm test` | Frontend unit tests (vitest): file routing rules, console cap, the RUN frame, the starter-file guard |
| `npm run demo` | Build, then inline into one self-contained `Examples/board_demo.html` (the folder is created on demand and gitignored) |

`server/` is a separate npm project, run from inside `server/`:

| Script | What it does |
|---|---|
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the built backend (`node dist/server.js`) |
| `npm run dev` | Build, then run |
| `npm run typecheck` | Type-check only |
| `npm test` | Unit tests (`node:test`); need neither GHDL nor Icarus |
| `npm run test:integration` | Integration tests against the real simulators (GHDL and Icarus; each skips itself if its simulator is missing) |
| `npm run lint` | The scoped clean-code rules (function length, parameters, complexity, nesting) on the newer modules |

To check a running backend end to end, in both languages:
`node tools/verify-backend.mjs ws://localhost:9010/hdlsim` (needs `npm install` in `server/`).
The browser check is the runbook `tests/e2e/verilog-browser.md`.

## Building the Windows installer

On Windows with Node 18+, from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File winInstaller\build.ps1
```

`-ExecutionPolicy Bypass` avoids the "running scripts is disabled" error;
where scripts are allowed, plain `winInstaller\build.ps1` does the same. Close
a running HDLBoard first — it locks files the build overwrites.

The script fetches and checksum-verifies GHDL and Icarus Verilog, smoke-tests
the Icarus tree (`verify-iverilog.ps1`, which fails the build if it cannot
compile and run the fixtures), builds the frontend and the backend, bundles
them with Electron, and writes
`winInstaller\output\HDLBoard-Setup-<version>.exe`. Details:
[`winInstaller/README.md`](../winInstaller/README.md).

## Project structure and design docs

- [`HOSTING.md`](HOSTING.md) — running it as a server other people reach in a
  browser: requirements, per-platform setup, ports, firewall and hardening.
- [`Design_Description.md`](Design_Description.md) — how the board components
  are built and why; § 11 has the current repository layout.
- [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) — the GHDL
  backend: wire protocol, simulation strategy, generated testbench.
- [`Verilog_implementation_plan.md`](Verilog_implementation_plan.md) — the
  Icarus Verilog engine: research, design, test strategy and what was built.
- [`src/components/workbench/README.md`](../src/components/workbench/README.md)
  — how the workbench page itself is put together.
