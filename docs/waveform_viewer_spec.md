# Waveform viewer – requirements and implementation spec

> **Status:** revised 2026-10-17 after three external reviews (section 18). Steps 0–4, 6 and 7 implemented on branch `impl_waveform_viewer` (section 19); steps 5, 8 and 9 – the student mockup, characterization on GHDL 5.0.1 and the usability test – are still open.
> **Primary goal:** the viewer must be **easy to use for beginners** in VHDL and Verilog. Where a feature conflicts with simplicity, simplicity wins (section 5.1).
> **Scope:** a waveform viewer for testbench (batch) runs, for both VHDL (GHDL) and Verilog (Icarus Verilog). The first release to students shows **FSM states by name** (GHW, W2). Board-mode capture is a later stage and only sketched here (section 10).
> **Input reviewed:** a ChatGPT answer to "what is the requirement for a HDL waveform viewer using GHDL" (assessed in section 3), reviews of this spec by Mistral, Microsoft Copilot and Grok (section 18), the current HDLBoard code (`server/src/session.ts`, `engines/*`, `runtime.ts`, `protocol.ts`, `src/components/workbench/*`), and tool behaviour measured with GHDL 4.1.0 and Icarus Verilog 12.0 (section 4).
> **Related:** [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) · [`Verilog_implementation_plan.md`](Verilog_implementation_plan.md) · [`plugin_batch_implementation_plan.md`](plugin_batch_implementation_plan.md) · [`Impl_project_file_and_online_storage.md`](Impl_project_file_and_online_storage.md)

---

## 1. Decisions

| # | Decision |
|---|---|
| W0 | **Simplicity first.** The users are beginners. The first waveform must appear with one click and no configuration; every screen uses plain words; advanced functions stay out of sight until asked for (section 5.1). |
| W1 | Waveforms are recorded for **batch (testbench) runs only** in the first version. A board run is free-running and never ends, so dumping everything is not viable (section 10). |
| W2 | **VHDL uses GHW, Verilog uses VCD.** GHW is GHDL's own format and carries every VHDL type – above all **enumerations, so FSM states are shown by name** (`IDLE`, `RUN`, …), which is what helps students understand state machines. Icarus writes VCD through a generated helper module (7.3). The VCD parser is built first and also reads GHDL's VCD, so the UI can be developed before the GHW parser exists; **the release to students waits for GHW** (section 12). FST is not used (4, 6.2). |
| W3 | Generation, transport, parsing and rendering are **separate layers**, joined by one format-neutral data model (`WaveformData`, 8.2). A parser is the only part that knows a file format. |
| W4 | **Parsing happens in the browser**, in a Web Worker. The backend only produces the file and sends it on request. This keeps the viewer unchanged if GHDL later moves into the browser as WebAssembly (section 11). |
| W5 | The file is **kept on the server and fetched on demand** over the existing session WebSocket, gzip-compressed, in binary frames (7.4). It is only sent when the student opens the waveform (or downloads it), never after every run. There is no HTTP file route and no file path is ever sent to the client. |
| W6 | **Size, not time, is the guard.** No implicit `--stop-time`: a testbench runs exactly as it does today. The server stops a run whose waveform passes `HDL_MAX_WAVE_BYTES` (16 MiB) and keeps what was recorded, with a clear message (7.5). A user-set "Stop at" time is a stage-2 option. |
| W7 | The viewer is a **custom React + TypeScript + Canvas component** with no new runtime dependencies, following the stack and Clean Code rules of [`Design_Description.md` § 1](Design_Description.md#1-mandate). Embedding Surfer and launching GTKWave were considered and rejected for now (6.3); **Download waveform** in the ⋯ menu covers anyone who wants an external viewer. The parser is built as a measured prototype first (step 1), because it is the largest technical risk. |
| W8 | The viewer is opened with a **Waveform** button directly to the **left of Clear** in the *Simulator Output / Status* band, and from links in the console (FR-16, FR-25). It is shown **in the editor area, in place of the testbench/RTL split view** – a waveform only exists after a simulated testbench, which is exactly when that split view is in use. **Closing** brings back the split view with the testbench and its RTL design. The way back to the code is always **one click**: "Go to declaration" on a signal (FR-18) and Close. A later option is to let the waveform cover only the testbench half, so the RTL code stays beside it (Q8). |
| W9 | **Honest about what is missing.** Signals that the format cannot carry are listed, greyed out, with the reason – never silently dropped (FR-11). |
| W10 | A waveform always belongs to **one run**. A new run marks the old waveform stale at once; a stopped or replaced run's waveform is never shown as the new run's (same rule as plugin output, B8). |
| W11 | **Start where the problem is.** When the testbench reported an error, the waveform opens zoomed in at the first error, with the cursor and a red marker there (FR-26). |

---

## 2. Background: how HDLBoard runs a design today

| | Board run | Batch run |
|---|---|---|
| When | The top has board ports (`SW`, `KEY`, `LEDR`, `HEX`, `CLOCK_50`, …) | The top has no ports – a self-checking testbench |
| What runs | The generated wrapper `hdl_board_tb` (VHDL) / board testbench (Verilog) around the student's design | The student's own top, directly (`ghdl -r <tb>`, `vvp sim.vvp`) |
| How long | Until Stop/Reset – the wrapper loops on purpose, paced to real time | Until the testbench ends, bounded by `BATCH_TIMEOUT_MS` (60 s real time) |
| Output | `STATE` frames polled every 20 ms, `LOG` lines through the output limiter | `LOG` lines, `PLUGIN` lines, then `DONE completed` |

The backend speaks a text-frame protocol over one WebSocket per session (`/hdlsim`); in server mode the HTTP port serves nothing but the GitHub sign-in routes. Each session has its own temp directory, cleared of the previous run's library before each run. These facts shape the transport (W5) and the scope (W1).

---

## 3. Assessment of the ChatGPT proposal

The proposal is a sound general outline. What carries over, what needs correcting, and what it misses for HDLBoard specifically:

**Carried over**

- Keep generation, parsing and rendering separate; put the parser behind an interface so a second format can be added (W3).
- Canvas for the traces, React for controls; never one React component per edge (8.5).
- Worker-based parsing; a stale waveform must never be shown after a rerun (W4, W10).
- Delta cycles: GHDL's VCD records values before each non-delta cycle, so the viewer must not claim to show delta-cycle events (NFR-6).
- Most of the acceptance criteria (section 15).

**Corrections**

| ChatGPT said | For HDLBoard |
|---|---|
| "Return the waveform file location to the frontend" | There is no file route in server mode, and a path means nothing to a browser on another machine. The file content goes over the session's WebSocket (W5). |
| Example uses `--stop-time=10us` on every run | A stop time changes what a testbench does. HDLBoard keeps today's semantics and guards with a size limit instead (W6). |
| VCD first; GHW and "VHDL records, enumerations" are a later concern | Enumerations are FSM state types – the most common thing a PB1180 student wants to see. GHDL's VCD only writes `$comment state is not handled $end` for them (4). GHW is therefore part of the first release to students (W2). |
| "Display U, X, Z, W, L, H and - where the source format preserves them" | GHDL's VCD **does** preserve them by default (`U(` in the file), which is outside the VCD standard (`0 1 x z`). A third-party VCD parser may reject or misread these files – one more reason to write our own (8.3). |

**Missing**

1. **Verilog.** HDLBoard runs Icarus Verilog too; the viewer must be engine-neutral, and Icarus needs a different way to request a dump (7.3).
2. **Board vs batch mode.** A board run never ends; a free-running 50 MHz clock produced ≈ 7 MB of VCD per real second in our test (4). Batch only in the first version (W1).
3. **Truncated files.** A stopped run leaves a VCD or GHW file cut off; an FST file is then empty (4). The parsers must accept a truncated tail.
4. **Time precision.** GHDL's timescale is 1 fs; a JavaScript number is exact only up to 2⁵³ ≈ 9 s of simulated time at that resolution (NFR-2).
5. **Bandwidth on the hosted service.** Send only when asked for, gzip-compressed (W5).
6. **Plugin monitors** (`library hdlboard`) appear in the hierarchy as instances; they should be grouped, not mixed with the design (FR-4).
7. **Links into the rest of HDLBoard:** report lines in the console carry `@<time>`, plugin lines carry simulated time – both open the waveform at that time (FR-16).
8. **The planned move of GHDL to WebAssembly**, which favours parsing in the browser (W4, section 11).

---

## 4. Verified tool behaviour

Measured 2026-10-17 with GHDL 4.1.0 (mcode) and Icarus Verilog 12.0 on Linux; GHW files were cross-checked with the `wellen` reader (pywellen). The shipped versions (GHDL 5.0.1 in the Windows app, 6.0.0 in Docker) must be re-checked by the characterization tests in section 14.

| Observation | Consequence |
|---|---|
| GHDL VCD `$timescale` is `1 fs`; Icarus uses the design's precision (`1ps` with `` `timescale 1ns/1ps ``, HDLBoard's shared timescale file). | Times are integer ticks of the file's timescale; display converts. |
| GHDL's VCD carries `std_logic`, `std_logic_vector`, `unsigned`, `signed`, `bit_vector`, `boolean` (as 1 bit), `integer` (32-bit vector) and `real`. | Enough for Verilog-like designs and for developing the UI. |
| GHDL's VCD writes `$comment state is not handled $end` for an enumeration, and the same for records and `character`. | Parse these comments and list the signals as unavailable (FR-11). |
| **GHW carries every type of the test design:** the enumeration with its type name and literals (`state_t`: `idle`, `run`, `done`), the record's fields (`a`, `b`) and `character`. | VHDL uses GHW (W2); FSM states are shown by name. |
| Same never-ending design stopped after 2 s real time: **GHW 3.7 MB, VCD 14 MB.** | GHW is about 4× smaller – more simulated time fits under the size limit. |
| A GHW file from a stopped run (SIGTERM or SIGKILL) has a complete hierarchy and complete cycles up to the cut; `wellen` refuses the whole file ("failed to parse a leb128 encoded number"). | Our GHW parser must stop at the last complete cycle instead of failing (8.3). One more reason to write it ourselves (Q1). Proven with stored files in step 0 before the design is implemented. |
| GHDL writes `U`, `W`, `L`, `H`, `-` as-is in VCD (e.g. `U(`), unless `--vcd-4states`. | The VCD parser accepts all nine `std_logic` values. Do **not** pass `--vcd-4states`. |
| GHDL emits empty package scopes (`standard`, `textio`, `std_logic_1164`, `numeric_std`). | Hide empty scopes. |
| GHDL gives a port and the signal it is connected to separate identifier codes; Icarus shares one code between them (`"` for `clk` in two scopes). | The model maps many signal references to one trace (8.2). The default view shows only the testbench level, so the same value does not appear twice there. |
| Icarus writes vectors left-compressed (`b0 !` for a 4-bit zero, `bx $`) and puts the range after a space (`q [3:0]`); GHDL writes `q[3:0]`. | Left-extend per the VCD rules; parse both range spellings. |
| `ghdl -r tb --stop-time=300ns` exits with 0 and prints `ghdl:info: simulation stopped by --stop-time @300ns` on stdout. | Recognise the line and show a friendly message (7.6, stage 2). |
| Icarus prints `VCD info: dumpfile wave.vcd opened for output.` on stdout. | Filter this line out of the console when HDLBoard requested the dump. |
| A free-running 10 ns clock plus a 4-bit counter: 14 MB of VCD after 2 s real time (4.36 ms simulated) – about 3.3 MB per simulated millisecond. | Size guard required (W6). |
| GHDL stopped with SIGTERM or SIGKILL: the VCD is cut off mid-record. | The VCD parser drops an incomplete last line and time step (8.3). |
| GHDL with `--fst=` stopped after 2 s: a 330-byte file with no usable data. | FST is unsuitable when runs can be stopped (6.2). |
| Icarus: a separate module with `$dumpfile`/`$dumpvars(0, <top>)`, compiled as a second root (`-s <top> -s hdlboard_wave`), dumps the whole design without touching the student's files. | This is how the Verilog engine requests a dump (7.3). |
| HDLBoard compiles Verilog without `-g2012`, so SystemVerilog time literals such as `#2ms` are not valid. | Delays in generated Verilog are plain numbers in the shared timescale's unit, `1ns` (7.3). |

