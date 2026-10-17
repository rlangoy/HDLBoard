# Testbench-driven (batch) plugins – implementation plan

> **Status:** proposal, ready to implement. Last updated 2026-10-16 (revised after review, see section 13; reference design reviewed in 3.8).
> **Stage 1 user interface:** split console with raw plugin output (7.3) and an optional Plugins page for editing the plugin VHDL files (7.4); the widget UI is stage 2 (7.0).
> **Scope:** the first plugin version – a UART receive monitor (`uart_monitor`, plugin id `rs232`) used from the student's own testbench. The structure is also meant for I2C, SPI and 1-Wire (3.7); those come later.
> **Overview:** [`plugin_structure.md`](plugin_structure.md) · **Code:** [`impl_files_for_plugins/`](impl_files_for_plugins/) · **Later:** [`plugin_board_implementation_draft.md`](plugin_board_implementation_draft.md)

---

## 1. Decisions

| # | Decision |
|---|---|
| B1 | VHDL only in the first version. |
| B2 | A plugin is **VHDL code only** – no plugin config file. Settings such as the baud rate are generics with defaults; the student may override them in `generic map`. |
| B3 | The plugin is **testbench-driven**: the student instantiates it explicitly in their own testbench (batch mode). Real-time (board) mode comes last. |
| B4 | The first plugin is a **receive monitor**: it decodes a serial line and the GUI shows the bytes as text. Transmit (Tx) comes later. |
| B5 | Plugins talk to the GUI through **stdout lines that start with `@@HDLB`**, each with a **timestamp relative to the start of the run** (simulated time, not date/time of day). The GUI is updated from these lines. |
| B6 | A plugin line is **one physical line of printable ASCII with bounded length** (3.3). There is no escaping or length framing. |
| B7 | The server is **strict, the plugin validates itself**: a plugin checks its own `name` at time 0 and stops the run with a clear message; the server parser never guesses (3.5). |
| B8 | A run's plugin output belongs to **one run generation**; output from a run that was stopped or replaced is never forwarded (6.1). |
| B9 | Every plugin can be **enabled and disabled from HDLBoard** (3.6). A disabled plugin behaves as if it were not installed. |
| B10 | The structure must also carry **I2C, SPI and 1-Wire** (3.7, feasibility shown with prototypes). **RS232 is implemented first**; nothing in the first implementation may assume a single plugin or a single line per bus. |
| B11 | **Stage 1 UI** (first implementation): after a batch run that used a plugin, the console splits and the raw plugin output (`@@HDLB` lines with simulated-time timestamps) is shown in the second pane (7.3). The batch-simulation UI with widgets is a later stage (7.0). |
| B12 | A **Plugins page** lets the user edit the plugin VHDL files and enable/disable plugins. It is switched on from the Settings dialog and is off by default (7.4). The shipped sources are bundled into the frontend so they are easy to edit; they are sent to the backend with a run, and the installed files are never modified (6.4). |
| B13 | **Clean Code.** The code written for this feature follows the Clean Code conventions of 8.2 so that it is easy and logical to read and understand. |

Out of scope here: real-time mode, Tx, Verilog (see the overview, *Later*).

---

## 2. Background: today's batch flow

- A top entity **without ports** (a testbench) runs in batch mode (`engines/ghdlEngine.ts`, `prepareBatch`): `ghdl -e --std=08 <tb>` then `ghdl -r --std=08 <tb>`, bounded by `BATCH_TIMEOUT_MS` (60 s), stdin closed.
- The simulator's stdout is split into lines (`runtime.ts`, `lineSplitter`; a trailing CR is removed) and passed to `Session.forwardOutputLine`, which sends them through `OutputLimiter` (200 lines/s) as `LOG` frames. The frontend (`hdlClient.ts`, `onLog`) shows them in the console.
- Batch mode does **not** use the board testbench (`hdl_board_tb`), board polling or pacing. None of that is touched by this plan.
- The editor has **no live linting**: diagnostics come only from a run (`editor_diagnostics_implementation_plan.md`, D-list). There is therefore no second source model that could flag `library hdlboard;` before GHDL has seen it.

### 2.1 Supported project layout

What a run uploads is decided by `filesForRun` (`hdlClient.ts`): **all files in the folder of the top file** (`vhdl/` for a VHDL top), plus the top itself if it is a `work/` testbench started from the TB pane. Other `work/` files are not sent.

| Layout | Works with plugins? |
|---|---|
| Design and testbench both in `vhdl/` | yes |
| Design in `vhdl/`, one testbench in `work/` run from the TB pane | yes – the whole `vhdl/` folder is sent with it |
| A `work/` testbench that needs a second `work/` file | no – unchanged limitation, not caused by plugins |

Plugin sources are **not project files**: the shipped ones are part of the HDLBoard installation (section 5), and edited copies (stage 1, 6.4) travel under a reserved `hdlboard/` prefix, so the file-selection contract for student files is unchanged. The integration test (section 9) uses the first two layouts.

---

## 3. Method

### 3.1 Principle

- A plugin is a VHDL entity in the library **`hdlboard`**, shipped with HDLBoard.
- The student **instantiates it** in the testbench, like a monitor/BFM in ordinary verification practice.
- The plugin is a **behavioural model** of the far end of the cable, not FPGA logic. It does not have to be synthesizable, and `wait for` costs almost nothing in simulation.
- The plugin writes **`@@HDLB` lines to stdout**. The server separates them from ordinary output; the GUI widget for the plugin type interprets them and updates its view.
- The `@@` prefix follows the existing `@@FILE …@@` convention of the `RUN` body (`protocol.ts`); the two never meet (one is server → client output, the other client → server input).

### 3.2 Data flow

```
GHDL (ghdl -r <student testbench>)
  ├─ uart_monitor  ── hdlb_emit() ──► stdout: "@@HDLB uart TX 83495 48"
  └─ report/assert ─────────────────► stdout: "tb.vhd:27:5:@1us:(report note): …"
                                          │
                                          ▼  runtime.ts: lineSplitter (one line at a time, live)
Session.forwardOutputLine(line)   [run generation checked first, 6.1]
  └─ routeOutputLine(line)
       ├─ "@@HDLB " + valid header and payload, kind not disabled ──► plugin budget ──► PLUGIN uart TX 83495\n48
       └─ anything else ─────────────────────────► OutputLimiter ──► LOG …
                                          │
                                          ▼  WebSocket (ordered)
hdlClient.ts handleFrame
  ├─ READY  → clear plugin state (new run)
  ├─ PLUGIN → onPlugin(line) → stage 1: row in the plugin pane (7.3)
  │                          → stage 2: plugin registry["uart"] → uart widget, tab "TX"
  └─ LOG    → onLog(text)    → console
```

Verified (GHDL 4.1, Linux): `writeline(output, …)` is **not held back** when stdout is a pipe – in a 1.9 s run the first line arrived after 0.04 s. The GUI therefore updates while the simulation runs, not only at the end. Windows and Docker are still to be verified (section 10).

### 3.3 Line protocol

```
@@HDLB <kind> <instance> <t_ns> <payload>
```

| Field | Content | Rule |
|---|---|---|
| `@@HDLB` | fixed prefix | column 1, followed by one space |
| `<kind>` | plugin type; selects the GUI widget | `[A-Za-z_][A-Za-z0-9_]*`, e.g. `uart` |
| `<instance>` | instance name from the plugin's `name` generic; one GUI tab each | `[A-Za-z_][A-Za-z0-9_]*`, e.g. `TX` |
| `<t_ns>` | timestamp (3.4) | non-negative integer, ≤ 2⁵³ |
| `<payload>` | rest of the line; only the widget for `<kind>` interprets it | **printable ASCII `0x20`–`0x7E`, at most 200 characters**; may be empty |

**Framing (B6).** One plugin line is one physical stdout line, so the payload cannot hold CR, LF, NUL or any other control character, and non-ASCII text is not allowed. A plugin that needs binary or structured data encodes it itself (hex, as `uart` does). The rule is enforced identically at every hop – the same pattern in `parsePluginLine` (simulator line), `decodePluginFrame` (frame body) and the frontend's frame check – so the three cannot disagree. A line that breaks any rule is **not** a plugin line: it goes to the console as ordinary output, which makes the problem visible, and it cannot bypass the `LOG` limiter, because it is limited there. Memory per line is therefore bounded by the header plus 200 bytes in the server, in a WebSocket frame and in the browser.

