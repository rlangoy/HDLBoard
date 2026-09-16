# DE1-SoC VHDL Workbench

A browser-based VHDL "IDE" shell for the DE1-SoC board — a file tree, a
tabbed syntax-highlighted editor, Start/Stop simulation controls, a
GHDL-style console, and a pixel-accurate, fully interactive mock of the
board's switches, LEDs, pushbuttons and 7-segment displays.

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

This project is a **demo/teaching front end**, not a VHDL toolchain. It
reproduces the workbench layout below in the browser, wires the board panels
to live React state, and plays a scripted console sequence when you hit
**Start Simulation** — there is no compiler behind it (see
[Known limitations](#known-limitations)).

Every board part — switch, LED, pushbutton, 7-segment digit — is drawn in
pure CSS from pixel measurements of the reference hardware renders; nothing
is an image, an SVG, or a canvas drawing. See
[`Design_Description.md`](Design_Description.md) for exactly how, and why.

## Features

- **File explorer** — a `vhdl/` / `work/` project tree with upload
  (reads real `.vhd`/`.vhdl` files via the File API) and new-file actions.
- **Tabbed code editor** — closable tabs, line numbers, and VHDL syntax
  highlighting (keywords, types, comments, strings, numbers), built on a
  real, editable `<textarea>` — not a static preview.
- **Simulation controls** — Start/Stop driving a timestamped, scripted GHDL
  compile → elaborate → run sequence in the console panel.
- **Live DE1-SoC board mock** — `SW[9:0]`, `LEDR[9:0]`, `KEY[3:0]` and
  `HEX[5:0]`, wired the way a real design would be
  (`LEDR <= SW;`, `HEX` decoded from `SW` through the course's `hex7seg`
  table). Switches and pushbuttons are genuinely clickable.
- **Component gallery** — every board part in every state, side by side
  with the reference renders, at the `#gallery` route.

## Prerequisites

- **Node.js 18+** (20+ recommended) and **npm**
- No global tooling, no external services — everything runs locally

## Installation

```bash
cd de1socSim
npm install
```

This installs React 18, Vite 5, TypeScript, and (for the optional
screenshot helper) Playwright — no other runtime dependencies.

## Running it

**Development**, with hot reload, on the default Vite port:

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

Either way, the **Workbench** is the page you land on. The original
per-component gallery is at the `#gallery` hash, e.g.
`http://localhost:5173/#gallery`.

## Available scripts

| Script              | What it does                                                           |
|----------------------|-------------------------------------------------------------------------|
| `npm run dev`        | Start the Vite dev server with hot module reload.                      |
| `npm run build`      | Type-check (`tsc -b`) and produce a production build in `dist/`.       |
| `npm run preview`    | Serve the last `dist/` build (add `--port <n> --host` to customise).   |
| `npm run typecheck`  | Type-check only, no emit — the fast CI-style check.                    |
| `npm run shot`       | Screenshot a selector against `http://localhost:4173` (needs `vite preview` running and Playwright's browser installed via `npx playwright install chromium`). |
| `npm run demo`       | Build, then inline the bundle into one self-contained `Examples/board_demo.html`. |

## Project structure

```
de1socSim/
├─ README.md                    ← this file
├─ Design_Description.md        how the components are built, and why
├─ index.html
├─ package.json
├─ tsconfig*.json
├─ vite.config.ts
├─ tools/
│  ├─ screenshot.mjs            visual check helper (playwright)
│  └─ bundle.mjs                inline a build into one self-contained .html
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
      └─ workbench/              the IDE shell — see its own README below
```

## Documentation

- **[`Design_Description.md`](Design_Description.md)** — how every board
  component is built: the measured reference geometry, the design mandate,
  and the conventions every panel follows.
- **[`src/components/workbench/README.md`](src/components/workbench/README.md)**
  — how the Workbench page itself is put together: its component API, the
  mock simulation sequence, and the editor's syntax-highlighting overlay.

## Known limitations

- **No real GHDL, compiler, or file system.** Start/Stop plays a scripted
  console sequence; uploaded files are read into memory only.
- **No persistence.** Reloading the page resets everything to the starter
  project.
- Full details in
  [`src/components/workbench/README.md`](src/components/workbench/README.md#known-limitations).

## About

Built for **PB1180 Programmerbare logiske kretser** at USN — a browser
mock of the DE1-SoC board so students can see `LEDR <= SW;` and similar
constructs behave the way the real board would, without needing hardware in
hand.

No license has been specified yet — add one before distributing this
outside the course.