---

## 5. Users and use cases

The users are BSc students in their first HDL courses (PB1180) and their teachers. The viewer must answer the questions a student asks after a testbench fails:

- *What did my signals do?* – see the stimuli and the design's response over time.
- *When did it go wrong?* – open the waveform at the first failing `assert`/`report` (W11, FR-16).
- *What state was my FSM in?* – state names on the bus (W2).
- *Why is this `U` / `X`?* – an uninitialised register, two drivers, a missing reset must stand out, and the way to the code must be one click (FR-18).
- *How long is this pulse / what is this clock?* – measure between two markers (stage 2).

A teacher additionally wants to ship an example project that opens with a sensible set of signals already shown (FR-21), and to receive a student's waveform file when helping remotely (Download, FR-20).

**Advanced users** who need timing that matches the hardware use ModelSim/Questa and the vendor tools (9.3). The viewer is not designed for them.

### 5.1 Simplicity rules

Ease of use is the primary goal. Every design choice in this spec is checked against these rules:

| # | Rule | What it means in practice |
|---|---|---|
| S1 | **One click to the first waveform.** | Recording is on by default; after a testbench run the student presses **Waveform** – or the link in the console – and sees the testbench's signals already laid out (FR-1, FR-5). No signal picking, no file, no settings. |
| S2 | **It is always clear where to go.** | The button sits where the run's result is reported (beside Clear). Until the student has opened a waveform once, every testbench run also ends with a console line *"✓ Testbench finished – Open waveform"* (FR-25). The button is greyed out with a short explanation when there is nothing to show, and highlighted when a new waveform is ready (FR-24). |
| S3 | **Few controls on screen.** | Toolbar: Zoom in, Zoom out, Fit, Close – and the time at the cursor. Everything else ("Show as", download, later markers) is in a right-click menu on a signal or a small **⋯** menu, never on the main bar. |
| S4 | **Plain words.** | "Show as: Binary / Hexadecimal / Decimal" rather than "radix"; "Time" and "ns/µs" rather than "ticks" or "fs"; no file-format names in the UI except in Download. |
| S5 | **The viewer teaches.** | Hovering a value explains it: a red `U` band says *"U – not initialised: this signal has never been given a value. Give it a reset value or an initial value."* (FR-23). Missing signals are explained the same way (FR-11). |
| S6 | **Nothing can be lost or broken.** | The viewer is read-only. Closing it always brings back the code exactly as it was (W8). Zooming or scrolling never changes data. |
| S7 | **Sensible defaults over options.** | Vectors show as hexadecimal (`0x41`), integers as decimal, enumerations by name, single bits as levels; units are chosen automatically. A setting is added only when a default cannot serve the course. One way of working – no separate "beginner mode". |
| S8 | **Values are text first.** | The value column beside the signal names is the main way beginners read a simulation (`count = 15`), so it is large, aligned and always visible. The traces show *when* things change. |
| S9 | **Familiar gestures.** | Mouse wheel scrolls in time, Ctrl + wheel zooms, click places the cursor, double-click on a bus zooms to that value. Keyboard shortcuts exist but are never required. |

---

## 6. Architecture

### 6.1 Layers

```
 ┌─────────────── backend (Node) ────────────────┐      ┌──────────────────────── browser ─────────────────────────┐
 │ engine.prepare()  → plan with wave file name  │      │ hdlClient  WAVE-READY ─► (view open / Download) WAVE-GET  │
 │ engine.startBatchRun() → simulator writes     │ WS   │            WAVE-BEGIN / binary chunks / WAVE-END          │
 │   wave-<run>.ghw|.vcd in the session dir      │ ◄──► │   ▼                                                       │
 │ session: size watchdog; WAVE-READY;           │      │ waveWorker  gunzip → parseGhw / parseVcd → WaveformData   │
 │   on WAVE-GET: gzip, chunk, send              │      │   ▼        (transferable typed arrays)                    │
 └───────────────────────────────────────────────┘      │ WaveformPane  signal list · toolbar · WaveCanvas          │
                                                         └───────────────────────────────────────────────────────────┘
```

### 6.2 Format strategy

| Format | Engines | Types | Stopped run | Size (same 2 s run) | Use |
|---|---|---|---|---|---|
| GHW | GHDL only | **All VHDL types** – enums by name, records, `character` | Hierarchy and complete cycles kept; tail cut | 3.7 MB | **VHDL** in the student release |
| VCD | GHDL, Icarus | GHDL: logic, vectors, integer, boolean, real – no enums, records | Usable, minus the last line | 14 MB | **Verilog**; VHDL during development (steps 1–5) |
| FST | GHDL, Icarus | Same as VCD | Empty file | – | Not used |

Both parsers produce the same `WaveformData`, so the UI never knows which one it got.

### 6.3 Build or embed

| Option | For | Against |
|---|---|---|
| **Custom viewer (chosen)** | Same stack as the rest of HDLBoard; no new toolchain; can link to the editor, console, plugins and project file; looks like HDLBoard; works offline in the Windows app with nothing extra; our GHW parser can accept truncated files | We write the parsers and the renderer – the largest risk, handled by the measured prototype of step 1 |
| Embed Surfer (WASM, iframe, `postMessage`) | VCD, FST and GHW at once; mature feature set | Its message API is documented as unstable; a large WASM bundle to ship and host; a different look; deep links (editor, console, project file) limited to what the API offers; its GHW reader (`wellen`) refuses truncated files (4); EUPL-1.2 licence to clear against GPL-2.0-only |
| Launch GTKWave | Feature-rich | Desktop only; nothing for the hosted service; outside the student's single window |

---

## 7. Backend implementation

### 7.1 Requesting a waveform (protocol)

A new client frame, sent before `RUN` and captured when the run starts – the same pattern as `PLUGINS`:

```
WAVE off
WAVE on
WAVE on stop=2ms        (stage 2)
```

- `off` (also the state of a client that never sends `WAVE`): no file, the run is exactly as today.
- `on`: record. The engine picks the format: GHW for VHDL, VCD for Verilog (W2). During development a server setting `HDL_WAVE_VHDL_FORMAT=vcd` keeps VHDL on VCD until the GHW parser is merged.
- `stop=<time>` (stage 2): the run stops at that simulated time. Accepted units `fs ps ns us ms sec`, no spaces – the grammar of GHDL's own option.

`WAVE` is ignored for board runs (W1).

### 7.2 Engine seam (`engines/types.ts`)

```ts
/** What a run asks of the waveform recorder; omitted, nothing is recorded. */
export interface WaveRequest {
  /** Simulated time at which the run stops (stage 2), in GHDL's notation (`2ms`); omitted, the testbench decides. */
  readonly stopTime?: string;
}

export type WaveFormat = 'ghw' | 'vcd';

export interface PrepareRequest {
  // … unchanged …
  readonly wave?: WaveRequest;
  /** The waveform file name the session chose for this run, without extension. */
  readonly waveBaseName?: string;
}

export interface RunPlan {
  // … unchanged …
  /** The waveform this run writes, relative to `dir`; absent when none was requested or the mode does not record. */
  readonly wave?: { readonly format: WaveFormat; readonly fileName: string };
}
```