Not covered by this plan: `lineSplitter` buffers a stdout stream without any newline indefinitely. That is an existing property of all output (not only plugin output), so a cap there is a separate change.

Payload of `kind = uart`:

| Payload | Meaning |
|---|---|
| `48` | one byte, two hex digits |
| `48 FE` | byte received, **framing error** (stop bit was not `'1'`) |
| `XX` / `XX FE` | at least one data bit was undefined (`U`, `X`, `Z`, `W`, `-`); the byte value is unknown |

### 3.4 Timestamp

- `<t_ns>` is the **simulated time since the start of the run** (VHDL `now`), as an integer number of **nanoseconds**.
- It is relative to the start of the run – every `RUN` starts at `t = 0` – and is **not** a date or time of day.
- It is the **same time base** as GHDL's own messages (`@83495ns`) and any waveform view, so the student can compare directly.
- Wall-clock time is not used: a batch run goes as fast as GHDL can, so wall-clock time says nothing about the design.
- It is set in one place (`hdlb_emit`, section 4), so every plugin uses the same definition.
- The GUI formats it for display (`83.495 µs`, `1.204 ms`) and can show Δt between entries.
- Range: verified past 2³¹ ns (≈ 2.1 s) in GHDL 4.1 (`@@HDLB uart RX 3000179270 FF`). A JavaScript `number` holds integers exactly up to 2⁵³ ns (≈ 104 days), so no BigInt is needed.
- Resolution: GHDL's time unit is 1 fs; `now / 1 ns` truncates to whole nanoseconds. Plugins whose events are closer than 1 ns do not make sense here; `uart_monitor` limits `baud` to 10 Mbaud for that reason.

### 3.5 Rules for plugin authors

1. Analysed into the library `hdlboard` (`--work=hdlboard`).
2. All GUI output goes through `hdlb_emit(kind, instance, payload)` – never `report` (which prefixes `file:line:col:@time:(report note):`) and never files of its own.
3. Every setting is a generic **with a default**. No configuration outside VHDL.
4. A `name : string` generic gives the instance name, so several instances can be told apart in the GUI.
5. **Validation (B7).** The plugin checks its own `name` once, at time 0, with a concurrent assertion using `hdlb_is_ident` from `hdlb_pkg`:

   ```vhdl
   assert hdlb_is_ident(name) report "…" severity failure;
   ```

   A bad name then stops the run immediately with a message that names the generic and shows the value, instead of making every later line fall back to the console. `kind` is a literal chosen by the plugin author, not by the student, so it is not checked at run time; the plugin's own tests cover it. `hdlb_emit` stays a plain formatter and does not validate (it would have to report on every call). The server parser stays strict and never repairs a line.
6. A plugin never ends the simulation (`std.env.finish`/`stop`) – that is the testbench's job. (The assertion above is the one exception: it ends a run that cannot work.)
7. A receive-only plugin has inputs only; it cannot affect the design under test.

### 3.6 Enabling and disabling plugins (B9)

**Requirement.** Each plugin can be switched on and off from HDLBoard. Switching a plugin off must be equivalent to not having it: no library entity, no tab, no plugin output.

**Where the user does it.** A Plugins section in HDLBoard's settings (exact place in the UI to be decided) lists the shipped plugins with a checkbox, a title and a one-line description each. The choice is stored per user in the browser, like other settings. Whether a project file may carry its own list is an open question (section 11).

**Catalog.** The list of shipped plugins is a table in HDLBoard's own code ([`ts/pluginCatalog.ts`](impl_files_for_plugins/ts/pluginCatalog.ts)), one row per plugin: `id`, `title`, `kinds` (the `@@HDLB` kinds it prints), `entities` (the VHDL entities it adds to `hdlboard`), `files` (analysis order) and `defaultEnabled`. It is not plugin configuration: the plugin's VHDL stays free of settings (B2). The frontend needs the same ids and titles; one shared test keeps the two copies in step.

**Protocol.** The client sends `PLUGINS <id>,<id>,...` before each `RUN` (empty list = none). It is stateless: every run carries its own set, so a reconnect cannot leave a stale one behind. A frontend that never sends it gets the catalog defaults. The set is captured when the run starts; changing a checkbox during a run applies from the next run. `parsePluginIds` validates the list (lower-case ids, at most 32, duplicates removed); unknown ids are ignored so a newer frontend can talk to an older backend.

**What disabled means, place by place.**

| Place | Enabled | Disabled |
|---|---|---|
| Analysis (section 5) | the plugin's files are analysed into `hdlboard` | not analysed. The shared package `hdlb_pkg` is still analysed when a student file declares `library hdlboard`, so the library exists and GHDL gives its precise error |
| Student instantiates the entity | works | analysis stops with `unit "uart_monitor" not found in library "hdlboard"`, followed by a hint from `disabledPluginHint`: *The plugin "RS232 (UART)" is disabled. Enable it in Settings > Plugins and run again.* A name that is no plugin entity at all (a typo) gets the list of available entities instead |
| Output routing (6.1) | `@@HDLB` lines of its kinds become `PLUGIN` frames | `routeOutputLine(text, disabledKinds)` treats lines of the disabled plugins' kinds as ordinary output, so even a student's own code that prints `@@HDLB uart ...` cannot reach the view of a disabled plugin. Lines of a kind **no catalog row knows** are routed (shown raw, 7.2): an edited or new plugin on the Plugins page may introduce one |
| Frontend | its lines appear in the plugin pane (stage 1) or its tab (stage 2) | none; the plugin is not offered anywhere in the run UI |
| Real-time mode (later) | its board pin is connected to the plugin | its pin is an ordinary extra port: tied or left open with the usual warning |

A testbench that uses a disabled plugin deliberately does not compile. That is the useful behaviour for a teacher who wants students to write their own monitor, and it is explicit rather than silently empty. Whether a hosted server may fix the set for everyone is an open question (section 11).

### 3.7 Beyond RS232: I2C, SPI and 1-Wire (B10)

**Can the structure carry them?** Yes, with no change to the line protocol, the budget, the routing or the state model. This was checked by writing a prototype monitor for each bus and running it in GHDL against a testbench with realistic masters and slaves. The prototypes are in [`impl_files_for_plugins/feasibility/`](impl_files_for_plugins/feasibility/); they are **not shipped and not part of the first implementation**. `sh impl_files_for_plugins/feasibility/run_feasibility.sh` passes (GHDL 4.1).

| Plugin id / kind | Monitor ports | Generics (all with defaults) | Payload | Verified |
|---|---|---|---|---|
| `rs232` / `uart` | `rx` | `name`, `baud` | `<hh>` · `<hh> FE` · `XX` · `XX FE` | first implementation |
| `i2c` / `i2c` | `scl`, `sda` | `name` | `S` · `Sr` · `P` · `ADDR <hh> <R\|W> <A\|N>` · `DATA <hh> <A\|N>` | S, address+write, data, repeated start, address+read, data with NACK, P – including the SCL edge a repeated start causes |
| `spi` / `spi` | `cs_n`, `sclk`, `mosi`, `miso` | `name`, `cpol`, `cpha`, `bits` (1–32) | `B` · `<mosi hex> <miso hex>` · `E` | mode 0 (8 bit, two words in one frame), mode 3 (16 bit), mode 1 (falling-edge sampling) |
| `onewire` / `onewire` | `dq` | `name` | `RESET` · `PRESENCE` · `NOPRESENCE` · `<hh>` | reset with and without a slave, write 0xCC, write 0x44, read 0x5A |

What the checks showed:

