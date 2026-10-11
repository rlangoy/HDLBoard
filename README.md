# HDLBoard — Write VHDL or Verilog. Watch it light up.

[![Try Online](https://img.shields.io/badge/Try%20Online-brightgreen)](https://hdlboard.onrender.com/)
[![GitHub Release](https://img.shields.io/github/v/release/rlangoy/HDLBoard)](https://github.com/rlangoy/HDLBoard/releases)
[![License: GPL-2.0](https://img.shields.io/badge/License-GPL--2.0-blue.svg)](LICENSE)

**Write VHDL or Verilog, then flip the switches, press the buttons and see the LEDs and 7-segment displays respond — on a virtual DE1-SoC FPGA board, driven by your own design.**

Plenty of tools let you type HDL in a browser. HDLBoard lets you *play with* what you wrote. The board updates while the simulation is running: every time you flip a switch or press a button, your design gets the new input. No FPGA board, cable or vendor toolchain is needed. Behind the board are real simulators, [GHDL](https://github.com/ghdl/ghdl) for VHDL and [Icarus Verilog](https://github.com/steveicarus/iverilog) for Verilog, not a JavaScript approximation.

**[▶ Try it online](https://hdlboard.onrender.com/)** · **[⬇ Download for Windows](https://github.com/rlangoy/HDLBoard/releases)** · **[Host it yourself](docs/HOSTING.md)**

![HDLBoard running a Verilog design: the simulation card and file list on the left, the editor in the middle, and the virtual DE1-SoC board on the right; four switches are up and their LEDs are lit.](docs/images/workbench.png)

## Who it is for

HDLBoard was built for students taking their first steps into digital logic and FPGA design, and for the teachers who run those labs. It also suits hobbyists who want to try VHDL or Verilog before buying a board. It covers the step between "my code compiles" and "my code does what I meant": students see their design working first, before they deal with synthesis, pin assignments and timing analysis.

## Try it in one minute

1. Open the [online version](https://hdlboard.onrender.com/) or start the Windows app.
2. The starter design already connects the switches to the LEDs:

   ```vhdl
   LEDR <= SW;
   ```

3. Press **Start**, then flip a few switches on the board. The matching LEDs light up.
4. Edit the line, for example to `LEDR <= not SW;` or `LEDR(0) <= SW(0) and SW(1);`, and start again.

The port names are the board's own pin names (`SW`, `KEY_N`, `LEDR`, `HEX0_N` … `HEX5_N`, `CLOCK_50`). That makes a design written here a good starting point for Quartus and the real DE1-SoC. Every port is optional, so a first lab can declare only `SW` and `LEDR`.

## Features

### An interactive virtual board
- 10 slide switches, 4 pushbuttons, 10 red LEDs and six 7-segment displays, modelled on the Terasic DE1-SoC.
- Inputs go to the simulation while it runs, and the design's outputs drive the board.
- **Real-time pacing:** simulated time follows the clock on your wall, so an LED meant to blink once a second blinks once a second.

### Real simulation, readable errors
- **VHDL** runs on GHDL (VHDL-2008). **Verilog** runs on Icarus Verilog.
- The simulator's own messages, including testbench `report`/`assert` and `$display` output, appear live in the console.
- Errors are marked on the source line in the editor, with a short explanation of the likely cause.

### Testbenches side by side

![A VHDL testbench in the left pane and the design it drives in the right pane, with the testbench's truth-table report in the console below.](docs/images/testbench.png)

When you open a testbench, the editor splits: the testbench is on the left and the design it drives is on the right. Each pane has its own Play button.

### A small, focused editor
- Syntax highlighting for VHDL and Verilog, one file list with upload and drag-and-drop, and resizable panes.
- Download a single file, or the whole project as a ZIP.

### Projects and sharing
- A `.hdlboard.json` project file holds the project's name, board and files, with a description for each file.
- Open a project from a file on your computer, a web address, a GitHub Gist or a `?project=` link. You can send that link to a class so everyone starts from the same exercise.
- **Save to GitHub:** sign in once, and each project is kept in a secret Gist on your own account. You can open, update and delete it from any computer, and HDLBoard checks before overwriting changes made somewhere else.

How to: [PROJECTS.md](docs/PROJECTS.md) · [GITHUB.md](docs/GITHUB.md)

## Get started

| Option | Best for | How |
|---|---|---|
| **Online** | Trying it out, with nothing to install | [hdlboard.onrender.com](https://hdlboard.onrender.com/) |
| **Windows app** | Working offline on your own PC; GHDL and Icarus Verilog are included | [Releases page](https://github.com/rlangoy/HDLBoard/releases) |
| **Self-hosted** | A classroom, lab or personal server (Docker on Linux, macOS or Windows/WSL) | [HOSTING.md](docs/HOSTING.md) |
| **From source** | Development and contributing | [BUILDING.md](docs/BUILDING.md) |

**Windows note:** the installer is not code-signed, so Windows SmartScreen will show a warning. Choose **More info → Run anyway**. Since version 1.2.4, the installer has been built by GitHub Actions directly from this repository.

## What HDLBoard is not

HDLBoard is a learning and simulation tool, not a replacement for an FPGA toolchain.

- It does **not** do synthesis, place-and-route, timing analysis or bitstream generation. To run on real hardware, use Quartus: add pin assignments and build there.
- Only the **DE1-SoC** board is modelled, with its switches, keys, LEDs and 7-segment displays.
- A design that divides the real 50 MHz `CLOCK_50` down to a visible blink needs millions of simulated cycles, which is too slow to watch. For blinking and counting designs, declare the simulator-only `CLOCK_500Hz` port instead, and remove it before you build for the real board. See [Design_Description.md § 10](docs/Design_Description.md).
- Work is not saved automatically. Save the project to a folder, download a ZIP or save to GitHub before you close the page.

## Documentation

- [BUILDING.md](docs/BUILDING.md) — build from source, run the dev server, package the Windows app
- [HOSTING.md](docs/HOSTING.md) — self-host with Docker on Linux, macOS or Windows (WSL)
- [PROJECTS.md](docs/PROJECTS.md) — create, open, edit, save and publish projects
- [GITHUB.md](docs/GITHUB.md) — GitHub sign-in, Gist storage, syncing, and OAuth App settings for hosts
- [Design_Description.md](docs/Design_Description.md) — how the board components are built, features and known limitations
- [ghdl_implementation_plan.md](docs/ghdl_implementation_plan.md) — how the GHDL backend works
- [Verilog_implementation_plan.md](docs/Verilog_implementation_plan.md) — how the Icarus Verilog backend works
- [Impl_project_file_and_online_storage.md](docs/Impl_project_file_and_online_storage.md) — the `.hdlboard.json` project format
- [winInstaller/README.md](winInstaller/README.md) — the Windows desktop build

## Support and contributing

- **Found a bug or have an idea?** [Open an issue](https://github.com/rlangoy/HDLBoard/issues). Please include the HDL file and the console output if you can.
- **Want to contribute?** Pull requests are welcome, whether they are fixes, features or example designs for teaching. Start with [BUILDING.md](docs/BUILDING.md).
- Feedback from students and teachers who use HDLBoard in a course is especially valuable.

## Background

HDLBoard was created for **PB1180 Programmerbare logiske kretser** at the University of South-Eastern Norway (USN). The course is taught in VHDL. Verilog support was added later so that people outside the course could use HDLBoard too.

## Credits

HDLBoard builds on the work of many open-source projects. Thank you to all of them and their contributors.

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

DE1-SoC is a product of [Terasic Technologies](https://www.terasic.com.tw/). HDLBoard is an independent teaching tool and is not affiliated with or endorsed by Terasic.

## License

HDLBoard is licensed under the [GNU General Public License v2.0](LICENSE).