The session chooses the base name (`wave-<run>`, unique per run for the same reason the heartbeat file is); the engine adds the extension of its format. Engines never invent paths (M11).

### 7.3 Engines

**GHDL (`ghdlEngine.ts`, `ghdl.ts`).** `runBatch` gains the wave arguments, after the entity name:

```ts
const WAVE_OPTION: Readonly<Record<WaveFormat, string>> = { ghw: '--wave=', vcd: '--vcd=' };

const waveArguments = (wave: RunPlan['wave'], stopTime?: string): string[] => [
  ...(wave === undefined ? [] : [`${WAVE_OPTION[wave.format]}${wave.fileName}`]),
  ...(stopTime === undefined ? [] : [`--stop-time=${stopTime}`]),
];
```

`spawn` with an argument array as everywhere else; the stop time is validated against the grammar in 7.1 before it reaches a command line.

**Icarus (`verilogEngine.ts`, new `verilog/waveModule.ts`).** A generated helper module, compiled as an extra root with `-s <top> -s hdlboard_wave`:

```verilog
module hdlboard_wave;
  initial begin
    $dumpfile("wave-7.vcd");
    $dumpvars(0, <top>);
  end
  // stage 2, only with stop=: the time converted to the shared 1 ns unit, e.g. 2ms → 2000000
  initial #2000000 $finish;
endmodule
```

The delay is a plain number in the unit of HDLBoard's shared timescale file (`` `timescale 1ns/1ps ``), because Verilog is compiled without `-g2012` and SystemVerilog time literals (`#2ms`) are not valid (4). A stop time that is not a whole number of nanoseconds is rounded up and the console says so.

**A student's own dump.** Icarus allows only one dump per run, so the helper is added only when the student's sources do not ask for one:

1. Every Verilog source and header sent with the run (`.v`, `.vh`, `.sv`) is scanned with a comment- and string-aware tokenizer for the system tasks `$dumpfile`, `$dumpvars`, `$dumpon`, `$dumpall`. The scan only decides whether to add the helper; it does not try to understand the student's code (an `$dumpvars` inside an `if` counts as present).
2. If one is found, no helper is added. After the run, the session looks for the student's file: the string-literal argument of `$dumpfile` if it is a plain file name ending in `.vcd` (no path separators), otherwise Icarus's default `dump.vcd`. If that file exists in the session directory, it is the run's waveform.
3. If none is found, the console says once: *"Your testbench writes its own waveform settings, so HDLBoard could not record this run. Remove `$dumpfile`/`$dumpvars` to use the viewer."*

**Plugin library.** Plugin monitors are instantiated by the student's testbench and therefore dumped with it. Nothing changes in the engines; the viewer groups them (FR-4).

### 7.4 Making the file available (`session.ts`, `protocol.ts`)

The file stays in the session directory and is sent only when the browser asks for it (W5). This saves bandwidth and parse time for every run whose waveform is never opened.

```
server → WAVE-READY <run> <format> <bytes> <status>   text frame, sent before DONE when the run wrote a waveform
                                                        status = complete | stopped | timeout | size-limit
client → WAVE-GET <run>                                when the view is open, the student opens it, or Download
server → WAVE-BEGIN <run> <bytes>                       text frame; <bytes> = uncompressed size, for progress
         <binary frame> … <binary frame>               gzip stream, ≤ 1 MiB per frame
         WAVE-END <run>                                 text frame
server → WAVE-NONE <run>                               instead of WAVE-BEGIN when that run's file is gone
```

- `<run>` is the session's output generation (W10). `WAVE-GET` for any run but the newest is answered with `WAVE-NONE`.
- When the waveform view is already open as a run finishes, the client sends `WAVE-GET` at once, so the view updates by itself.
- Compression: `zlib.createGzip()` streamed from the file; the server never holds the whole file in memory.
- Binary frames are new to this protocol. The grammar of § 6.2 of the GHDL plan stays the rule for text frames; a binary frame is only valid between `WAVE-BEGIN` and `WAVE-END`, and is a protocol error anywhere else.
- A run that wrote no file (stopped before it started) sends no `WAVE-READY`; the console line says why.
- The file is deleted when the next `RUN` starts, on Reset, and at session teardown.

### 7.5 Size guard and settings (`settings.ts`)

| Setting | Default | Meaning |
|---|---|---|
| `HDL_MAX_WAVE_BYTES` | 16 MiB | Largest waveform file a run may write. |
| `HDL_WAVE_CHECK_MS` | 250 | How often the session checks the file size while a run is going. |
| `HDL_WAVE_VHDL_FORMAT` | `ghw` | `vcd` only during development, until the GHW parser is merged (7.1). |

A typical beginner testbench writes a few kilobytes (`adder4_tb` simulates 2.6 µs). 16 MiB is reached by a never-ending testbench after roughly 2 s real time with VCD and 9 s with GHW (4) – far sooner than today's 60-second timeout – and parses in well under a second (NFR-1).

When the file passes the limit, the session stops the run (SIGTERM), keeps what was written and reports status `size-limit`. The console says, for example:

> The waveform got too large (16 MiB) at 18.2 ms simulated time, so the simulation was stopped there. Your testbench probably never ends – a clock process that runs forever. End it with `std.env.stop;` (VHDL-2008) or `$finish;` (Verilog) when the test is done.

**Fallback for a GHW file that cannot be read** (only if step 0 shows that stopped GHW files are unreadable): the file is still kept on the server like any other waveform, so **Download** offers it, and the view says in one sentence that this run's waveform could not be shown because the run was stopped. A complete run – the normal case for a correct testbench – is never affected.

`HOSTING_SIZING.md` must add the worst case: `HDL_MAX_SESSIONS × HDL_MAX_WAVE_BYTES` of temporary disk (32 × 16 MiB = 512 MiB with the defaults).

### 7.6 Console lines

| Simulator line | Shown as |
|---|---|
| `VCD info: dumpfile wave-7.vcd opened for output.` | Hidden, when HDLBoard added the dump |
| `ghdl:info: simulation stopped by --stop-time @2ms` (stage 2) | `Simulation stopped at 2 ms (Stop at).` |

The translation lives in one pure function with tests, beside the existing console helpers.

---

## 8. Frontend implementation

### 8.1 Module layout

A new folder `src/components/waveform/`, one responsibility per file:

| File | Responsibility |
|---|---|
| `model.ts` | The types of 8.2. No logic. |
| `vcdParser.ts` | VCD text → `WaveformData`. Pure. |
| `ghwParser.ts` | GHW bytes → `WaveformData`, tolerant of a truncated tail. Pure. |
| `waveWorker.ts` | Gunzip (`DecompressionStream('gzip')`), pick the parser, post the result with transferable arrays. |
| `valueAt.ts` | Binary search: the value of a trace at a time; next/previous change. |
| `radix.ts` | Vector value → text in binary / hex / unsigned / signed / ASCII; `X`/`Z`/`U` nibbles shown as such. |
| `timeAxis.ts` | Time ↔ pixel mapping, 1-2-5 tick steps, unit choice. Extends `plugins/simTime.ts` to fs/ps. |
| `levelOfDetail.ts` | Collapses changes closer than one pixel into a "busy" span. |
| `waveDraw.ts` | Pure Canvas 2D drawing of one row: scalar, bus, busy span, cursor, error marker. |
| `consoleTimes.ts` | Finds `@<time>` and the first error in console lines (FR-16, FR-26). Pure. |
| `initialView.ts` | First view of a waveform: shown signals, zoom window, cursor (FR-5, FR-26). Pure. |
| `valueHelp.ts` | Plain-language explanations of `std_logic` values and of missing signals (FR-11, FR-23). Pure. |
| `useWaveform.ts` | `WAVE-READY` / `WAVE-GET` / chunks from `hdlClient`; owns the worker, run number and stale state. |
| `WaveformPane.tsx` | The view shown in place of the split view: toolbar, signal list, canvas. |
| `WaveformButton.tsx` | The launch button in the console header and its states (8.6). |
| `SignalList.tsx`, `WaveToolbar.tsx`, `WaveCanvas.tsx` | The parts of the pane. |
| `Waveform.css` | Plain CSS; trace colours are custom properties read once by the canvas. |

### 8.2 Data model

```ts
/** Integer ticks of the file's timescale – exact while below 2^53. */
export type Ticks = number;

export interface WaveformData {
  readonly source: { readonly format: 'ghw' | 'vcd'; readonly status: RunWaveStatus; readonly truncated: boolean };
  /** Length of one tick in femtoseconds (1 for GHDL, 1000 for `1ps`). */
  readonly tickFs: number;
  readonly endTime: Ticks;
  readonly root: Scope;
  /** One trace per distinct value stream; several signals may share one (Icarus aliases). */
  readonly traces: ReadonlyMap<TraceId, Trace>;
}

export interface Scope {
  readonly name: string;
  readonly kind: 'design' | 'instance' | 'package' | 'plugin';
  readonly scopes: readonly Scope[];
  readonly signals: readonly SignalRef[];
  /** Signals the format could not carry, with the reason shown in the list (FR-11). */
  readonly unavailable: readonly { readonly name: string; readonly reason: UnavailableReason }[];
}

export interface SignalRef {
  readonly name: string;
  readonly trace: TraceId;
  readonly kind: 'logic' | 'vector' | 'integer' | 'real' | 'enum' | 'record' | 'character';
  readonly width: number;
  readonly range?: { readonly left: number; readonly right: number };
  /** For `enum`: the type name and its literals in order (`state_t`: idle, run, done). */
  readonly enumType?: { readonly name: string; readonly literals: readonly string[] };
  /** For `record`: its fields, shown folded under the record. */
  readonly fields?: readonly SignalRef[];
}

export interface Trace {
  /** Ascending change times. */
  readonly times: Float64Array;
  /** Index into `values` for each change. */
  readonly valueIndex: Uint32Array;
  /** Distinct values, interned: '0', '1', 'U', '0101', 'IDLE', '3.5', … */
  readonly values: readonly string[];
}
```