1. **One plugin = one bus = one instance.** A bus has several lines, so a monitor has several input ports; the instance name (the tab) identifies the bus. Several buses are several instances, as in `spi_tb` (three buses, one testbench).
2. **Open-drain lines work with ordinary `std_logic`.** The lines are resolved signals: the master and slave drive `'0'` or `'Z'` and the testbench adds a pull-up with `sda <= 'H';`. The monitors read through `to_x01`, which maps `'H'` to `'1'`. The pull-up is one line in the student's testbench; nothing is needed from the plugin library. This must be in the student documentation.
3. **Settings are generics, as decided (B2).** SPI mode and word length are `cpol`, `cpha` and `bits` in `generic map`; no config file was needed.
4. **Bus-level events, one line per byte or word.** Payloads stay far below the 200-character limit. Timestamps in whole nanoseconds are sufficient (1-Wire slots are microseconds; an SPI word is stamped when its last bit is sampled).
5. **Event rate is much higher than the first budget assumed** – see 6.2. A testbench-driven line produces about 24 000 plugin lines per second of real time, so the I2C/SPI/1-Wire plugins would hit a 2000 lines/s limit at once.
6. **Active device models fit too.** An I2C EEPROM, an SPI flash or a 1-Wire temperature sensor is a VHDL entity with open-drain outputs that the student instantiates, exactly like a monitor. Their settings (a temperature, a memory image) can be generics. Values the user changes **in the GUI while the simulation runs** need a GUI → design channel, which belongs to the real-time draft, not to batch mode.

Limits to document with each plugin when it is made:

| Bus | Not covered |
|---|---|
| I2C | multi-master arbitration; 10-bit addresses and the general call are shown as ordinary bytes; the monitor does not check the timing of SCL |
| SPI | word length is fixed per instance (a device with mixed lengths needs two instances); LSB-first buses need a generic that is not in the prototype; no check of the chip-select setup time |
| 1-Wire | standard speed only (the 14 µs sampling point and the 480 µs reset are constants; overdrive needs generics); the direction of a byte is not visible on the wire, so ROM and function commands are shown as plain bytes – decoding them is a layer above the monitor |

Real-time mode (draft): SDA and DQ are bidirectional and need a pull-up, which the generated board testbench does not do today (`extraPorts.ts` leaves an `inout` open). That is recorded in [`plugin_board_implementation_draft.md`](plugin_board_implementation_draft.md).

**Consequences for the first implementation (RS232).** Nothing needs to be built for the other buses, but these things must not be assumed: that there is one plugin (the catalog, `PLUGINS` and `disabledKinds` take a list), that a plugin has one input port (the instance model is "one tab per instance"), that the payload is a hex byte (the server never interprets it), or that the rate stays low (6.2 is sized for the buses).

### 3.8 Reference design review: SAP-1 on the Mojo board

A real project from the course material was reviewed for ideas: `sap-1-v2-mojo`, an 8-bit SAP-1 CPU in Verilog for the Mojo FPGA board (14 modules, one testbench; upstream `ellisgl/sap-1-v2-mojo`). **It has no plugin system** – every module is instantiated by hand in `mojo_top.v` – so there is no mechanism to adopt. It still tests several assumptions of this plan. The runs used Icarus Verilog 12.0 (`iverilog -g2005 -s mojo_top_tb …`, then `vvp`) on a copy of the sources; the only change was the one-word fix in row 4.

| # | Observation | Checked | Consequence |
|---|---|---|---|
| 1 | The only "extension" concept is an IDE-side list in the project file: `sap-1-v3.mojo` names `<component>simple_ram.v</component>` and `simple_dual_ram.v`. The files are not in the repository and nothing instantiates them. | read | A shared project can name parts it does not contain. HDLBoard needs no such list in the first version: the dependency is already in the source (`library hdlboard;`, found by `usesHdlboardLibrary`), and a recipient who has the plugin disabled gets the hint of 3.6. Open question 5 stays open; leaning: no per-project list. The IDE's own semantics were not checked, so the format is not a model. |
| 2 | The internal buses are tri-state: `DBUS` and `ABUS` are `inout`, and every module drives `'z'` when it is not enabled (`assign DBUS = (Ea) ? accreg : 8'bzzzz_zzzz;`). | run: `DBUS` goes to all-`z` when no module drives it | The same resolved-signal rule as 3.7 (2): a monitor reads such a line through the X01 mapping and must not assume `0`/`1`. When the plugins are translated to Verilog, `z` and `x` must be handled explicitly. |
| 3 | A front panel loads the program: `extaddr`, `extdata` and the strobe `extload` write one RAM word per pulse while `extrun = 0`. | run: the testbench makes 6 writes, RAM[10] = 1 and RAM[11] = 2 as intended | In batch mode the testbench drives these pins itself, so nothing is needed. In real-time mode this is the GUI → design channel (board draft 2.4 and OPEN-10). |
| 4 | **The sources do not compile in Icarus as they stand.** Line 1 of `mojo_top.v` is `` `1ns / 1ps `` – the word `timescale` is missing. Icarus stops with `syntax error … I give up.`; the Xilinx tool accepts it. | run: error; with the word added the build is clean | Not a plugin matter; it belongs to the Verilog track, because HDLBoard's Verilog engine is Icarus. Noted so the message is recognised when such a project is imported. |
| 5 | The testbench is silent: every `$display` in the design is commented out. | run: the output is Icarus' VCD notice and the `$finish` line only | A design like this needs something that prints its state. A generic value probe would serve it (open question 10). A serial-bus monitor does not apply. |
| 6 | The testbench cannot advance the CPU. Auto mode divides 50 MHz down to 1 Hz (`ccnt == 24_999_999`) and the button debounce needs 2^20 clock cycles, but the testbench ends after 460 ns. | run: **1** CPU clock edge in 460 ns, the output register stays 0 | Hardware dividers make a design unusable in a short testbench, with or without plugins. The student documentation should say: make divider and debounce lengths generics so the testbench can shorten them. |

---

## 4. Reference implementation

All files are in [`impl_files_for_plugins/`](impl_files_for_plugins/); see its [`README.md`](impl_files_for_plugins/README.md) for status and intended locations.

| File | Purpose |
|---|---|
| [`vhdl/hdlb_pkg.vhd`](impl_files_for_plugins/vhdl/hdlb_pkg.vhd) | `hdlb_emit` – one `@@HDLB` line with timestamp; `hdlb_is_ident` |
| [`vhdl/uart_monitor.vhd`](impl_files_for_plugins/vhdl/uart_monitor.vhd) | reference plugin: behavioural UART receiver, 8N1, LSB first |
| [`examples/uart_tx.vhd`](impl_files_for_plugins/examples/uart_tx.vhd) | example student design (synthesizable UART transmitter, 50 MHz / 115200 baud) |
| [`examples/uart_tx_tb.vhd`](impl_files_for_plugins/examples/uart_tx_tb.vhd) | example student testbench using the plugin |
| [`examples/uart_monitor_fe_tb.vhd`](impl_files_for_plugins/examples/uart_monitor_fe_tb.vhd) | plugin self-test: framing error and timestamps > 2³¹ ns |
| [`examples/uart_monitor_edge_tb.vhd`](impl_files_for_plugins/examples/uart_monitor_edge_tb.vhd) | plugin self-test: glitch, initial `U`, back-to-back bytes, undefined bit, non-default baud |
| [`examples/run_examples.sh`](impl_files_for_plugins/examples/run_examples.sh) | runs the testbenches as batch mode will and compares with `*.expected.txt` |
| [`ts/pluginLine.ts`](impl_files_for_plugins/ts/pluginLine.ts) | server proposal: parse/route `@@HDLB` lines, `PLUGIN` frame, library detection |
| [`ts/uartPayload.ts`](impl_files_for_plugins/ts/uartPayload.ts) | frontend proposal: `uart` payload, text view, time format |
| [`ts/pluginCatalog.ts`](impl_files_for_plugins/ts/pluginCatalog.ts) | server proposal: plugin catalog, disabled kinds, files to analyse, hint for a disabled plugin |
| [`feasibility/`](impl_files_for_plugins/feasibility/) | prototypes for I2C, SPI and 1-Wire (not shipped), see 3.7 |

### 4.1 `hdlb_emit` (core of `hdlb_pkg.vhd`)

```vhdl
procedure hdlb_emit(kind, instance, payload : string) is
  variable l : line;
begin
  write(l, string'("@@HDLB ") & kind & " " & instance & " " &
           to_string(now / 1 ns) & " " & payload);
  writeline(output, l);            -- raw stdout, not report
