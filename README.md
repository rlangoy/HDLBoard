# DE1-SoC VHDL Workbench

A browser-based VHDL IDE and simulator for the DE1-SoC board — a file tree,
a tabbed syntax-highlighted editor, Start/Stop simulation controls, a real
GHDL console, and a pixel-accurate, fully interactive rendering of the
board's switches, LEDs, pushbuttons and 7-segment displays, driven by an
actual GHDL simulation of whatever VHDL is open in the editor.

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white&labelColor=20232A)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white&labelColor=20232A)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white&labelColor=20232A)
![No runtime deps beyond React](https://img.shields.io/badge/dependencies-React%20only-4c1)

---

## Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running it](#running-it)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Known limitations](#known-limitations)
- [About](#about)

## Overview

Edit VHDL in the browser, click **Start**, and the board reacts the way the
real hardware would — because it is a real GHDL simulation, not an
approximation. A small Node.js backend (`server/`) analyzes and elaborates
your project once, then keeps **one GHDL process running continuously**
for the rest of the session — not restarted per switch flip — polling for
switch/button changes and pushing the resulting `LEDR`/`HEX` state back
over a WebSocket as they happen. See
[`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) § 5 for why
that design was chosen over re-simulating from scratch on every input, and
[Known limitations](#known-limitations) for what it doesn't do.

Every board part — switch, LED, pushbutton, 7-segment digit — is drawn in
pure CSS from pixel measurements of the reference hardware renders; nothing
is an image, an SVG, or a canvas drawing. See
[`Design_Description.md`](Design_Description.md) for exactly how, and why.

## Features

- **File explorer** — a `vhdl/` / `work/` project tree with upload (a
  picker, or drag-and-drop `.vhd`/`.vhdl` files straight onto the panel),
  new-file, rename, and delete actions (the last two on hover, or
  double-click a name to rename).
- **Resizable panes** — drag the handles either side of the editor to
  resize the file panel and the board panel; both stay within the browser
  window as you resize, shrinking together (or giving way to whichever one
  you're actively dragging) rather than overflowing it.
- **Tabbed code editor** — closable tabs, line numbers, and VHDL syntax
  highlighting (keywords, types, comments, strings, numbers), built on a
  real, editable `<textarea>` — not a static preview.
- **Simulation controls** — Start/Stop drives a real `ghdl -a`/`-e`/`-r`
  compile → elaborate → run sequence, with GHDL's own output (or error
  text, file:line included) in the console panel.
- **Live DE1-SoC board** — `SW[9:0]` and `KEY[3:0]` are genuinely
  clickable inputs; `LEDR[9:0]` and `HEX[5:0]` are driven by GHDL actually
  simulating your VHDL, not mirrored from the switches. See
  [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) § 6 for the
  wire protocol between the two.
- **Component gallery** — every board part in every state, side by side
  with the reference renders, at the `#gallery` route.

## Prerequisites

| Tool | Purpose | Minimum |
|---|---|---|
| [GHDL](https://ghdl.github.io/ghdl/) | Compiles and simulates the VHDL | Any version supporting `--std=08` and `-g<name>=<value>` generic overrides (verified against 5.0.1, mcode) |
| [Node.js](https://nodejs.org/) + npm | Runs the frontend build and the backend | Node 18+ (20+ recommended) |

No other global tooling, no external services — everything, including the
backend, runs entirely on your machine or LAN; nothing leaves it.

<details open>
<summary><b>Installing GHDL — Ubuntu / Debian</b></summary>

```bash
sudo apt update
sudo apt install ghdl
```
</details>

<details>
<summary><b>Installing GHDL — Fedora</b></summary>

```bash
sudo dnf install ghdl
```
</details>

<details>
<summary><b>Installing GHDL — macOS (Homebrew)</b></summary>

```bash
brew install ghdl
```
</details>

<details>
<summary><b>Installing GHDL — Windows</b></summary>

Use [WSL2](https://learn.microsoft.com/windows/wsl/install) with Ubuntu and
follow the Ubuntu instructions above (recommended — `start.sh`/`stop.sh`
assume a POSIX environment), or install a native build from the
[official releases](https://github.com/ghdl/ghdl/releases).
</details>

Verify with `ghdl --version`.

## Installation

```bash
npm install          # frontend
cd server && npm install && npm run build && cd ..   # backend
```

The frontend installs React 18, Vite 5, TypeScript, and (for the optional
screenshot helper) Playwright. The backend (`server/`) is a separate
Node.js project with one runtime dependency, `ws` — it never ships to the
browser, so it doesn't affect the frontend bundle.

## Running it

**Both servers together**, the easiest way to actually use the simulator:

```bash
./start.sh
# ➜  http://localhost:5173/
```

Stop both with `./stop.sh`. Override ports with
`STATIC_PORT=8080 GHDL_WS_PORT=9090 ./start.sh`. Logs land in
`.run/*.log`, PIDs in `.run/*.pid`, so `start.sh` won't double-start and
`stop.sh` won't fail to find a running instance.

**Frontend only**, with hot reload (the board will stay dark — Start has
nothing to talk to without the backend too):

```bash
npm run dev
# ➜  http://localhost:5173/
```

**Production build and preview**, on a specific port (for example, to serve
a demo on `8123`):

```bash
npm run build
npx vite preview --port 8123 --host
# ➜  http://localhost:8123/
```

Whichever way you start it, the **Workbench** is the page you land on. The
original per-component gallery is at the `#gallery` hash, e.g.
`http://localhost:5173/#gallery` — the gallery is a static showcase of the
board components and has no backend of its own.

### Accessing from another device on the LAN

Both servers bind to `0.0.0.0`, so any device on the same network can reach
them via the host machine's IP instead of `localhost`, e.g.
`http://192.168.0.198:5173/`. The backend host is resolved relative to
whatever hostname/IP the page was loaded from, so this needs no
configuration change.

## Available scripts

| Script              | What it does                                                           |
|----------------------|-------------------------------------------------------------------------|
| `npm run dev`        | Start the Vite dev server with hot module reload.                      |
| `npm run build`      | Type-check (`tsc -b`) and produce a production build in `dist/`.       |
| `npm run preview`    | Serve the last `dist/` build (add `--port <n> --host` to customise).   |
| `npm run typecheck`  | Type-check only, no emit — the fast CI-style check.                    |
| `npm run shot`       | Screenshot a selector against `http://localhost:4173` (needs `vite preview` running and Playwright's browser installed via `npx playwright install chromium`). |
| `npm run demo`       | Build, then inline the bundle into one self-contained `Examples/board_demo.html`. |

`server/` is a separate npm project (its own `package.json`), run from
inside `server/`:

| Script                  | What it does                                                   |
|--------------------------|-----------------------------------------------------------------|
| `npm run build`         | Type-check (`tsc -b`) and compile to `dist/`.                   |
| `npm start`             | Run the built backend (`node dist/server.js`).                  |
| `npm run dev`           | Build then run, in one step.                                    |
| `npm run typecheck`     | Type-check only, no emit.                                       |

`./start.sh`/`./stop.sh` at the repo root run both projects together and
are the easiest way to actually use the simulator — see
[Running it](#running-it).

## Project structure

```
de1socSim/
├─ README.md                    ← this file
├─ Design_Description.md        how the components are built, and why
├─ ghdl_implementation_plan.md  how the GHDL backend is built, and why
├─ start.sh / stop.sh           run both servers as a pair
├─ index.html
├─ package.json
├─ tsconfig*.json
├─ vite.config.ts
├─ tools/
│  ├─ screenshot.mjs            visual check helper (playwright)
│  └─ bundle.mjs                inline a build into one self-contained .html
├─ server/                      the GHDL backend — its own Node.js project
│  └─ src/                      protocol, session, GHDL process management
└─ src/
   ├─ main.tsx
   ├─ index.css
   ├─ App.tsx                   entry point: Workbench, or the gallery at #gallery
   ├─ ComponentGallery.tsx       every component/state, for visual verification
   └─ components/
      ├─ board/                 shared card chrome, grid layout, bit helpers
      ├─ Switches/               SW[9:0]
      ├─ Leds/                   LEDR[9:0]
      ├─ Pushbuttons/            KEY[3:0]
      ├─ SevenSegment/           HEX[5:0]
      └─ workbench/              the IDE shell, including ghdlClient.ts —
                                  see its own README below
```

## Documentation

- **[`Design_Description.md`](Design_Description.md)** — how every board
  component is built: the measured reference geometry, the design mandate,
  and the conventions every panel follows.
- **[`ghdl_implementation_plan.md`](ghdl_implementation_plan.md)** — how
  the GHDL backend is built: the wire protocol, the simulation strategy
  and why it was chosen, the generated testbench, and what was actually
  verified rather than assumed.
- **[`src/components/workbench/README.md`](src/components/workbench/README.md)**
  — how the Workbench page itself is put together: its component API,
  `ghdlClient.ts`, and the editor's syntax-highlighting overlay.

## Known limitations

- **No file system on disk.** Uploaded files and edits are read into
  memory only, on both ends — nothing is written to your filesystem
  beyond a per-session temp directory on the backend, deleted when you
  close the tab.
- **No persistence.** Reloading the page resets everything to the starter
  project; a closed tab ends the simulation session.
- **A clock-rate limit, not a bug.** A design that divides a real 50 MHz
  clock down the honest way (e.g. to blink an LED once a second) needs
  millions of simulated cycles for one visible change — interactive mode
  is fast for combinational and small-sequential designs, and currently
  impractical for a literal hardware-accurate clock divider. See
  [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) § 5.5.
- Full details in
  [`src/components/workbench/README.md`](src/components/workbench/README.md#known-limitations).

## About

Built for **PB1180 Programmerbare logiske kretser** at USN — a browser
simulator for the DE1-SoC board, backed by real GHDL, so students can see
`LEDR <= SW;` and similar constructs actually behave the way the real
board would, without needing hardware in hand.

No license has been specified yet — add one before distributing this
outside the course.