Interning keeps memory small: a clock has two values however long it runs, an FSM as many as it has states.

### 8.3 Parser rules

**VCD (`vcdParser.ts`)**

1. Tokenise on whitespace, streaming over chunks, so a large file never exists as one string.
2. Accept `$timescale` in both spellings (`1 fs`, `1ps`).
3. `$scope` / `$upscope` build the tree; empty scopes are dropped at the end.
4. `$var <type> <width> <id> <name> [range] $end` – the range may be attached (`q[3:0]`) or separate (`q [3:0]`).
5. `$comment <name> is not handled $end` → an `unavailable` entry (FR-11).
6. Scalar values: any of `0 1 x z u w l h -` (case-insensitive, stored upper-case).
7. Vectors `b…`: left-extend to the declared width – with the leading character if it is `x` or `z`, else `0`.
8. `r…` real values are kept as text and parsed for display only.
9. `$dumpvars`, `$dumpall`, `$dumpon`, `$dumpoff` blocks are value blocks.
10. A time step is committed only when the next `#` or the end of a complete file is reached; an incomplete last line or time step is dropped and `truncated` is set.
11. Times are parsed as `BigInt` and rejected with a clear message above `Number.MAX_SAFE_INTEGER` (NFR-2).
12. Instances of entities from `library hdlboard` – the plugin monitors – are marked `kind: 'plugin'`, recognised from the plugin catalog's entity names.

**GHW (`ghwParser.ts`)**

1. Read the sections in order: header, string table, type table, hierarchy, end of hierarchy, then snapshot and cycle records.
2. Enumeration types give `enumType` (type name and literals); `std_logic`/`std_ulogic`, `bit` and `boolean` are mapped to `logic`, arrays of them to `vector`; records give `fields`; `character` is shown as the character.
3. A section or cycle that ends before its data is complete is the **end of the data**, not an error: keep everything before it and set `truncated` (4).
4. Rules 3, 11 and 12 of the VCD parser apply as well.

### 8.4 Worker and memory

- The worker receives the compressed chunks as they arrive and starts parsing before `WAVE-END`; the view shows progress (received / parsed) only if loading takes longer than half a second.
- The result's typed arrays are **transferred**, not copied, to the main thread.
- Only the newest run's data is kept. When a new run starts the old data is marked stale (W10) and released when the new waveform arrives.

### 8.5 Rendering

- One `<canvas>` for the traces, sized to the device pixel ratio; React renders the toolbar and the signal list with its value column.
- Only visible rows and the visible time window are drawn; `levelOfDetail.ts` replaces runs of sub-pixel changes with a filled busy span, so drawing cost depends on the screen width, not on the number of changes.
- Redraw on `requestAnimationFrame` after a change of view, cursor or data – never per data point.

| Value | Drawn as |
|---|---|
| `0` / `1` (and `L` / `H`) | Low / high line; `L`/`H` dashed (weak) |
| `Z` | Line at mid-height |
| `U` | Red filled band – the student's most common error, it must stand out |
| `X`, `W` | Red hatched band |
| `-` | Grey band |
| Vector, integer | Bus shape (two lines, crossing at each change) with the value text when it fits – vectors as `0x41` by default; red if any bit is `U`/`X`/`W` |
| Enumeration (FSM state) | Bus shape with the state name (`IDLE`, `RUN`) – the most important text in an FSM exercise, never abbreviated while it fits |
| Error marker | Vertical red line at the first error's time, with the report text in its tooltip (FR-26) |

Colours are tokens in `Waveform.css` (`--wv-trace-high`, `--wv-trace-undefined`, `--wv-error-marker`, …), not constants in TypeScript.

### 8.6 Place in the workbench

**Launch button.** A **Waveform** button sits directly to the **left of Clear** in the header of the *Simulator Output / Status* band (`ConsoleOutput.tsx`, `wb-console__header`):

```
┌ Simulator Output / Status ───────────────────────────────────── [〰 Waveform] [Clear] ┐
│ adder4_tb.vhdl:28:21:@1230ns:(report error): 7 + 5 gave 11                            │
│ adder4_tb.vhdl:41:9:@2590ns:(report note): FAIL: 1 of 256 wrong                       │
│ ✓ Testbench finished – Open waveform                                                  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

| Button state | When | Tooltip |
|---|---|---|
| Disabled | No waveform yet in this session, or the last run was a board run | "Run a testbench to see its waveform. Board simulations do not record waveforms." |
| Enabled, highlighted (dot) | A new waveform is ready and has not been opened | "Show the waveform of the last testbench run" |
| Enabled | A waveform exists and has been seen | same |
| Pressed | The waveform view is open | "Close the waveform and show the code" |

**Console links.** Two kinds of text in the console open the waveform:

- The line *"✓ Testbench finished – Open waveform"*, added by the frontend after each testbench run that produced a waveform, **until the student has opened a waveform once** in this browser (remembered locally). After that the button alone is enough (S2).
- Every `@<time>` in a report line (`…:@1230ns:(report error):…`) and every time stamp in plugin output is a link: it opens the waveform with the cursor at that time (FR-16).

**Where the waveform is shown.** The waveform view takes the place of the **testbench/RTL split view** in the editor column. A waveform only exists after a simulated testbench, which is exactly when that split view is in use – and the console with the run's messages stays visible underneath it.

```
┌ Explorer ┐┌ Waveform – fsm_tb ─────────────────────── Time 1.230 µs  [−][+][Fit] [⋯] [✕] ┐┌ Board ┐
│          ││ Signal         Value   │1.0 µs        1.1 µs        1.2 µs ┃      1.3 µs      ││       │
│          ││ clk            1       │▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔▁▔┃▁▔▁▔▁▔▁▔▁▔▁▔▁▔   ││       │
│          ││ reset          0       │▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁┃▁▁▁▁▁▁▁▁▁▁▁▁▁▁   ││       │
│          ││ a              7       │⟨ 6          ⟩⟨ 7                  ┃              ⟩   ││       │
│          ││ sum            0B      │⟨ 0A         ⟩⟨ 0B                 ┃              ⟩   ││       │
│          ││ state          RUN     │⟨ IDLE  ⟩⟨ RUN                     ┃     ⟩⟨ DONE  ⟩   ││       │
│          ││ ▸ dut                  │                                    ┃ first error      ││       │
│          ││ 3 more signals – Show all                                                       ││       │
└──────────┘└───────────────────────────────────────────────────────────────────────────────┘└───────┘
┌ Simulator Output / Status ──────────────────────────────────────────────── [〰 Waveform] [Clear] ┐
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Opening:** the split view is replaced by the waveform view. The editor underneath is made `inert`, as the existing overlay pages (Project, Examples, Plugins) already do, so no keystroke goes into hidden code.
- **First view** (FR-5, FR-26): if the testbench reported an error, the view is zoomed in around the first error (a window of a tenth of the run, at least 20 clock periods when a clock is found), with the cursor and a red marker there. Otherwise the whole run is fitted and the cursor is at the last report line's time, or at 0 when there is none.
- **Closing** (the **✕**, the pressed Waveform button, or `Esc`): the **split view with the testbench and its RTL design** is shown again – the testbench that produced the waveform on the left, the design it tests on the right (`useTestbenchSplit` pins the pair of the run's testbench, `pinView('both')`), with caret and scroll position as they were. In a column too narrow for two panes, the testbench pane is shown, as today.
- **Go to declaration** (right-click on a signal, or double-click on its name): closes the waveform and shows the declaration in the split view – a testbench signal in the testbench pane, a signal inside `dut` in the RTL pane – using the existing symbol index and instance resolution (`symbols/instances.ts`). This is the one-click way from *"why is this `U`?"* to the line that needs a reset (FR-18).
- **Signal list:** one list with a **value column** (S8): names on the left, the value at the cursor beside each, in a larger monospace font. The testbench's own signals come first, in declaration order, as many as fit the view's height (typically 12–16); the rest are listed under *"N more signals – Show all"*, so nothing is hidden without saying so. Instances (`▸ dut`) fold open on click; a tick box adds or removes a signal. Plugin monitors are folded under **Plugins**. Names are shown without the `[3:0]` range – the width is in the tooltip.
- **Toolbar** (S3): time at the cursor, Zoom out, Zoom in, Fit, **⋯** (Download waveform, Help), Close.
- **Right-click on a signal:** Go to declaration; Show as Hexadecimal / Decimal / ASCII / Binary; Remove.
- **Hover** on a trace (FR-23): value and time; for vectors up to 16 bits both hexadecimal and decimal (`sum = 0B = 11`), so the student rarely needs "Show as"; for `U`, `X`, `Z`, `W`, `-` the explanation of `valueHelp.ts`.
- **Gestures** (S9): wheel scrolls in time, Ctrl + wheel zooms around the mouse, click places the cursor, double-click on a bus value zooms to it. Keyboard: `+`/`−`, `F` (fit), `Esc` (close). All controls have accessible names; the signal list is a real tree (`role="tree"`).
- **Empty and error states** use one sentence and one action, for example *"This run did not record a waveform – the testbench stopped before it started. [Show code]"*.

### 8.7 Life cycle

| Event | Viewer |
|---|---|
| Run starts | An existing waveform is marked stale (dimmed, "from the previous run"); it is not removed until the new one arrives, so the layout does not jump. An open view stays open. |
| `WAVE-READY` | Button highlighted; console link line (8.6). If the view is open, `WAVE-GET` is sent at once. |
| Student opens the view | `WAVE-GET`; the waveform appears when parsed (progress only after 0.5 s). |
| Parse done | New data shown. Shown signals, "Show as" and zoom are kept for every signal whose hierarchical name still exists (FR-17); on the first waveform of a project the first view of 8.6 applies. |
| Board run starts | The view closes and the split view returns; the button is disabled with its tooltip (W1). |
| `DONE` without `WAVE-READY` | The stale waveform stays dimmed with a note why there is no new one. |
| Parse error | One-sentence message; Download still offers the raw file. |

### 8.8 Copy waveform and Figure for a report

Two entries in the ⋯ menu put the traces in view into a document. Both draw one SVG (`figure/figureSvg.ts`); the PNG is drawn from that SVG, so the two never differ.

- **Copy waveform** copies the view as it looks on screen: the screen's colours, fonts and sizes, the Signal and Value columns at their width, the time axis on top and the cursor. It goes onto the clipboard as PNG (at twice the screen's pixels) and SVG together, so each program pastes the format it reads. The section heads (TB, RTL) are left out.
- **Figure for a report…** turns the view into report mode. A wide band across the top of the view, in the dialogs' blue, reads *Figure for a report – The traces in view, sized for print*. It holds the buttons Close, Save SVG, Save PNG and Copy, the choices (width, black and white or colour, the cursor) and how to insert the figure. Below it, in place of the list and the canvas, is the figure itself, drawn live from the view, so every choice shows at once. Both widths are drawn at one scale (the one that fits two columns in the pane), so choosing two columns visibly widens the figure, with more room for the same time span. The mouse chooses what the figure shows: the wheel scrolls in time, Ctrl + wheel and the toolbar zoom, dragging pans, and a click places the cursor. Close or Esc returns to the view. The choices are remembered in this browser.