end procedure;
```

### 4.2 `uart_monitor`

```vhdl
entity uart_monitor is
  generic (
    name : string   := "uart";     -- instance name = GUI tab
    baud : positive := 115200
  );
  port (
    rx : in std_logic              -- the line being watched (typically the design's TX)
  );
end entity;
```

Behaviour (8N1, LSB first), pinned by `uart_monitor_edge_tb` and `uart_monitor_fe_tb`:

| Situation | Behaviour |
|---|---|
| Start bit | A falling edge `'1'` → `'0'` (`falling_edge`). `U` → `'0'` and `X` → `'0'` are **not** edges, so an undriven line at time 0 does not start a byte. |
| Sampling | In the middle of each bit. Changes between two samples are not seen. |
| Glitch | If the line is not `'0'` half a bit after the edge, the edge is ignored and the monitor waits for the next one. No output. |
| Unknown values | Each sample is mapped with `to_x01`. If a **data** bit is `U`/`X`/`Z`/`W`/`-`, the byte is reported as `XX`. |
| Stop bit | Sampled half a bit into the stop bit. Anything but `'1'` (including unknown) adds `FE`. One line per byte, so one `FE` per byte. |
| Back-to-back bytes | Work with no idle gap beyond the stop bit: the stop bit is sampled half a bit before its end, so the monitor is waiting for the next falling edge when the next start bit arrives. |
| After a framing error | No resynchronisation inside the frame; the monitor waits for the next falling edge. If the line stays low (a break), there is no new edge until it returns high, so a frame that begins while the line is low is missed. |
| Baud | `positive`, at most 10 Mbaud (asserted at time 0). Non-default values are set in `generic map`; tested at 9600. |

Naming: "rx" is seen from the plugin – the line it listens to. That is usually the design's TX output, hence `rx => tx` below.

### 4.3 Use in a student testbench

```vhdl
library hdlboard;                                  -- HDLBoard plugins
...
mon: entity hdlboard.uart_monitor
  generic map (name => "TX")                       -- baud left at its default
  port map (rx => tx);
```

stdout of [`examples/uart_tx_tb.vhd`](impl_files_for_plugins/examples/uart_tx_tb.vhd) (sends `"Hei!"`), as in [`uart_tx_tb.expected.txt`](impl_files_for_plugins/examples/uart_tx_tb.expected.txt):

```
@@HDLB uart TX 83495 48
@@HDLB uart TX 170335 65
@@HDLB uart TX 257175 69
@@HDLB uart TX 344015 21
```

The GUI shows `Hei!` in the tab "TX". A testbench with a free-running clock must end itself (`std.env.finish`), otherwise it is stopped by `BATCH_TIMEOUT_MS` (60 s).

---

## 5. GHDL flow and the plugin library build step

```
ghdl -a --std=08 --work=hdlboard <root>/hdlb_pkg.vhd <root>/uart_monitor.vhd    # NEW – only if a student file declares library hdlboard
ghdl -a --std=08 <student files>                                                # unchanged (fixed-point analysis)
ghdl -e --std=08 <testbench>                                                    # unchanged
ghdl -r --std=08 <testbench>                                                    # unchanged
```

All four run with the session directory as working directory, which is what the existing commands do (`ghdl()` in `ghdlEngine.ts`).

| Topic | Decision |
|---|---|
| **Plugin root** | One function `getPluginRoot()` next to `getGhdlExe()`, resolved like `ghdlPath.ts` resolves GHDL: (1) env `HDLBOARD_PLUGIN_DIR` if set; (2) the directory passed by Electron's `startBackend()` (packaged Windows app: `resources/plugins/vhdl/`); (3) otherwise `../plugins/vhdl/` relative to the compiled module in `server/dist/` (development: `server/plugins/vhdl/`; Docker: `/srv/HDLBoard/server/plugins/vhdl/`). The result is an **absolute path**; installed files are analysed in place, not copied. Files sent with the run (6.4) are written to the session directory and analysed from there instead. |
| **Library and work directory** | `--work=hdlboard` makes GHDL write `hdlboard-obj08.cf` into the working directory (the session directory). `ghdl -e` / `ghdl -r` find it there, so no `--workdir` or `-P` option is needed – this is the exact flow the examples use. |
| **Which files** | When a student file declares `library hdlboard`, **all** shipped plugin files are analysed, in a fixed order given by a list in code (`hdlb_pkg.vhd` first). They are tiny (milliseconds), and a per-plugin dependency graph would add a parser for no gain. |
| **Dependency detection** | `usesHdlboardLibrary(source)` in [`ts/pluginLine.ts`](impl_files_for_plugins/ts/pluginLine.ts): blank out comments (`--` and VHDL-2008 block comments), string literals and the character literal `'"'`, then match `\blibrary\b[^;]*\bhdlboard\b` case-insensitively. Covers `library ieee, hdlboard;`, several lines, odd whitespace and mixed case, and is not fooled by commented-out or quoted text. A `use hdlboard…` **without** a library clause is the student's own error; GHDL reports it. A full lexer is not needed because the grammar of a library clause is this simple; the function has 12 tests for the cases above. If the server's existing comment stripper (`portDetect.ts`) is reused, the tests carry over unchanged. |
| **Clean-up** | `clearWorkLibrary` also removes every `hdlboard-obj*.cf` (a pattern, not the single name `-obj08`, so a different standard suffix is covered), so the library is rebuilt each run. |
| **Missing or broken assets** | Missing plugin directory or file, or a failing `ghdl -a` on a plugin file, is `stage: 'internal'`, never shown against the student's code. The text names the file and the command: `Plugin library: could not analyse hdlb_pkg.vhd (ghdl -a --std=08 --work=hdlboard, plugin root C:\…\plugins\vhdl):` followed by GHDL's output, or `…plugin root not found` with the path that was tried. An incompatible GHDL fails in the same place with the same message. |
| **Name clash** | A student entity called `uart_monitor` in `work` does not clash with `hdlboard.uart_monitor`. |
| **Board mode** | The same step is harmless there, but board mode is out of scope here. |

---

## 6. Server changes

Proposal code: [`ts/pluginLine.ts`](impl_files_for_plugins/ts/pluginLine.ts) – `parsePluginLine`, `routeOutputLine`, `encodePluginFrame`, `decodePluginFrame`, `usesHdlboardLibrary` (unit tests in `pluginLine.test.ts`, Node test runner like the rest of `server/`).

### 6.1 `session.ts` – run generation, then routing before the limiter

**What already protects a new run.** `kill()` calls `stopDelivering` (removes the `data` listeners), so a killed process delivers no further line, and `done`/`onExit` are identity-checked against the current handle (`this.batchRun !== handle`). Lines still buffered in the stream are dropped with the listeners.

**What is added (B8).** The output callback itself is not identity-checked, and it should not rely on the stream internals. A run generation is captured when the process starts and checked before every forward:

```ts
private outputGeneration = 0;

private startBatchRun(engine: SimEngine, plan: RunPlan): void {
  this.beginOutput();
  const generation = ++this.outputGeneration;                   // captured when the process starts
  const handle = engine.startBatchRun(plan, (line) => {
    if (generation !== this.outputGeneration || this.destroyed) return;   // output of an old run
    this.forwardOutputLine(line);
  }, BATCH_TIMEOUT_MS);
  …
}
```

`handleStop`/`handleReset` and `destroy` also bump `outputGeneration`. The same check goes into the board path's `handle.onOutput` callback. It covers **both** ordinary log lines and plugin lines, because both go through `forwardOutputLine`.

**Client side.** WebSocket frames are ordered, so everything the old run sent arrives before the new run's `READY`. The frontend therefore clears plugin state **on `READY`**, not when the user clicks Start; with the server check above, nothing from the old run can arrive after that `READY`.

**Routing.**

```ts
private forwardOutputLine(line: string): void {
  if (!/\S/.test(line)) return;
  const route = routeOutputLine(line);
  if (route.to === 'plugin') this.forwardPluginLine(route.line);   // own budget (6.2)
  else this.sendLogLines(this.limiter?.accept(route.text) ?? []);
}
```

- Plugin lines must not count against, or be dropped by, the 200 lines/s `LOG` budget.
- The server checks the header and payload rule (3.3) only. It does not interpret the payload, so a new plugin type needs no server change – only VHDL and a widget.
- The same path works in board mode (`RunHandle.onOutput` → `forwardOutputLine`), which the real-time draft reuses.

### 6.2 Plugin budget: rate and volume

**Measured (GHDL 4.1, Linux, plugin lines read through a pipe):**

| Case | Lines | Wall time | Rate |
|---|---|---|---|
| Testbench drives the line itself (20 000 UART bytes, 1.74 s simulated) | 20 000 | 0.83 s | **≈ 24 000 lines/s** |
| Student design clocked at 50 MHz (`uart_tx`, 300 bytes) | 300 | 2.97 s | ≈ 100 lines/s |

A batch run is not paced to real time, so a testbench that stimulates the plugin directly emits plugin lines as fast as GHDL can. A limit of 2000 lines/s would have thrown away about 90 % of a 20 000-byte test. The rate limit therefore has to sit near the measured maximum, and the volume cap is what actually protects the system.

| Limit | Proposal | When exceeded |
|---|---|---|
| Rate | 20 000 plugin lines per second window (≈ the measured maximum; a socket-flood guard, not a throttle) | lines in the window are dropped |
| Volume | 100 000 plugin lines per run (`MAX_PLUGIN_LINES_PER_RUN`) | all further plugin lines of the run are dropped |
| Frontend retention | the newest 10 000 entries per instance (ring buffer; the stage 1 pane merges the instances by arrival order, so a flooding instance cannot evict another's entries) | the pane or widget shows "N earlier entries not shown" |
| Frontend update rate | state updates are coalesced to one per animation frame | – (rendering 24 000 updates a second would stall the page) |

The numbers are proposals to tune. All of them exist for a reason: the rate limit bounds frames per second, the volume limit bounds frames per run (a 60 s batch run could otherwise produce over a million), the ring buffer bounds browser memory, and coalescing keeps the page responsive.

**The summary reaches the console.** Dropped lines are reported as one `LOG` line (`… 1234 plugin lines not shown (plugin limit: 20000 lines/s)`, or `… (plugin limit: 100000 lines per run)`). It is sent with `sendLogLines`, **not** through `limiter.accept`, exactly like the existing limiter's own summary – so the ordinary 200 lines/s limit does not apply to it and it cannot be dropped by it.

**Lifecycle.** The plugin budget is created in `beginOutput` next to the existing limiter, flushed by the same timer (`LIMITER_FLUSH_MS`), and finished in `endOutput`. `endOutput` is already called on every path that ends a run:

| Event | Where |
|---|---|
| Normal completion, error, timeout | `done`/`onExit` handlers (`endOutput()`) |
| `STOP`, `RESET` | `stopActive()` (`endOutput()` before killing) |
| New `RUN` | `beginOutput()` calls `endOutput()` first |
| Socket close | `destroy()` – stops the timer; nobody is left to receive a summary |
| Compilation fails | no run starts, so no budget exists |

Implementation choice: make `createOutputLimiter` generic over the item, or add a small counter class beside it.

### 6.3 `protocol.ts` – new frames

```ts
// server → client
| { verb: 'PLUGIN'; kind: string; instance: string; timeNs: number; payload: string }
// client → server (3.6)
| { verb: 'PLUGINS'; ids: string[] }
```

Wire format of `PLUGIN` mirrors `LOG` (header line, payload as body); `PLUGINS` is one line:

```
PLUGIN <kind> <instance> <t_ns>\n<payload>
PLUGINS <id>,<id>,...
```

```ts
case 'PLUGIN': {
  const line = decodePluginFrame(inline, body);
  return 'message' in line ? line : { verb: 'PLUGIN', ...line };
}
```

**Compatibility.**

| Combination | What happens |
|---|---|
| Old frontend, new backend | The frontend ignores unknown verbs ([`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) § 6.2): no plugin view, nothing breaks. |
| New frontend, old backend | No capability negotiation is added. An old backend has no plugin library, so a testbench with `library hdlboard` fails in analysis with GHDL's own, clear error, and no `PLUGIN` frame is expected. If such a backend ever did print `@@HDLB` lines, they would appear in the console as ordinary text. The failure is loud either way. |
| Malformed `PLUGIN` frame | The frontend drops the frame and logs it once with `console.warn` (as it does for other malformed frames); the server never produces one because it builds frames from lines it has already validated. |

