# HDLBoard – plugin structure

> Overview, last updated 2026-10-16. Status: **design** – nothing implemented yet.

A **plugin** is a virtual device that a student's design talks to, for example a serial terminal on a UART line. In HDLBoard a plugin is:

- **VHDL code only** – a behavioural model in the library `hdlboard`, shipped with HDLBoard. There is no plugin config file; settings such as the baud rate are VHDL generics with defaults.
- **Visible in the GUI** through stdout lines starting with `@@HDLB`, each with a timestamp in simulated time since the start of the run. The GUI widget for the plugin type turns them into a view (e.g. the received text).

## Testbench-driven or real-time

A plugin can be used in two ways:

| | Testbench-driven (batch) | Real-time (board) |
|---|---|---|
| Who instantiates the plugin | The student's testbench, explicitly | `hdl_board_tb`, automatically via the port name |
| Clock and baud | No limit: 50 MHz and 115200 baud work fine, and the run finishes in under a second | `CLOCK_500Hz` gives at most ≈ 50 baud; `CLOCK_50` runs at ≈ 0.0015× real time |
| Data loss | No – stdout is ordered and lossless | Design → GUI: none (same stdout path). GUI → design: requires a stream channel |
| Changes to `tbTemplate`, `extraPorts` and pacing | None | Yes |
| Repeatable (same result every run) | Yes | No – depends on the user's input |
| Pedagogy | Teaches the monitor/BFM pattern used in verification | Interactive demo |

**Order:** testbench-driven first, starting with a UART receive monitor. Real-time comes last and is only a draft.

## Plugins

| Plugin id | Bus | Status |
|---|---|---|
| `rs232` | UART receive monitor | **first implementation** |
| `i2c` | I2C monitor (open-drain, two lines) | prototype verified, later |
| `spi` | SPI monitor (modes 0–3, 1–32 bit words) | prototype verified, later |
| `onewire` | 1-Wire monitor (standard speed) | prototype verified, later |

The structure was checked against I2C, SPI and 1-Wire with prototype monitors run in GHDL; it carries them without changes to the line protocol (batch plan, section 3.7). Active device models (an EEPROM, a temperature sensor) fit the same way as explicitly instantiated VHDL entities.

A real course project (a SAP-1 CPU on a Mojo board) was also reviewed. It has no plugin system, but it confirmed three assumptions: tri-state buses need the same resolved-signal handling as open-drain lines, a front-panel port can load a design's memory, and a silent testbench needs something that prints its state (batch plan, section 3.8).

## Enabling and disabling

Every plugin can be switched on and off from HDLBoard (Settings, section Plugins). A disabled plugin behaves as if it were not installed: its entities are not in the library `hdlboard`, no tab is shown, and its output lines are ordinary console text. A testbench that uses a disabled plugin fails to compile with an explanatory hint. The set is sent to the server before each run. Details: batch plan, section 3.6.

## First-stage user interface

The first implementation has two UI parts; the widget UI for batch simulations comes later.

- **Split console.** After a batch run that used a plugin, the console splits and the second pane lists the raw `@@HDLB` output: simulated-time timestamp, kind, instance, payload. No widgets yet.
- **Plugins page.** A page for editing the plugin VHDL files (there is no plugin config file; settings are generics in the VHDL) and for enabling plugins. It is switched on from the Settings dialog and is off by default. The shipped sources are bundled into the frontend so they are easy to edit; edited copies live in the browser and are sent to the backend with a run. The installed files are never changed.

Details: batch plan, sections 6.4 and 7.0–7.4.

## Documents

| Document | Content | Status |
|---|---|---|
| [`plugin_batch_implementation_plan.md`](plugin_batch_implementation_plan.md) | How testbench-driven plugins work: `@@HDLB` line protocol, timestamp, GHDL flow, server and frontend changes, tests | Proposal, ready to implement |
| [`plugin_board_implementation_draft.md`](plugin_board_implementation_draft.md) | How real-time plugins could work, with open questions (OPEN-n) and known limitations (LIMIT-n) | **Draft** |
| [`impl_files_for_plugins/`](impl_files_for_plugins/README.md) | Reference code: `hdlb_pkg`, `uart_monitor`, example testbenches with expected output, TypeScript proposals with tests, and I2C/SPI/1-Wire prototypes (`feasibility/`) | Verified with GHDL 4.1 |

## Later

- **Tx** (GUI or testbench sends to the design): a VHDL procedure for testbenches; a file channel for real-time. Values the user changes in the GUI while a simulation runs (for example a simulated temperature) need the same channel.
- **Front-panel / program loader:** the GUI sends address–data pairs plus a strobe into a design's memory, as the `ext*` port of a SAP-1 CPU does. Needs the same GUI → design channel as Tx (board draft, OPEN-10); in batch mode the testbench drives the pins itself.
- **Value probe:** a generic plugin that prints a named signal when it changes, for testbenches that otherwise print nothing (batch plan, open question 10).
- **Verilog:** the same `@@HDLB` format via `$display`; language support follows from which plugin files exist (`.vhd`, later `.v`), still without config.