### 8.9 Report figure style

The report figure follows the IEEE Author Center's graphics guidance [IEEE-G, IEEE-RS, IEEE-FF] and what IEEE timing diagrams usually look like. Every size is set in points at the final printed size (`figure/figureStyle.ts`), so nothing changes when the figure goes into the report unscaled.

| Rule | Value |
|---|---|
| Width | One column, 88.9 mm (default), or two columns, 182 mm [IEEE-RS]. |
| Colour | Black traces on white by default. Colour is optional, and every colour is dark enough to print as a clear line in grayscale. A test checks this. Values are told apart by shape, never by colour alone [IEEE-G]. |
| Text | 9 pt Arial/Helvetica, one family for the whole figure [IEEE-FF]. The preferred range is 9–10 pt; text never goes below 8 pt, and the absolute floor is 6 pt. |
| Lines | Traces and bus outlines 1 pt; axis, ticks and the cursor 0.75 pt; grid lines and hatching 0.5 pt. No line is thinner than 0.5 pt. |
| Values | 0 and 1 are solid low and high lines, and the weak L and H are dashed. Z runs at mid-level, as timing diagrams draw high impedance. X and W are a hatched box, U a shaded box, and `-` an empty box. None of them looks like 0 or 1. |
| Buses | The crossing outline. The value is centred between the crossings and left out when it would touch an edge, so labels never overlap. |
| Rows | Every row is the same height, and changes line up across rows. |
| Time axis | Below the traces, with the unit in the axis title, for example `Time (ns)`. Ticks fall on 1-2-5 steps and are spaced so that no two labels touch, which gives about ten labels across two columns. |
| Time span | The window on screen; the traces stop where the run ended, and the axis keeps going across the window. |
| Formats | Copy puts PNG and SVG on the clipboard. The SVG is sized in mm with its drawing in points, so it opens at its printed size. The PNG is 600 dpi at the final size (IEEE asks for over 600 dpi for line art and over 300 dpi for colour [IEEE-RS]), and the saved file records its resolution in a `pHYs` chunk. Making a PNG larger after export does not add detail. |
| Not yet | PDF and EPS, which are IEEE's submission formats [IEEE-FF]. They must embed their fonts or convert text to outlines, which needs a font file in the app (for example Liberation Sans, which has Arial's letter widths). SVG is for editing and is not an IEEE submission format; for submission, save the SVG as PDF from Word or Inkscape, which embeds the fonts. |

Pasting a PNG from the clipboard loses its resolution (the browser writes it again without the `pHYs` chunk), so Word may resize the picture. The band says which width to set it back to.

---

## 9. Requirements

Stage: **1** first release to students · **2** next · **3** later.

### 9.1 Functional

| # | Requirement | Stage |
|---|---|---|
| FR-1 | Waveforms are recorded for every testbench run **by default**. A single switch in Settings ("Record waveforms for testbench runs") turns it off; the choice is remembered in the browser. | 1 |
| FR-2 | A batch run with recording on produces a waveform of the whole design hierarchy – GHW for VHDL, VCD for Verilog (W2). | 1 |
| FR-3 | The time axis shows simulated time with automatic units (ns, µs, ms …) and 1-2-5 ticks. | 1 |
| FR-4 | The signal list shows the hierarchy folded under the testbench; empty package scopes are hidden; plugin monitors are folded under **Plugins**. | 1 |
| FR-5 | The first waveform of a project shows the testbench's own signals in declaration order, as many as fit the view's height; the rest are listed under "N more signals – Show all". The student adds or removes signals with a tick box. | 1 |
| FR-6 | Single bits are drawn as logic levels, vectors and integers as buses, with all nine `std_logic` values distinguished (8.5). | 1 |
| FR-7 | Zoom in/out, Fit, scroll in time; zooming never changes the data. | 1 |
| FR-8 | A cursor placed by click; the value column shows every shown signal's value at the cursor (S8). | 1 |
| FR-9 | "Show as" per signal from the right-click menu: Hexadecimal (written `0x41`), Decimal, ASCII (written `'A'`, so it is never read as hex), Binary. Defaults: hexadecimal for every vector, decimal for integers, names for enumerations (S7). Signed decimal and floating point are not offered yet (revised 2026-10-17). | 1 |
| FR-10 | Jump to the previous/next change of the selected signal (`←`/`→`). | 2 |
| FR-11 | Signals the format cannot carry are listed, greyed out, with a plain explanation – e.g. Verilog memories (arrays), which Icarus does not record: *"Memories are not recorded. Show one word by copying it to a `wire` in your testbench."* | 1 |
| FR-12 | The view says in one line how the run ended when it did not complete normally: stopped by you, took too long, waveform too large (and stage 2: stopped at "Stop at"). | 1 |
| FR-13 | Measure: a second marker from the **⋯** menu; the toolbar shows the time between cursor and marker and, for a clock period, the frequency ("20 ns – 50 MHz"). | 2 |
| FR-14 | **FSM states by name** (VHDL enumerations, from GHW) on the bus and in the value column; records fold open into their fields. | 1 |
| FR-15 | A search box above the signal list when the design has more than 30 signals. | 2 |
| FR-16 | Every `@<time>` in a console report line and every plugin-output time stamp is a link that opens the waveform with the cursor at that time. | 1 |
| FR-17 | Shown signals, "Show as" choices and zoom are kept across reruns for signals that still exist. | 1 |
| FR-18 | **Go to declaration** on a signal closes the waveform and shows the declaration in the split view, in the testbench or the RTL pane (uses the existing symbol index). | 1 |
| FR-19 | Optional "Stop at" simulated time in the **⋯** menu (7.1). It applies to **one run only** and the console names it on that run, so a forgotten value cannot silently cut later runs. | 2 |
| FR-20 | Download the waveform file (`<testbench>.ghw` / `.vcd`) from the **⋯** menu – for GTKWave or Surfer, or to send to the teacher. | 1 |
| FR-21 | Save the shown signals and their "Show as" in the project file, so a shared example opens with the teacher's view. | 3 |
| FR-22 | Board-mode capture (section 10), only if it can be kept as simple as the batch viewer. | 3 |
| FR-23 | Hovering a trace shows its value and time; vectors up to 16 bits in both hexadecimal and decimal; for `U`, `X`, `Z`, `W` and `-` one sentence on what the value means and its most likely cause in a beginner's design (`X`: two drivers, or arithmetic on an uninitialised signal). | 1 |
| FR-24 | The **Waveform** button left of **Clear** in the *Simulator Output / Status* band opens and closes the view, with the states of 8.6. Opening replaces the split view; closing shows the testbench/RTL split view again. | 1 |
| FR-25 | After a testbench run that produced a waveform, the console shows *"✓ Testbench finished – Open waveform"* as a link, until the student has opened a waveform once in this browser. | 1 |
| FR-26 | When the run reported an error, the waveform opens zoomed in at the first error, with the cursor and a red marker there; otherwise fitted to the whole run (8.6). | 1 |
| FR-27 | Group the DUT's ports as **Inputs** and **Outputs** above the internal signals, using the existing port analysis of the design (VCD and GHW do not record port directions). | 2 |
| FR-28 | Option to show the waveform over the testbench half only, so the RTL code stays visible beside it (Q8). | 3 |

### 9.2 Non-functional