`WELCOME`'s version stays `1`: the change is purely additive.

**Cross-side tests.** The frontend parses frames on its own (`hdlClient.ts`), independently of `server/src/protocol.ts`. To keep the two from drifting, both test suites read **one shared fixture** of valid and invalid `PLUGIN` frames (header pattern, safe-integer check, body rule, unknown verb ignored) – a JSON file under `server/src/testSupport/` that the frontend test also imports.

### 6.4 Plugin source files: shipped and edited (B12)

The shipped plugin files stay the default. A user may keep **edited copies** (7.4); the server treats them as follows.

| Topic | Decision |
|---|---|
| Where the shipped text comes from | **The frontend.** The shipped plugin files are bundled into the frontend build (`?raw` imports of `server/plugins/vhdl/*.vhd`, the single canonical copy; whether Vite may read outside `src/` is to be checked), so the Plugins page has them at once, with no round trip and no protocol verb. Decided in the prototype phase: the sources must be easy to reach and edit; locking them in the backend can be considered later. |
| Sending files | In the `RUN` body, as additional files under the reserved prefix `hdlboard/`, for example `hdlboard/uart_monitor.vhd`. While the Plugins page is enabled (7.4) the client sends **all files of the enabled plugins** (bundled or edited), so the frontend is the single source of truth and cannot drift from what the backend has installed; with the page off nothing is sent and the installed files are used. |
| Server validation | The name must be in the catalog set (`SHARED_FILES` and the `files` of the catalog rows); anything else under `hdlboard/` is an error, so a sent copy can never overwrite a student file and a student file cannot use the prefix. Size cap per file: 256 KB (proposal). Files of a disabled plugin are ignored. |
| Analysis (section 5) | For each file of `filesToAnalyse(enabled)`, the edited copy replaces the installed file in the same position of the same `ghdl -a --work=hdlboard` command. Edited files are written into the session directory, never into the plugin root, so one user's edit cannot reach another session. |
| Errors | A failing analysis of an edited file is reported as `stage: 'plugin'` with the file name and GHDL's text. A failing **shipped** file stays `stage: 'internal'` (section 5). |
| Notice | When at least one sent file differs from the bundled text, the console gets one line at the start of the run: `Plugins: using edited files: uart_monitor.vhd`. For a file whose base has changed (7.4a) the line says so: `Plugins: shipped file changed since your edit: uart_monitor.vhd`. An edit that is easy to forget is thereby visible in every run. |
| Trust | An edited plugin is VHDL run by GHDL in the user's own session, exactly like the student's files; it gets no more access. No restriction is planned; a server-side switch can be added later if a need appears. |

---

## 7. Frontend changes

Proposal code: [`ts/uartPayload.ts`](impl_files_for_plugins/ts/uartPayload.ts) – `parseUartPayload`, `uartDisplay`, `formatSimTime` (vitest tests in `uartPayload.test.ts`).

### 7.0 Stages

| Stage | UI | Status |
|---|---|---|
| **1 (first implementation)** | **Split console** with the raw `@@HDLB` output (7.3) and the **Plugins page** for editing the plugin VHDL files (7.4). No per-plugin widgets. | in scope |
| 2 | The batch-simulation UI proper: per-kind widgets and tabs (7.1, 7.2 and 7.5, for example the uart text view), hex view, filters per instance. | later |

Stage 1 uses the `PLUGIN` frame, the state model of 7.2 and the retention limit unchanged; only the way the entries are shown differs. Because the server never interprets the payload, stage 2 needs no server change.

### 7.1 Parts

| Part | Proposal |
|---|---|
| `hdlClient.ts` | `case 'PLUGIN'` in `handleFrame`: check the header and body with the rule of 3.3 (copied, as `STATE_LENGTH` already is), call a new handler `onPlugin({ kind, instance, timeNs, payload })` in `HdlClientHandlers`. |
| Plugin registry (stage 2) | `kind → { parse(timeNs, payload), Widget }`. First entry: `uart` → terminal widget. New plugin type = new entry. |
| State (stage 1 and 2) | `Map<key, { kind, instance, entries, dropped }>`; stage 1 renders all keys in one list, stage 2 one tab per key. |

### 7.2 State model and life cycle

