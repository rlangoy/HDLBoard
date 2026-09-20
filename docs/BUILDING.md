# Building HDLBoard from source

This is for developing HDLBoard, or running it in a browser from a checkout.
If you only want to *use* it, the [Windows installer](../README.md#installing)
needs none of this.

## Prerequisites

| Tool | Purpose | Minimum |
|---|---|---|
| [GHDL](https://ghdl.github.io/ghdl/) | Compiles and simulates the VHDL | Anything supporting `--std=08` and `-g<name>=<value>` (verified against 5.0.1, mcode) |
| [Node.js](https://nodejs.org/) + npm | Frontend build and the backend | Node 18+ (20+ recommended) |

Nothing else, and no external services: the backend runs on your machine or
LAN and nothing leaves it.

Install GHDL, then check with `ghdl --version`:

| Platform | Command |
|---|---|
| Ubuntu / Debian | `sudo apt install ghdl` |
| Fedora | `sudo dnf install ghdl` |
| macOS | `brew install ghdl` |
| Windows | Use [WSL2](https://learn.microsoft.com/windows/wsl/install) with Ubuntu (recommended — `scripts/start.sh`/`scripts/stop.sh` assume POSIX), or a native build from the [GHDL releases](https://github.com/ghdl/ghdl/releases) |

## Install and run

```bash
npm install                                              # frontend
cd server && npm install && npm run build && cd ..       # backend

./scripts/start.sh        # both servers  ➜  http://localhost:5173/
./scripts/stop.sh         # stop them
```

`scripts/start.sh` honours `STATIC_PORT` and `GHDL_WS_PORT`
(`STATIC_PORT=8080 GHDL_WS_PORT=9090 ./scripts/start.sh`). Logs land in `.run/*.log`
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
| `npm run shot` | Screenshot a selector from `vite preview` on port 4173 (needs `npx playwright install chromium`) |
| `npm run demo` | Build, then inline into one self-contained `Examples/board_demo.html` (the folder is created on demand and gitignored) |

`server/` is a separate npm project, run from inside `server/`:

| Script | What it does |
|---|---|
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the built backend (`node dist/server.js`) |
| `npm run dev` | Build, then run |
| `npm run typecheck` | Type-check only |

## Building the Windows installer

On Windows with Node 18+, from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File winInstaller\build.ps1
```

`-ExecutionPolicy Bypass` avoids the "running scripts is disabled" error;
where scripts are allowed, plain `winInstaller\build.ps1` does the same. Close
a running HDLBoard first — it locks files the build overwrites.

The script fetches and checksum-verifies GHDL, builds the frontend and the
backend, bundles them with Electron, and writes
`winInstaller\output\HDLBoard-Setup-<version>.exe`. Details:
[`winInstaller/README.md`](../winInstaller/README.md).

## Project structure and design docs

- [`Design_Description.md`](Design_Description.md) — how the board components
  are built and why; § 11 has the current repository layout.
- [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) — the GHDL
  backend: wire protocol, simulation strategy, generated testbench.
- [`src/components/workbench/README.md`](../src/components/workbench/README.md)
  — how the workbench page itself is put together.