| # | Requirement |
|---|---|
| NFR-1 | **Speed.** Parsing runs in a worker; the editor and board stay responsive while it runs. Parse throughput on a typical lab PC is at least **50 MB/s for VCD and 25 MB/s for GHW** (uncompressed), so a file at the 16 MiB limit opens in under a second; the prototype of step 1 must show this before the rest is built. A redraw after zoom or scroll takes < 16 ms for 50 visible rows at 1920 px width, independent of the number of changes. |
| NFR-2 | **Exact time.** Times are integers in the file's timescale; no floating-point accumulation. Files whose times exceed 2⁵³ ticks (≈ 9 s simulated at 1 fs) are rejected with a clear message. |
| NFR-3 | **Memory.** No copy of the raw file is kept after parsing; values are interned (8.2). |
| NFR-4 | **Platforms.** Same behaviour in the hosted service, a self-hosted server and the Windows app (Electron 33). Uses only `DecompressionStream`, Web Workers and Canvas 2D; minimum browsers Chrome/Edge 80, Firefox 113, Safari 16.4. |
| NFR-5 | **No interference.** With recording off, a run is byte-for-byte the same as today. With recording on, console output, plugin output, `DONE` and the board are unchanged apart from the lines in 7.6 and the frontend's own link line (FR-25). |
| NFR-6 | **Correct claims.** The help text states that the waveform shows values at the end of each time step; delta cycles are not shown. |
| NFR-7 | **Security.** No client-supplied path reaches the file system; the file name is chosen by the session; the stop time is validated before it reaches a command line; `spawn` with argument arrays only; a student's `$dumpfile` name is used only if it is a plain file name in the session directory. |
| NFR-8 | **Bounded resources.** Disk per session ≤ `HDL_MAX_WAVE_BYTES`; a waveform is transferred only on request, gzip-compressed and streamed. |
| NFR-9 | **Code standard.** TypeScript `strict`, plain CSS with tokens, function components, no new runtime dependency, Clean Code as in `Design_Description.md` § 1.3: one responsibility per file, named constants, pure functions for parsing, mapping and drawing, so they are unit-testable. |
| NFR-10 | **Accessibility.** Every control is keyboard-operable and named; values at the cursor are text in the DOM, not only pixels on the canvas. |
| NFR-11 | **Learnability.** A first-year student who has run a testbench but never seen the viewer finds the waveform and reads a value at a given time without help, in under two minutes. Checked twice: on a mockup before the UI is built (step 6) and on the real viewer before release (step 9). |

### 9.3 Out of scope – the boundary to professional tools

HDLBoard's viewer is for **learning functional simulation**. Students who need timing that matches the hardware – gate-level or post-fit simulation with SDF delays, timing analysis – move on to ModelSim/Questa and the vendor tools, which is also the course's own progression. The viewer therefore deliberately leaves out:

- timing/gate-level simulation and SDF back-annotation;
- run-to-run comparison, user-defined signal groups, saved sessions with many views, transaction views, protocol decoders (the plugin output already decodes buses), analog display of `real` signals;
- editing waveforms as stimuli;
- generated explanations of what a signal *does* ("this is a counter") – the viewer explains values, not designs, because a wrong guess would teach something false;
- anything that adds controls without helping a beginner read a functional simulation.

**Download waveform** (FR-20) is the bridge: the same file opens in GTKWave, Surfer or other tools when a student wants more.

---

## 10. Board mode (stage 3 draft)

A board run never ends and, with `CLOCK_50`, produces several MB of VCD per real second. A useful board-mode feature looks like the DE1-SoC's own Signal Tap logic analyser rather than a full dump:

- The student presses **Capture** on the board panel; the next *N* ms of simulated time (or until a trigger condition on a board port) are recorded.
- Only the board ports and the top entity's signals are dumped (GHDL `--read-wave-opt` with `/hdl_board_tb/dut/*`; Icarus `$dumpvars(1, …)`).
- The persistent process would have to start and stop dumping at run time, which neither simulator offers from the command line: GHDL dumps from start to end, Icarus can only `$dumpon`/`$dumpoff` from HDL code. Options: a capture flag polled by the generated wrapper that drives `$dumpon/$dumpoff` (Verilog); restarting the run with dumping (loses the student's interactive state); or recording board-port changes in the wrapper itself and writing them as `@@HDLB` lines (VHDL and Verilog alike). To be decided in a separate board-mode draft (Q6).

---

## 11. Compatibility with GHDL in WebAssembly

If GHDL moves into the browser (an idea under consideration), the simulator writes the waveform into its in-memory file system. The transport layer (7.4) then disappears and the bytes go straight to `waveWorker.ts`; everything from the parser onwards is unchanged. This is the reason for W4: putting the parser on the server would have tied the viewer to the backend that is being questioned.

---

## 12. Implementation order

| Step | Deliverable | Done when |
|---|---|---|
| 0 | **GHW feasibility test, before the design is implemented.** Record GHW files with the shipped GHDL versions (5.0.1, 6.0.0) – complete runs, and runs stopped with SIGTERM and SIGKILL at several points – and **store them locally** in the repository as fixtures (`docs/impl_files_for_waveform/ghw/`, with the VHDL that produced them and a script to re-create them, as `impl_files_for_plugins/feasibility/` does for the plugins). A minimal TypeScript reader (hierarchy, enum types, cycles) reads them all | Every complete file reads with correct FSM state names; every stopped file gives its data up to the last complete cycle. If stopped files turn out not to be readable, the fallback of 7.5 applies and W2 is re-checked before step 1 |
| 1 | **Parser prototype:** `model.ts`, `vcdParser.ts` with unit tests on recorded fixtures (clock, reset, a 4-bit bus; GHDL and Icarus); throughput and memory measured on a 16 MiB file | NFR-1's VCD figure is met on a lab PC. If not, the parser design is revised before anything else is built |
| 2 | `valueAt.ts`, `radix.ts`, `timeAxis.ts`, `levelOfDetail.ts`, `consoleTimes.ts`, `initialView.ts`, `valueHelp.ts` with unit tests | Tests pass |
| 3 | Backend: `WAVE` frame, `WaveRequest`, GHDL arguments (VCD for VHDL via `HDL_WAVE_VHDL_FORMAT=vcd`), Icarus helper module and dump detection, size guard, `WAVE-READY` / `WAVE-GET` / `WAVE-BEGIN` / `WAVE-END` / `WAVE-NONE`, console translation | Integration tests of section 14 pass |
| 4 | `hdlClient` binary frames, `waveWorker.ts`, `useWaveform.ts` | A run's waveform reaches the main thread as `WaveformData` on request; a rerun marks the old one stale |
| 5 | **HTML mockup** of the view and the console in `docs/` (as `github_split_button_mockup.html` was), tried by 2–3 students | Findings folded into 8.6 before step 6 |
| 6 | UI: Waveform button and console link line, `WaveformPane` in place of the split view (close restores the testbench/RTL split), signal list with value column, canvas, toolbar, cursor, hover help, first view at the first error, console time links, Go to declaration, Settings switch, Download | Acceptance criteria 1–12 and 14–17 pass with VCD |
| 7 | **GHW:** `ghwParser.ts` (truncation-tolerant), `--wave=` for VHDL (`HDL_WAVE_VHDL_FORMAT=ghw`), enum and record display | Acceptance criterion 13; NFR-1's GHW figure |
| 8 | Characterization tests on GHDL 5.0.1 (Windows app) and 6.0.0 (Docker) | Section 4 confirmed for the shipped versions |
| 9 | **Usability test** with first-year students (NFR-11) | Acceptance criterion 18 → **release to students** |
| 10 | Stage 2: measure marker, previous/next change, Stop at, search, Inputs/Outputs grouping | Acceptance criteria 19–21 |
| 11 | Stage 3: shown signals in the project file; testbench-half option; board-mode draft | Separate plan |

Each step is merged on its own; steps 0–4 change nothing visible, and nothing is visible to students before step 9.

---

## 13. Affected files

**Server**

| File | Change |
|---|---|
| `server/src/protocol.ts` | `WAVE` and `WAVE-GET` client frames; `WAVE-READY`, `WAVE-BEGIN`, `WAVE-END`, `WAVE-NONE` server frames; binary frame rule |
| `server/src/engines/types.ts` | `WaveRequest`, `WaveFormat`, `PrepareRequest.wave` / `waveBaseName`, `RunPlan.wave` |
| `server/src/engines/ghdlEngine.ts`, `server/src/ghdl.ts` | `--wave=` / `--vcd=` and (stage 2) `--stop-time=` for batch runs |
| `server/src/engines/verilogEngine.ts`, new `server/src/verilog/waveModule.ts` | Helper module, `-s hdlboard_wave`, stop time in nanoseconds (stage 2) |
| new `server/src/verilog/dumpDetection.ts` | Comment- and string-aware scan for the student's own dump tasks; name of the student's dump file (7.3). Pure |
| `server/src/session.ts` | Captures the request at run start; unique file name; size watchdog; `WAVE-READY` before `DONE`; answers `WAVE-GET`; deletes the file on the next run, Reset and teardown |
| new `server/src/wave/waveTransfer.ts` | Gzip and chunking of a finished file |
| new `server/src/wave/waveConsole.ts` | Console line translation (7.6). Pure |
| `server/src/settings.ts` | `HDL_MAX_WAVE_BYTES`, `HDL_WAVE_CHECK_MS`, `HDL_WAVE_VHDL_FORMAT` |
| `server/src/server.ts` | Binary frames out (`ws.send(buffer, { binary: true })`) |

**Frontend**

| File | Change |
|---|---|
| `src/components/workbench/hdlClient.ts` | `binaryType = 'arraybuffer'`; `WAVE`, `WAVE-GET`; `onWaveReady/onWaveBegin/onWaveChunk/onWaveEnd/onWaveNone` handlers |
| new `src/components/waveform/*` | Section 8.1 |
| `src/components/workbench/ConsoleOutput.tsx` | `WaveformButton` to the left of Clear in `wb-console__header`; link line (FR-25); `@<time>` links (FR-16) |
| `src/components/workbench/plugins/PluginOutputPane.tsx` | Time stamps as links (FR-16) |
| `src/components/workbench/Workbench.tsx` | Wires `useWaveform`; sends `WAVE` before `RUN`; a new centre overlay `'waveform'` beside `'project'`, `'examples'` and `'plugins'`, with the editor `inert` underneath |
| `src/components/workbench/useTestbenchSplit.tsx` | `showRunPair(testbenchFileId)`: on closing the waveform, pin the run's testbench and its design in the split view; reveal a declaration line for Go to declaration |
| `src/components/workbench/SettingsDialog.tsx` | Record waveforms for testbench runs (on by default) |

**Docs:** `HOSTING_SIZING.md` (disk), `README.md` (feature, documents list), `changelog.txt`, the mockup of step 5.

---

## 14. Tests

- **Parser unit tests** on recorded fixture files (checked in under `src/components/waveform/fixtures/`):
  - VCD from GHDL with all nine `std_logic` values, `unsigned`/`signed`, integer, boolean, real and an unhandled enum/record; from Icarus with shared identifier codes and compressed vectors; truncated mid-line; both timescale spellings; a time beyond 2⁵³.
  - GHW from GHDL with an enumeration, a record, `character`, `std_logic` vectors and integers; the same file truncated at several points (inside the hierarchy → clear error; inside the cycles → data up to the cut, `truncated` set). The stored files of step 0 are the start of this fixture set.
  - Throughput and memory on a 16 MiB file of each format (NFR-1), run as a benchmark, not in every test run.
- **Pure-function tests:** `valueAt` (before the first change, on a change, between, after the last), `radix` (with `X`/`Z`/`U` bits), `timeAxis` ticks, `levelOfDetail`, `consoleTimes` (GHDL report and assertion lines, plugin lines, first error), `initialView`, `valueHelp`, `dumpDetection` (comments, strings, `$dumpvars` without `$dumpfile`, in a header file).
- **Characterization tests** (server, per shipped GHDL version): the type table of section 4 for VCD and GHW; GHW from a stopped run; exit code and stdout line of `--stop-time`.
- **Integration tests** (server): `adder4_tb` (VHDL) and a Verilog testbench give `WAVE-READY` before `DONE completed`, and `WAVE-GET` returns the file; recording off sends no `WAVE-*`; a never-ending testbench ends with `size-limit` within seconds; Stop during a run gives a `stopped` waveform; `WAVE-GET` for an older run gets `WAVE-NONE`; a Verilog testbench with its own `$dumpvars` gets no helper module and its own `dump.vcd` is offered.
- **Frontend:** `useWaveform` life cycle (ready, fetch on open, auto-fetch when open, stale, keep selection); close restores the split pair; a render smoke test of `WaveformPane` with a fixture.

---

## 15. Acceptance criteria

The first release to students (stage 1) is complete when all of these pass in the hosted service and in the Windows app:

1. A clock-and-reset testbench produces a waveform with correct clock period and reset release time.
2. `adder4_tb` from the example project shows `a`, `b` and `sum` with correct hexadecimal values at known times.
3. A testbench with nested instances gives a usable hierarchy; plugin monitors appear under **Plugins**.
4. An uninitialised signal shows as a red `U` band until it is assigned; hovering it explains what to do.
5. The cursor and the value column show the correct values at, before and between changes.
6. Zooming and scrolling never change times or values.
7. A rerun replaces the waveform; while it runs, the old one is visibly stale; shown signals and "Show as" are kept.
8. A testbench that never ends stops at the size limit within seconds, shows what was recorded, and the console explains how to end the testbench.
9. Opening a 16 MiB waveform takes under a second and does not freeze typing in the editor; console and board behave as before; with recording off, nothing changes.
10. The Waveform button sits left of Clear, is disabled with its explanation before any testbench run and after a board run, and is highlighted when a new waveform is ready; the console link line appears until the first waveform has been opened.
11. Opening the waveform replaces the split view; closing it (✕, the button or `Esc`) shows the split view with the run's testbench on the left and its RTL design on the right, with caret and scroll position as before.
12. A run whose waveform is never opened transfers no waveform data to the browser.
13. **An FSM's state is shown by name** (`IDLE`, `RUN`, `DONE`) on the bus and in the value column (VHDL, GHW), also when the run was stopped by the size limit.
14. Clicking `@1230ns` in a failing `report` line opens the waveform with the cursor at 1.230 µs.
15. A testbench with a failing assertion opens the waveform zoomed in at the first error, with a red marker there.
16. "Go to declaration" closes the waveform and shows the right file and line – the testbench pane for a testbench signal, the RTL pane for a signal inside `dut`.
17. A Verilog testbench that has its own `$dumpvars` gets a clear console note, and its own waveform is shown when it wrote a `.vcd` file.
18. **Usability test** (NFR-11): at least four of five first-year students who have not seen the viewer open the waveform after a testbench run and read the value of `sum` at a given time, and the state of an FSM at a given time, without help.

Stage 2 adds:

19. The measured time and frequency between cursor and marker are correct for a 50 MHz clock (20 ns, 50 MHz).
20. "Stop at" stops one run at the given time, the console names it, and the next run is not affected.
21. The DUT's ports appear under Inputs and Outputs.

---

## 16. Open questions

| # | Question | Proposal |
|---|---|---|
| Q1 | GHW parser: port GHDL's `libghw` to TypeScript, or compile the Rust `wellen` library (used by Surfer) to WebAssembly? | Port to TypeScript: no Rust toolchain in the build, same stack as the rest, and `wellen` refuses truncated GHW files (4), which our parser must accept. Check `libghw`'s licence (GHDL is GPL-2.0-or-later, compatible with GPL-2.0-only). |
| Q2 | Is 16 MiB right for `HDL_MAX_WAVE_BYTES` on the hosted free tier? | Keep 16 MiB; revisit if a realistic course project (not a never-ending testbench) reaches it. |
| Q3 | Should recording be on by default? | Yes – a typical testbench writes kilobytes, and with on-demand transfer (W5) an unopened waveform costs only disk until the next run. |
| Q4 | The student's own `$dumpfile` naming a path or a non-`.vcd` file | Not offered; the console says why (7.3). |
| Q5 | Where the waveform layout lives in the project file (FR-21) | A `waveform` key per testbench file, holding hierarchical names, order and "Show as". Decide together with the project-file owner. |
| Q6 | Board-mode capture mechanism (section 10) | Separate draft after stage 2. |
| Q7 | Very wide designs: limit the dumped signals with GHDL `--read-wave-opt`? | Not in stage 1; revisit if the size limit is hit by realistic course projects. |
| Q8 | Waveform over the testbench half only, RTL beside it (FR-28)? | Consider after the usability test of step 9: if students keep switching between waveform and RTL code, add it as an option. |
| Q9 | Verilog failures: which Icarus messages carry a time for FR-16/FR-26? | `$display` has a time only if the student prints `$time`; check what `$error`/`$fatal` print in Icarus 12 in the characterization tests and link those. |

---

## 17. Rejected alternatives

| Alternative | Why not (now) |
|---|---|
| Serve the waveform over an HTTP route | Needs a per-session capability token and a new attack surface in server mode; the session socket already identifies the run. |
| Send the waveform after every run | Bandwidth and parse time for every run, also when nobody opens it (W5). |
| Parse on the server, send a processed model | Ties the viewer to the backend that may move into the browser (section 11); the raw file is also what Download needs. |
| Implicit `--stop-time` on every run | Changes what a correct testbench does once waveforms are switched on. |
| VCD for VHDL in the student release | No FSM state names – the most important thing to see in the course (W2). |
| FST | Empty file when the run is stopped; complex format; no type advantage over VCD. |
| A third-party JavaScript VCD parser | GHDL's `U W L H -` values are outside the VCD standard; our parser is small and testable. |
| Embed Surfer / launch GTKWave | See 6.3. Download (FR-20) keeps them available. |
| One React element per change (SVG) | Does not scale beyond a few thousand edges. |
| Waveform as a tab in the bottom console panel | Too little height for more than a few signals, and a second place to look. The split view is free exactly when a waveform exists, and closing returns the code (W8). |
| Opening the waveform automatically after each run | Hides the code without the student asking; the highlighted button and the console link say a waveform is ready instead (S2). |
| A separate "beginner mode" | One more concept to understand; the default view is the beginner view (S7). |
| "Explain this signal" with a generated description of what the signal does | A wrong guess would teach something false; the viewer explains values, not designs (9.3). |
| An extra warning at 5–10 MiB before the size limit | The lower limit of 16 MiB (W6) gives the same early feedback with one message instead of two. |
| A "Show new waveform" button when a new one is ready while the view is open | The open view fetches and shows the new waveform by itself (8.7). |
| Feature parity with GTKWave/ModelSim (groups, run comparison, many markers, transaction views) | Advanced users use professional tools for hardware-accurate timing (9.3); every extra control costs beginners clarity (W0). |

---

## 18. Review log (2026-10-17)

The spec was reviewed by Mistral, Microsoft Copilot and Grok, with the brief that the users are beginners. All three found the architecture sound and asked for simpler, more teaching-oriented priorities. What changed:

| Finding | Raised by | Change |
|---|---|---|
| FSM states (enums) came too late for an FSM-heavy first course | All three | GHW is part of the first release to students (W2, FR-14, step 7) |
| The jump from a failing report line to its time is the most useful link | Mistral, Copilot, Grok | Console `@<time>` links in stage 1 (FR-16); first view at the first error (W11, FR-26) |
| The waveform hides the code where "why `U`?" is answered | Mistral | Go to declaration in stage 1 (FR-18); testbench-half option later (FR-28, Q8) |
| Stage 1 too large | Copilot | Stop at, previous/next change → stage 2; Download kept in ⋯ (cheap, and lets students send the file to the teacher) |
| "Stop at" can silently cut later runs if remembered | Mistral | Applies to one run only and is named in the console (FR-19) |
| `#<time> $finish` with time units is not valid Verilog-2005 | Mistral | Plain number in the shared 1 ns unit (7.3) |
| Detecting the student's own `$dumpvars` was unspecified | Mistral | Specified (7.3); `dump.vcd` default handled |
| No parse-speed requirement; custom parser is the main risk | Mistral, Copilot, Grok | NFR-1 throughput figures; measured prototype as step 1 |
| Every run sent its waveform, opened or not | Mistral | On-demand transfer (W5, 7.4) |
| A late warning for never-ending testbenches | Grok | Limit lowered to 16 MiB (W6, 7.5) |
| The button may be overlooked | Copilot | Console link line until the first waveform is opened (FR-25) |
| 32 automatic signals: too many (Copilot) vs. may hide signals (Mistral) | Copilot, Mistral | As many as fit the height, the rest named under "N more signals – Show all" (FR-5) |
| Values are what beginners read | Copilot | Value column as the main reading surface (S8); hex and decimal in the tooltip (FR-23, Grok) |
| Inputs/Outputs/Internal grouping | Copilot | Stage 2 from the existing port analysis (FR-27) |
| The FSM tip required `'pos` knowledge | Mistral | Not needed: GHW shows the names |
| Usability is tested only after building | Mistral, Grok | Mockup with students before the UI (step 5) and a test before release (step 9) |
| Is a GHW file from a stopped run readable? | Author | GHW feasibility test with locally stored files before the design is implemented (step 0); fallback in 7.5 |
| `DecompressionStream` availability | Mistral | Minimum browsers stated; the Windows app's Electron 33 has it (NFR-4) |
| FR numbering gap | Mistral | Fixed |
| Not adopted: "Explain this signal", beginner mode, soft-warning, "Show new" button, earlier search | Copilot, Grok | Section 17 |

---

## 19. Implementation notes (2026-10-17)

What was built, and where it differs from the sections above.

| Step | Result |
|---|---|
| 0 | GHW from GHDL 6.0.0 – complete and stopped with SIGTERM – read with the new reader: complete files with FSM names, stopped files up to their last complete cycle. Fixtures and `make_fixtures.sh` in `docs/impl_files_for_waveform/`; the stopped files are cut to 64 KiB to keep the repository small. The fallback of 7.5 was not needed. |
| 1 | `vcdParser.ts`, `ghwParser.ts`. On a 16 MiB file of a never-ending testbench, on the development PC: VCD ≈ 52 MiB/s, GHW ≈ 45 MiB/s (NFR-1: 50 MB/s, 25 MB/s). Not yet measured on a lab PC. |
| 2 | All modules of 8.1, plus `signalRows.ts` (the list as rows, hierarchical paths), `declarations.ts` (FR-18), `verilogMemories.ts` (FR-11), `waveState.ts` (the life cycle of 8.7 as a reducer). |
| 3 | As 7.1–7.6, with the differences below. Integration tests in `server/src/integration/waveform.test.ts`. |
| 4 | `hdlClient` binary frames, `waveDecode.ts` + `waveWorker.ts`, `useWaveform.ts`. |
| 6 | The UI of 8.6. Checked in Chrome with the projects `waveform-counter` and `rs232-transmit-a` (in `myHdlProjects`). |
| 7 | GHW is the default for VHDL. |

**Differences from the spec**

- **File names per start, not per prepare (7.2).** A Reset starts the same compiled run again while the stopped process may still hold the old file (Windows), so the session names the file each time a batch run starts (`wave-<n>.<format>`) and passes it to `startBatchRun`. `RunPlan.wave` carries only the format, or the student's own `$dumpfile` name. `PrepareRequest.waveBaseName` does not exist.
- **The Icarus helper reads its file name from a plusarg** (`+hdlboard_wave=wave-3.vcd`), so one compile serves every start.
- **`startBatchRun(plan, { onOutput, timeoutMs, waveFile })`** takes an options object (the server lint allows three parameters).
- **GHW is parsed when the transfer is complete**, VCD while it arrives (8.4). At 45 MiB/s a 16 MiB file is still parsed in well under a second.
- **Download fetches the file again** instead of keeping a copy in the page (NFR-3).
- **The size-limit message does not name the simulated time** (7.5): the server does not know it for a batch run.
- **Built on `main`, without the batch-plugin work.** The parts that need plugins – plugin monitors folded under **Plugins** (FR-4, acceptance criterion 3) and plugin time stamps as links (FR-16) – are left out until plugins are merged; `ScopeKind` has no `plugin`. When they come, the monitors can be recognised from the run's sources (`label : entity hdlboard.…`), since neither format names an instance's entity.
- **The first view zooms to the first error** even when the student's own zoom is remembered (W11 over FR-17); shown signals and Show as are still kept.
- **Q9:** Icarus prints `$error`/`$fatal` as `ERROR: file:line: text` followed by `Time: <ps>  Scope: …`; that `Time:` is linked and used for FR-26. Works without `-g2012`.

**After the first review (2026-10-17)**

- **Sections (`docs/images/mock_view.png`).** The list has a section for the testbench, headed **TB**, and one for each instance in it, headed **RTL** (the flask and chip icons of the editor; a tooltip names the file in bold and the instance), each with a tinted head, a small gap (`SECTION_GAP_PX`) above it, and its own colour: testbench traces blue, RTL traces green, state machines purple. In a section the ticked signals come first, together, in the order they were ticked. The head's chevron shows or hides the signals that are not shown (folded by default), with a count ("8 not shown"); instances deeper down are folders inside their section. Rows no longer all start at `index × ROW_HEIGHT`: `ListModel.tops` gives each row's top, and list and canvas both use it.
- **Resizable list.** The divider between the list and the traces can be dragged (or moved with ← / → when focused, double-click for the default); the width is kept in `localStorage`.
- **Vectors unfold into bits.** A ▸ beside a vector shows its bits (`data[7]` … `data[0]`) under it, drawn as one-bit traces; folded by default.
- **Cursor handle.** A label with the cursor's time sits on the ruler above the cursor line, in the cursor's colour (`cursorHandle.ts`, `docs/images/mock_cursor_top.png`). Pressing the label, the ruler or within `CURSOR_GRAB_PX` (6 px) of the line drags the cursor.
- **Drag to zoom.** Dragging across the traces marks a range from the top to the last shown signal, with its width written on the ruler; releasing zooms to it. Dragging on the ruler moves the cursor. A click places the cursor and selects that row's signal.
- **Keyboard.** The view takes the focus when it opens. ← / → move the cursor to the previous / next change of the selected signal, or of every shown signal but the clocks when none is selected; Shift + ← / → move it by 1 % of the window. The window follows the cursor.
- **Go to declaration** highlights the declaration and its uses as a hover does, until the next click or until another name is hovered (`RevealRequest.highlight`, `usePinnedSymbol`).
- **No waveform yet.** The Waveform button is never disabled: without a recording it opens a dialog that says to run the testbench first. Opening, creating or closing a project drops the waveform and the remembered view.
- **Toolbar.** Round grey buttons with Material Symbols icons (zoom out, zoom in, fit, more, close), each with a tooltip; the time at the cursor is shown beside the title.
- **Clean Code.** `src/components/waveform` is linted with the server's rules (`npm run lint`: at most 40 lines per function, 3 parameters, complexity 8, depth 3). The GHW reader is split into `ghw/`; the view into `useWaveView.ts`, `viewSetup.ts`, `paintWaveform.ts`, `useCanvasGestures.ts`, `SignalRow.tsx`, `WaveToolbar.tsx`, `WaveMenus.tsx`, `useWaveformView.ts` (all the Workbench wiring).

**Open**

- Step 5 (mockup with students) and step 9 (usability test).
- Step 8: characterization on GHDL 5.0.1 (the Windows app) – only 6.0.0 was measured.
- The Windows app was not built or run with the viewer.
- Stage 2 (FR-10, FR-13, FR-15, FR-19, FR-27) and stage 3.

---

## Sources

- [IEEE-G] IEEE Author Center, *Create Graphics for Your Article* (accessibility, grayscale check): <https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/create-graphics-for-your-article/>
- [IEEE-RS] IEEE Author Center, *Resolution and Size* (600 dpi line art, 300 dpi colour, 88.9 mm and 182 mm): <https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/create-graphics-for-your-article/resolution-and-size/>
- [IEEE-FF] IEEE Author Center, *File Formatting* (PS, EPS, PDF, PNG, TIFF; embedded or outlined fonts; Helvetica, Times New Roman, Arial, Cambria, Symbol): <https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/create-graphics-for-your-article/file-formatting/>
- GHDL documentation, *Simulation and runtime – export waveforms*: <https://ghdl.github.io/ghdl/using/Simulation.html>
- Surfer waveform viewer (formats, WASM build, iframe/`postMessage` embedding, EUPL-1.2): <https://codeberg.org/whitequark/surfer>
- ChatGPT conversation "GHDL Waveform Viewer Requirements"; reviews by Mistral ("HDLWaveViewer feedback"), Microsoft Copilot and Grok ("Vurdering av waveform viewer for HDLBoard"), all 2026-10-17.
- Measurements in section 4: GHDL 4.1.0 (mcode), Icarus Verilog 12.0 and pywellen, Ubuntu, 2026-10-17.