| Situation | Behaviour |
|---|---|
| Key | `kind + '/' + instance`. The same instance name with a **different kind** is a different tab (shown as the instance name with a kind badge), so a payload is never read with the wrong schema. |
| New run | State cleared on `READY` (see 6.1). Two runs in a row without leaving the workbench therefore never mix. After `DONE` or an error, the result stays visible until the next `READY`. |
| `PLUGIN` before `READY` | Ignored. The server sends `READY` before it forwards any output, and WebSocket frames are ordered, so this indicates a bug and is logged with `console.warn`. |
| Unknown `kind` | A generic tab with the raw lines (`<t_ns> <payload>`), marked "no viewer for kind `x`" – never silently dropped. |
| Invalid payload for a known kind | The entry is shown as raw text in the widget and marked invalid; later entries are still parsed. |
| Widget closed / tab changed | Closing hides the tab until the next run; data is kept so reopening is instant. Which tab is selected is UI state only and does not affect the data. |
| Run fails before any plugin line | No tabs are created; the console shows the error as today. |
| More than the retention limit | Oldest entries are dropped; the widget shows "N earlier entries not shown". |

### 7.3 Stage 1: split console

When a run produces plugin lines, the console area is split into two panes; a run without plugin lines looks exactly as today (no empty pane).

| Part | Behaviour |
|---|---|
| Left pane | the ordinary console (`LOG`), unchanged |
| Right pane "Plugin output" | one row per `PLUGIN` frame: **time**, **kind**, **instance**, **payload**, in arrival order. Time is `formatSimTime(timeNs)` (for example `83.495 µs`), the exact nanoseconds in the tooltip. Example row: `83.495 µs  uart  TX  48` |
| Content | raw: no interpretation of the payload, also for kinds without a viewer and for invalid payloads (7.2). This is the same list as the "generic tab" of 7.2; in stage 1 it is the only view |
| Life cycle | appears with the first plugin line; filled live while the run goes on; cleared on `READY`; stays after `DONE` or an error until the next `READY`; a close button hides it until the next run |
| Retention | the per-instance ring buffer of 6.2 with "N earlier lines not shown" |
| Copy | a button copies the lines in their original form, `@@HDLB <kind> <instance> <t_ns> <payload>`, for bug reports and for pasting into a test fixture |
| Split mechanism | reuse the existing split-screen component if it fits (to be checked against [`impl_split_screen.md`](impl_split_screen.md)); the splitter is draggable and the sizes are remembered per user |

### 7.4 Stage 1: Plugins page (edit plugin VHDL files)

**Purpose.** Let a student or teacher read the shipped plugin sources, change them (for example a different default baud rate or a modified monitor) and run a testbench against the edited version, without touching the installation.

**Enabling.** The page is off by default. The Settings dialog gets a section "Plugins" with (a) the per-plugin enable checkboxes of 3.6 and (b) a checkbox "Show the Plugins page (edit plugin files)". When it is on, a "Plugins" entry appears where HDLBoard's other pages are reached (exact place to be matched with the existing navigation); when it is off, the page is gone and **no edited file is sent** with a run, so the shipped plugins are used. Edits are kept in the browser while the page is off and apply again when it is switched on.

**Content.**

| Area | Content |
|---|---|
| Plugin list | one row per catalog entry: title, kinds, enabled checkbox (the same setting as in the dialog), a mark if any of its files is edited |
| File list | `SHARED_FILES` and the plugin's `files`; edited files marked |
| Editor | the existing VHDL editor component (syntax colouring) on the selected file; the text starts as the bundled file |
| Actions | **Reset to shipped** (per file), **Revert unsaved changes**, **Export** (download the file; export of all plugin files as a set is a later convenience); saving is automatic to browser storage, like project files |
| Messages | the last analysis error that names a plugin file (`stage: 'plugin'`, 6.4) is shown above the editor with file, line and text as GHDL gives them |

**Configuration.** B2 still holds: there is no plugin configuration file. What the page lets the user change is (1) whether a plugin is enabled and (2) the VHDL, where all settings are generics with defaults. Showing the generics of the selected entity as a read-only list is a possible later addition.

**Where edits live.** In the browser, per user (`localStorage`/IndexedDB like other settings), as `file name → text` plus the hash of the bundled text each edit was based on (used by 7.4a, below). They are sent only with a run (6.4). Nothing is written to the server's plugin root.

