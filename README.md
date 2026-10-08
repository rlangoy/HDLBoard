# HDLBoard - Write VHDL or Verilog and watch it run [![Try Online](https://img.shields.io/badge/Try%20Online-brightgreen)](https://hdlboard.onrender.com/)

Write VHDL or Verilog and watch it run on a virtual board — flip switches, light LEDs, see it work. Built on GHDL (VHDL) and Icarus Verilog (Verilog), it's designed to give beginning students a simple first step into FPGA design before tackling timing analysis and beyond. Runs standalone on Windows or hosted in a browser.
![HDLBoard running DE1_SoC.v, a Verilog design, under Icarus Verilog: the Simulation card and Files panel on the left, the editor with the DE1-SoC module in the middle, the board's LEDs, 7-segment displays, switches and pushbuttons on the right, and Icarus Verilog's banner in the console; four switches are up and their LEDs are lit.](docs/images/workbench.png)

## Features

- **Real simulation** — your VHDL runs on [GHDL](https://github.com/ghdl/ghdl) and your Verilog on [Icarus Verilog](https://github.com/steveicarus/iverilog), not an approximation; the simulator's own output and errors (file:line included) appear in the console. Drop a `.v` file, mark it as top, and Start runs the Verilog engine.
- **A live DE1-SoC board** — clickable switches and pushbuttons, with LEDs and 7-segment displays driven by the simulation.
- **A small IDE** — one file list with upload and drag-and-drop, an editor with no tabs to tidy (click a file, or its name above the code, to switch; VHDL and Verilog syntax highlighting), resizable panes.
- **Testbenc support** — in VHDL or Verilog prints its messages live in the console. Open a design or a testbench and the editor splits: testbench on the left, the design it drives on the right, each at its own code; Play in a pane runs that pane's unit.
- **Project files** — a `.hdlboard.json` project file names the project, its board and its files, each with a description. Upload it together with its files (or a `.zip` that Download All saved) to open the whole project; files with a URL, such as a GitHub gist, are downloaded. New File › Project makes one from the files you have, and the project page edits it. `?project=<url>` opens a published project.
- **Real-time pacing** — simulated time tracks real time, so a design's timing here predicts its timing on the board.

## Installing

**Windows App** — download the installer from the
[Releases page](https://github.com/rlangoy/HDLBoard/releases) and run it.<br>
The installer is not code-signed, so Windows SmartScreen will show a warning: choose **More info → Run anyway**. <br>
&nbsp;&nbsp;&nbsp; (Starting with version **1.2.4**, the Windows installer is built automatically using **GitHub Actions**.) <br> 

**Web Hosting** — host HDLBoard yourself and open it in a browser.<br>
Requirements and step-by-step installation: [**HOSTING.md**](docs/HOSTING.md).

## Compiling

Building from source, running the dev server, and producing the Windows
installer are covered in [**BUILDING.md**](docs/BUILDING.md).

## Documentation

- [`BUILDING.md`](docs/BUILDING.md) — compile, run and package
- [`HOSTING.md`](docs/HOSTING.md) — host it yourself using Docker,Linux, macOS or Windows (WSL)
- [`Design_Description.md`](docs/Design_Description.md) — how the board components are built, plus features and known limitations
- [`ghdl_implementation_plan.md`](docs/ghdl_implementation_plan.md) — how the GHDL backend works
- [`Verilog_implementation_plan.md`](docs/Verilog_implementation_plan.md) — how the Verilog backend (Icarus Verilog) works: research, design, tests and what was built
- [`Impl_project_file_and_online_storage.md`](docs/Impl_project_file_and_online_storage.md) — the project file format (`.hdlboard.json`); this build implements opening, editing and saving it (§ 4–8), not the online storage
- [`winInstaller/README.md`](winInstaller/README.md) — the Windows desktop build

## About

Built for **PB1180 Programmerbare logiske kretser** at USN — a browser
simulator for the DE1-SoC board, backed by real GHDL and Icarus Verilog, so students can see
`LEDR <= SW;` and similar constructs actually behave the way the real
board would, without needing hardware in hand.
The Verilog support was added just for others since the frontend of the simulator was already inplace.

## Credits

HDLBoard stands on the work of others. Thank you to all of these projects and their contributors:

| Component | Used for | License |
|---|---|---|
| [GHDL](https://github.com/ghdl/ghdl) | Analyses, elaborates and simulates VHDL | GPL-2.0 |
| [Icarus Verilog](https://github.com/steveicarus/iverilog) | Compiles and simulates Verilog. The Windows build uses the [MSYS2](https://www.msys2.org/) packages, with GNU Readline, zlib, bzip2, termcap, winpthreads and the GCC runtime | GPL-2.0-or-later (Readline GPL-3.0-or-later; GCC runtime with the Runtime Library Exception) |
| [React](https://react.dev/) | The user interface | MIT |
| [ws](https://github.com/websockets/ws) | The WebSocket link between browser and simulator | MIT |
| [Electron](https://www.electronjs.org/) (with Chromium and Node.js) | The Windows desktop app | MIT (Chromium: BSD-style) |
| [electron-builder](https://www.electron.build/) and [NSIS](https://nsis.sourceforge.io/) | The Windows installer | MIT; zlib/libpng-style |
| [Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/), [esbuild](https://esbuild.github.io/), [Vitest](https://vitest.dev/), [ESLint](https://eslint.org/) | Building and testing | MIT, Apache-2.0 |

The license texts of the bundled simulators are installed with the Windows app and shown by its installer.
DE1-SoC is a product of [Terasic Technologies](https://www.terasic.com.tw/); HDLBoard is an independent
teaching tool and is not affiliated with or endorsed by Terasic.

## License

Licensed under the [GNU General Public License v2.0](LICENSE).