**7.4a Shipped file changed after an edit.** An edited copy is based on one version of the shipped file. When HDLBoard is updated and the bundled file differs from the stored base hash, the file is marked "shipped file has changed" on the page, and the run notice names it too (`Plugins: shipped file changed since your edit: uart_monitor.vhd`). The edited copy keeps being used (silently replacing it would destroy the user's work); the user chooses **Keep mine**, which accepts the new base hash, or **Reset to shipped**. A side-by-side diff may come later; automatic merging is not planned.

### 7.5 uart widget (stage 2)

- Text view: printable ASCII as text; CR, LF and CR LF each as one line break; TAB as is; undefined bytes (`XX`) as `⟨??⟩`; other bytes as `⟨hh⟩` (`uartDisplay`).
- Hex view as an alternative (toggle).
- Timestamp per byte on hover or in a column (`formatSimTime`), with Δt to the previous byte.
- Framing errors (`FE`) highlighted in red.

### 7.6 Call sites of `HdlClientHandlers`

Adding `onPlugin` to the interface requires updating every construction of `HdlClient`:

| Site | Change |
|---|---|
| `src/components/workbench/Workbench.tsx` (`new HdlClient(hdlBackendUrl(HDL_WS_PORT), { … })`, around line 467) | add `onPlugin` |
| `src/components/workbench/hdlClient.test.ts` (`new HdlClient('ws://test', { … })`, around line 66) | add a no-op or recording `onPlugin` to the test double |

There is no other entry point (no demo or bundled variant) that constructs `HdlClient`.

---

## 8. Affected files

| File | Change |
|---|---|
| `server/plugins/vhdl/hdlb_pkg.vhd`, `uart_monitor.vhd` (new) | from `impl_files_for_plugins/vhdl/`; both already carry the SPDX header (`GPL-2.0-only`, copyright line) |
| `server/src/pluginLine.ts`, `pluginCatalog.ts` (+ tests, new) | from `impl_files_for_plugins/ts/` |
| `server/src/pluginRoot.ts` (new) | `getPluginRoot()` (section 5) |
| `server/src/engines/ghdlEngine.ts` | detect `library hdlboard`, analyse `filesToAnalyse(enabled)` with `--work=hdlboard` before the student files, clean `hdlboard-obj*.cf`, append `disabledPluginHint` to analysis errors |
| `server/src/session.ts` | thin wiring only (8.2): run generation (6.1), hand each output line to the plugin output component, keep the `PLUGINS` set for the next `RUN` |
| `server/src/pluginOutput.ts` (new) | routing with the run's disabled kinds, plugin budget (6.2), summaries, lifecycle (8.2) |
| `server/src/protocol.ts` | `PLUGIN` frame and `PLUGINS` verb (type, encode, decode) |
| `server/src/testSupport/` | shared `PLUGIN` frame fixture |
| `src/components/workbench/hdlClient.ts` | `case 'PLUGIN'`, `onPlugin`; send `PLUGINS` before `RUN`; add the `hdlboard/*` files of enabled plugins to `RUN` while the Plugins page is enabled (`filesForRun`) |
| Settings UI (new section "Plugins") + settings store | one checkbox per catalog row and the checkbox "Show the Plugins page" (default off), stored per user |
| `src/components/workbench/Workbench.tsx`, `hdlClient.test.ts` | `onPlugin` at the two construction sites (7.6); plugin panel / tabs |
| `src/components/workbench/plugins/` (new) | stage 1: plugin output pane (7.3), `formatSimTime`; stage 2: registry, `uart/uartPayload.ts` (from `impl_files_for_plugins/ts/`), uart widget |
| Plugins page (new, place to be matched with the existing pages) and `pluginSources` store | list, editor, reset, auto-save to browser storage (7.4) |
| `server/src/pluginFiles.ts` (new), `ghdlEngine.ts` | validation of `hdlboard/*` files, writing them to the session directory, `stage: 'plugin'` errors, the "using edited files" notice (6.4); no new protocol verb |

### 8.1 Release-blocking packaging changes

These are not deployment details: without them the feature works in development and fails in every shipped build.

| Area | Change |
|---|---|
| Docker (`docker/Dockerfile`) | the `server-build` stage copies only `server/src/`, and the `backend` stage takes only `package.json`, `node_modules/` and `dist/` from it, so plugins reach the image by neither route. Add `COPY server/plugins/ /srv/HDLBoard/server/plugins/` to the `backend` stage (the files are plain VHDL, nothing to build); the relative path in section 5 then resolves without `HDLBOARD_PLUGIN_DIR`. The existing build-time probe is the place to add a one-line plugin analysis check |
| Windows installer (`winInstaller/build.ps1`, step "Assembling resources/") | copy `server/plugins/vhdl/` to `resources/plugins/vhdl/`, pass the directory to `startBackend()` like `ghdlExe`, and add it to the installer manifest |
| Clean builds / generated bundles | `server/dist/` must not be the only place plugins live; plugin files are copied, not compiled. A clean-build check must list `plugins/vhdl/*.vhd` in the artifact |
| Licensing | the VHDL files carry the same SPDX header as the TypeScript sources; the installer's third-party notice does not need an entry because the files are HDLBoard's own |
| Verification | a post-build check (script or CI step) that runs `run_examples.sh` against the **packaged** plugin directory |

### 8.2 Code conventions (Clean Code, B13)

The aim is source that can be read top to bottom and understood without the documents. The conventions apply to TypeScript, React and VHDL alike; the reference files in `impl_files_for_plugins/` are the first examples and are held to the same rules.

| Rule | In this feature |
|---|---|
| **Names say what and why** | `routeOutputLine`, `disabledKinds`, `filesToAnalyse`, `hdlb_emit` – a reader should not need a comment to know what they do. No abbreviations beyond the domain's own (`tb`, `rx`). |
| **Small functions, one job, one level of abstraction** | A function does one thing and can be described without "and". Parsing, validation, routing, budgeting and I/O are separate functions; a function that mixes policy with socket or process calls is split. |
| **Pure core, thin shell** | The decisions (`parsePluginLine`, `routeOutputLine`, `decodePluginFrame`, `filesToAnalyse`, `disabledKinds`) are pure functions with no I/O and are unit-tested alone. `session.ts` and `ghdlEngine.ts` only wire them to sockets and processes. |
| **Do not grow `Session`** | `session.ts` is already large. Plugin concerns get their own components – `pluginOutput.ts` (routing, budget, summaries, lifecycle) and `pluginFiles.ts` (validation and writing of `hdlboard/*` files) – and `Session` calls them. Same on the frontend: the plugin pane, the Plugins page and the `pluginSources` store are separate components with separate state, not additions to `Workbench.tsx`. |
| **No duplication** | One pattern for the line rule in the server, used by both parse and decode. The frontend must repeat it (separate package); that single copy is pinned by the shared fixture of 6.3. The catalog is one table. |
| **No magic numbers** | Named constants with a comment on why: `MAX_PAYLOAD_LENGTH`, `MAX_PLUGIN_IDS`, `MAX_PLUGIN_LINES_PER_RUN`, the rate window, the ring-buffer size, the 256 KB file cap. In VHDL: constants or generics with defaults (`baud`), not literals in the process. |
| **Explicit results, no hidden failure** | Functions return a typed result (`undefined` for "not a plugin line", a `{ message }` for a bad frame) instead of throwing for expected cases; unexpected states are errors with a message naming the file or value. No silent catch. |
| **No flag arguments, few parameters** | A boolean parameter that switches behaviour means two functions. More than three parameters become a small typed object. |
| **Comments explain why, not what** | Doc comments state the contract and the decision (as in `routeOutputLine`); no comment repeats the code, and no commented-out code is committed. |
| **Readable tests** | One behaviour per test, named as a sentence, arrange–act–assert, test data built by a helper with a clear name; the test list reads as the specification (as `pluginCatalog.test.ts` does). |
| **VHDL** | One entity, one job; processes short and named by purpose; the shared `hdlb_pkg` procedures instead of repeated string building; each plugin documents its behaviour table (as `uart_monitor` does) and has a self-checking testbench. |
| **Boy-scout rule** | Code touched for this feature is left cleaner than found, but unrelated clean-ups go in separate commits. |

Review checklist for each change: can every function be explained in one sentence; is any name misleading; is anything duplicated; is there a number without a name; does the test list read like the requirements.

---

## 9. Tests

| Level | Test |
|---|---|
| Unit (server) | `pluginLine.test.ts`: valid lines, empty and maximum-length payload, time > 2³¹, rejected headers, **oversized payload, CR, NUL, tab, non-ASCII**, routing, frame round-trip, frame body rule, `usesHdlboardLibrary` (12 cases) |
| Unit (server) | `session`: a `@@HDLB` line bypasses the `LOG` budget; a malformed one becomes `LOG`; rate summary and per-run cap summary reach the console; **a delayed line from the previous run, delivered while the next run is active, is not forwarded** (regression test for 6.1) |
| Unit (server) | `protocol`: `PLUGIN` encode/decode; shared fixture |
| Unit (server) | `pluginCatalog.test.ts` (14 tests): defaults, enabled kinds, files to analyse (shared package always first), hint for a disabled plugin and for a mistyped entity, routing of disabled kinds, routing of a kind no catalog row knows, `parsePluginIds` |
| Unit (server) | plugin root: resolution order (env, Electron directory, relative), missing directory → `internal` error naming the path and file |
| Unit (frontend) | `uartPayload.test.ts`; state model of 7.2 (key by kind, clear on `READY`, ring buffer, unknown kind); shared fixture |
| Integration (GHDL) | `uart_tx_tb`, `uart_monitor_fe_tb`, `uart_monitor_edge_tb` give the expected `PLUGIN` frames (`*.expected.txt`) |
| Integration (GHDL) | layouts of 2.1: design and testbench in `vhdl/`; design in `vhdl/` with a testbench in `work/` |
| Integration (GHDL) | no `library hdlboard` → plugin library not analysed, run unchanged; student entity `uart_monitor` in `work` → no clash; invalid `name` → run stops with the assertion message |
| **End-to-end (WebSocket)** | start a batch session, send `RUN` with `uart_tx_tb` + `uart_tx`, expect `READY`, four `PLUGIN` frames, `DONE`; then `RUN` again and confirm the second run contains only its own four frames |
| End-to-end (WebSocket) | mixed `report` and plugin output (each on its own path, order within each kept); a malformed `@@HDLB` line → `LOG`; unknown plugin kind reaches the client; plugin-budget overflow → summary; client disconnect during a flood → no exception, process killed; timeout → `ERROR`, no stale frames |
| Integration (GHDL) | enable/disable: with `rs232` enabled the example gives four `PLUGIN` frames; disabled, the same testbench fails with the `unit ... not found` error plus the hint, and a student's own `@@HDLB uart ...` print stays in the console |
| End-to-end (WebSocket) | `PLUGINS` before `RUN` is honoured, a second run with a different set uses the new set, a run without `PLUGINS` uses the defaults |
| Feasibility | `sh feasibility/run_feasibility.sh` (I2C, SPI, 1-Wire prototypes); rerun when `hdlb_pkg` changes |
| Platforms | see section 10 |


### 9.1 Stage 1 UI and editable plugin files

| Level | Test |
|---|---|
| Frontend unit | `PLUGIN` frames fill the plugin pane; no pane for a run without plugin lines; cleared on `READY`, kept after `DONE`; ring buffer drops the oldest and shows the count; unknown kind and invalid payload shown raw; copy yields the original `@@HDLB` lines |
| Frontend unit | Plugins page is absent with the setting off; with it off **no** `hdlboard/*` file is added to `RUN`; with it on all files of the enabled plugins are added (files of disabled plugins are not); Reset restores the shipped text; edits survive toggling the setting |
| Server unit | `hdlboard/` names outside the catalog set are rejected; a student file cannot use the prefix; size cap; files of a disabled plugin ignored |
| Server integration (GHDL) | an edited `uart_monitor.vhd` (changed default `baud`, or a new `kind` that no catalog row knows) is analysed instead of the shipped one and its output arrives as `PLUGIN`; the shipped file in the plugin root is unchanged afterwards; a syntax error in the edit gives `stage: 'plugin'` naming the file, a broken shipped file still `stage: 'internal'`; the "using edited files" notice is the first console line |
| Bundled sources | the bundled text of every catalog file equals the file in `server/plugins/vhdl/` (build check); a stored base hash that differs from the bundled one marks the file as changed and keeps the edited copy |
| End-to-end | WebSocket run of a UART testbench: console pane shows the four `Hei!` rows with the expected times; a second run clears them |

---

## 10. Verification status and cross-platform plan

| Item | Status |
|---|---|
| `hdlb_pkg`, `uart_monitor`, the three example testbenches | ✅ GHDL 4.1 (Linux), `run_examples.sh` passes |
| Name assertion (bad `name` stops the run) | ✅ GHDL 4.1 |
| Timestamp > 2³¹ ns | ✅ GHDL 4.1 |
| stdout delivered live through a pipe | ✅ GHDL 4.1 (Linux) |
| `pluginLine.ts`, `pluginCatalog.ts` | ✅ 49 tests in two files (Node test runner), type-check with `server/tsconfig.json` settings |
| I2C, SPI, 1-Wire prototype monitors | ✅ GHDL 4.1, `run_feasibility.sh` passes (not shipped) |
| Plugin line rate | ✅ measured on GHDL 4.1 / Linux: ≈ 24 000 lines/s testbench-driven, ≈ 100 lines/s with a 50 MHz design |
| `uartPayload.ts` | ✅ 18 tests (vitest), type-checks with `tsconfig.app.json` settings |
| GHDL 5.0.1 (Windows app), 6.0.0 (Docker) | ⏳ not yet tested |
| Server/frontend integration, WebSocket end-to-end | ⏳ not implemented |

The stdout-arrival check is only part of what is platform-sensitive. Each supported platform needs the full path run once, with the exact versions recorded in this table when done:

| Platform | Reproducible commands | Also check |
|---|---|---|
| Linux (development) | `sh docs/impl_files_for_plugins/examples/run_examples.sh`; `cd server && npm test && npm run test:integration` | – |
| Windows app | the same `ghdl` commands against `resources/ghdl/bin/ghdl.exe` and `resources/plugins/vhdl/` (PowerShell variant of the script); then the WebSocket end-to-end test against the packaged backend | CRLF in GHDL's stdout (handled by `lineSplitter`; add a test line that ends in `\r\n`), `--work=hdlboard` writing `hdlboard-obj08.cf` into a session directory with spaces, live delivery without buffering, process termination on `STOP`, ordering of `LOG` and `PLUGIN` under the pipe |
| Docker | `docker run` the image with the examples mounted, the end-to-end test against the container's port | plugin directory present in the **runtime** image, GHDL 6.0.0 time formatting of `now / 1 ns` |

Record per platform: GHDL version string (`ghdl --version`), installer revision or image tag, date.

---

## 11. Open questions

1. Final numbers for the plugin budget (rate, per-run cap, ring-buffer size).
2. Whether plugin lines should optionally also appear in the console (debug toggle).
3. GUI layout when a testbench uses several plugin types at once (the line format and the state model already support it).
4. A cap on a stdout line without any newline in `lineSplitter` (affects all output; separate change).
5. Whether a project file may carry its own list of enabled plugins, and which wins over the user's setting when both exist. Leaning: no per-project list in the first version – the need is already visible in the source (3.8, row 1).
6. Whether a hosted server may fix the enabled set for all users (for example an environment setting), so a teacher can run an exam with plugins off.
7. Default state: the proposal is "on" for every shipped plugin, because a plugin does nothing until a testbench instantiates it.
8. Where the Plugins section lives in the UI, and whether the run UI shows which plugins were enabled for a run.
9. Whether the I2C/SPI/1-Wire prototypes become shipped plugins as they are, or are first extended with the limits listed in 3.7 (LSB-first SPI, overdrive 1-Wire).
10. A generic **value probe** plugin (kind `probe`): prints a named signal value whenever it changes. It would give silent testbenches such as the SAP-1 one (3.8, row 5) a view in the GUI without hand-written `report` statements. Not part of the first version; the line protocol, the catalog and the budget already allow it.
11. *(Decided: the sources are bundled into the frontend, 6.4. Open only: whether Vite may import `server/plugins/vhdl/` with `?raw`, or the canonical copy moves to a shared folder.)*
12. *(Decided: no restriction on edited plugin files for now; a server-side switch can be added later if needed.)*
13. *(Decided: handled as in 7.4a – mark the file, keep the user's copy, choose Keep mine or Reset to shipped. A side-by-side diff may come later; automatic merge is not planned.)*

## 12. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| `plugin.json` with `params` (baud) and `implementations` | B2: a plugin is VHDL only, no config of its own |
| UART data as a polled snapshot via `output.txt` (like `LEDR`) | loses bytes when more than one arrives per 20 ms poll |
| Separate file channels (append files) for plugin data | unnecessary in batch: stdout is already ordered, lossless and delivered live |
| Timestamp from the wall clock (Node) | meaningless in batch; simulated time (`now`) is the right reference |
| `report` for plugin output | its `file:line:col:@time:(report note):` prefix hides the `@@HDLB` marker |
| Length framing or escaping so the payload can hold any text | adds a second parser at every hop for a need no plugin has; plugins encode their data (hex) |
| `WELCOME` capability flag for plugin support | the reverse case already fails loudly (6.3) |
| A lexer for dependency detection | the library-clause grammar is simple enough for a comment-blanking regex with tests |

---

## 13. Review log (2026-10-16)

An external review listed 13 points. Each was checked against the code and decided; the table shows what was taken.

| # | Point | Decision | Where |
|---|---|---|---|
| 1 | Old run's output attributed to the new run | **Accepted, narrowed.** The kill path already stops delivery and the exit handlers are identity-checked, but the output callback is not; a run generation is added and the client clears on `READY`. Regression test added. | 6.1, 9 |
| 2 | Payload framing and size | **Accepted.** Printable ASCII, 200 characters, one physical line; the same rule at all three hops. | 3.3, B6 |
| 3 | Rate vs. volume; summary delivery | **Accepted, one claim corrected.** A per-run cap and a frontend ring buffer are added. The summary cannot be dropped by the ordinary limiter: the existing limiter's summaries are sent with `sendLogLines`, not through `accept`, and the plugin summary does the same. The `endOutput` lifecycle is listed per event. | 6.2 |
| 4 | Invalid `name` / `kind` | **Accepted.** `name` is asserted at time 0 in the plugin; `kind` is the author's literal; `hdlb_emit` stays a formatter; the server stays strict. | 3.5, B7 |
| 5 | Frontend file selection | **Rejected as stated, documented instead.** `filesForRun` sends *all* files of the top file's folder plus a `work/` top, so a `work/` testbench does receive the design in `vhdl/`. The supported layouts are written down and tested. | 2.1, 9 |
| 6 | Plugin-library build contract | **Accepted.** Root resolution, exact arguments, all-or-nothing analysis, clean-up pattern, error text with file and command. | 5 |
| 7 | Dependency detection | **Accepted in part.** Specified grammar and a tested function instead of a lexer; `use` without a library clause is the student's error. | 5, `pluginLine.ts` |
| 8 | Protocol compatibility | **Accepted in part.** Malformed-frame policy and a shared test fixture added; a capability flag in `WELCOME` is rejected because the failure is already loud. | 6.3 |
| 9 | UI lifecycle and call sites | **Accepted.** State model table; the two `HdlClient` construction sites listed. | 7.2, 7.4 |
| 10 | UART semantics | **Accepted.** Behaviour table; `XX` for undefined data bits; baud limit; edge testbench covering glitch, initial `U`, back-to-back bytes, undefined bit, non-default baud. | 4.2 |
| 11 | Cross-platform validation | **Accepted** as a plan; not yet executed here (no Windows or Docker available). | 10 |
| 12 | Diagnostics and packaging | **Accepted in part.** Diagnostics come only from a run, so there is no second model to update. The packaging gaps are real (the Dockerfile copies only `server/src/`) and are listed as release-blocking. | 2, 8.1 |
| 13 | End-to-end tests | **Accepted.** Listed with the cases named in the review. | 9 |
