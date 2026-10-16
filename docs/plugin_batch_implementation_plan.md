# Testbench-driven (batch) plugins – implementation plan

> **Status:** proposal, ready to implement. Last updated 2026-10-16.
> **Scope:** the first plugin version – a UART receive monitor (`uart_monitor`) used from the student's own testbench.
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

Out of scope here: real-time mode, Tx, Verilog (see the overview, *Later*).

---

## 2. Background: today's batch flow

- A top entity **without ports** (a testbench) runs in batch mode (`engines/ghdlEngine.ts`, `prepareBatch`): `ghdl -e --std=08 <tb>` then `ghdl -r --std=08 <tb>`, bounded by `BATCH_TIMEOUT_MS` (60 s), stdin closed.
- The simulator's stdout is split into lines (`runtime.ts`, `lineSplitter`) and passed to `Session.forwardOutputLine`, which sends them through `OutputLimiter` (200 lines/s) as `LOG` frames. The frontend (`hdlClient.ts`, `onLog`) shows them in the console.
- Batch mode does **not** use the board testbench (`hdl_board_tb`), board polling or pacing. None of that is touched by this plan.

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
Session.forwardOutputLine(line)  →  routeOutputLine(line)
  ├─ "@@HDLB " + valid header ──► plugin budget ──► PLUGIN uart TX 83495\n48
  └─ anything else ─────────────► OutputLimiter  ──► LOG …
                                          │
                                          ▼  WebSocket
hdlClient.ts handleFrame
  ├─ PLUGIN → onPlugin(line) → plugin registry["uart"] → uart widget, tab "TX"
  └─ LOG    → onLog(text)    → console
```

Verified (GHDL 4.1, Linux): `writeline(output, …)` is **not held back** when stdout is a pipe – in a 1.9 s run the first line arrived after 0.04 s. The GUI therefore updates while the simulation runs, not only at the end.

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
| `<payload>` | rest of the line; only the widget for `<kind>` interprets it | free format per kind; may be empty |

Payload of `kind = uart`:

| Payload | Meaning |
|---|---|
| `48` | one byte, two hex digits |
| `00 FE` | byte received with a **framing error** (stop bit was `'0'`) |

A line that starts with `@@HDLB` but has a malformed header (wrong field count, invalid name, non-numeric time) is sent to the console as an ordinary `LOG` line – nothing disappears, and the student sees what went wrong.

### 3.4 Timestamp

- `<t_ns>` is the **simulated time since the start of the run** (VHDL `now`), as an integer number of **nanoseconds**.
- It is relative to the start of the run – every `RUN` starts at `t = 0` – and is **not** a date or time of day.
- It is the **same time base** as GHDL's own messages (`@83495ns`) and any waveform view, so the student can compare directly.
- Wall-clock time is not used: a batch run goes as fast as GHDL can, so wall-clock time says nothing about the design.
- It is set in one place (`hdlb_emit`, section 4), so every plugin uses the same definition.
- The GUI formats it for display (`83.495 µs`, `1.204 ms`) and can show Δt between entries.
- Range: verified past 2³¹ ns (≈ 2.1 s) in GHDL 4.1 (`@@HDLB uart RX 3000179270 FF`). A JavaScript `number` holds integers exactly up to 2⁵³ ns (≈ 104 days), so no BigInt is needed.

### 3.5 Rules for plugin authors

1. Analysed into the library `hdlboard` (`--work=hdlboard`).
2. All GUI output goes through `hdlb_emit(kind, instance, payload)` – never `report` (which prefixes `file:line:col:@time:(report note):`) and never files of its own.
3. Every setting is a generic **with a default**. No configuration outside VHDL.
4. A `name : string` generic gives the instance name, so several instances can be told apart in the GUI. It must match `[A-Za-z_][A-Za-z0-9_]*`; otherwise the lines fall back to the console (3.3).
5. A plugin never ends the simulation (`std.env.finish`/`stop`) – that is the testbench's job.
6. A receive-only plugin has inputs only; it cannot affect the design under test.

---

## 4. Reference implementation

All files are in [`impl_files_for_plugins/`](impl_files_for_plugins/); see its [`README.md`](impl_files_for_plugins/README.md) for status and intended locations.

| File | Purpose |
|---|---|
| [`vhdl/hdlb_pkg.vhd`](impl_files_for_plugins/vhdl/hdlb_pkg.vhd) | `hdlb_emit` – one `@@HDLB` line with timestamp |
| [`vhdl/uart_monitor.vhd`](impl_files_for_plugins/vhdl/uart_monitor.vhd) | reference plugin: behavioural UART receiver, 8N1, LSB first |
| [`examples/uart_tx.vhd`](impl_files_for_plugins/examples/uart_tx.vhd) | example student design (synthesizable UART transmitter, 50 MHz / 115200 baud) |
| [`examples/uart_tx_tb.vhd`](impl_files_for_plugins/examples/uart_tx_tb.vhd) | example student testbench using the plugin |
| [`examples/uart_monitor_fe_tb.vhd`](impl_files_for_plugins/examples/uart_monitor_fe_tb.vhd) | plugin self-test: framing error and timestamps > 2³¹ ns |
| [`examples/run_examples.sh`](impl_files_for_plugins/examples/run_examples.sh) | runs both testbenches as batch mode will and compares with `*.expected.txt` |
| [`ts/pluginLine.ts`](impl_files_for_plugins/ts/pluginLine.ts) | server proposal: parse/route `@@HDLB` lines, `PLUGIN` frame |
| [`ts/uartPayload.ts`](impl_files_for_plugins/ts/uartPayload.ts) | frontend proposal: `uart` payload, text view, time format |

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

### 4.2 `uart_monitor` interface

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

Behaviour: wait for a falling edge (start bit), sample it again half a bit later (shorter glitches are ignored), sample eight data bits one bit-time apart (LSB first), then check the stop bit. Emit `"<hh>"`, or `"<hh> FE"` if the stop bit is `'0'`.

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

## 5. GHDL flow

```
ghdl -a --std=08 --work=hdlboard hdlb_pkg.vhd uart_monitor.vhd   # NEW – only if a file uses library hdlboard
ghdl -a --std=08 <student files>                                 # unchanged (fixed-point analysis)
ghdl -e --std=08 <testbench>                                     # unchanged
ghdl -r --std=08 <testbench>                                     # unchanged
```

| Topic | Proposal |
|---|---|
| When | Only if one of the student's files contains `library hdlboard` (case-insensitive regex, comments stripped). Otherwise the run is exactly as today. |
| Order | The plugin library is analysed **before** the student's files. Inside it, `hdlb_pkg.vhd` first, then the plugins (or the existing fixed-point analysis with `--work=hdlboard`). |
| Clean-up | Extend `clearWorkLibrary` (`WORK_LIBRARY_FILE`) to also remove `hdlboard-obj08.cf`, so the plugin library is re-analysed every run (milliseconds). |
| Location | `server/plugins/vhdl/`, shipped with the Windows installer and the Docker image like GHDL itself. The path is resolved like `ghdlPath.ts` resolves GHDL. |
| Name clash | A student entity called `uart_monitor` in `work` does not clash with `hdlboard.uart_monitor`. |
| Errors | An analysis error in a plugin file is an internal error (`stage: 'internal'`), not shown against the student's code. |
| Mode | The same plugin step is harmless in board mode, but board mode is out of scope here. |

---

## 6. Server changes

Proposal code: [`ts/pluginLine.ts`](impl_files_for_plugins/ts/pluginLine.ts) – `parsePluginLine`, `routeOutputLine`, `encodePluginFrame`, `decodePluginFrame` (unit tests in `pluginLine.test.ts`, Node test runner like the rest of `server/`).

### 6.1 `session.ts` – routing before the limiter

```ts
private forwardOutputLine(line: string): void {
  if (!/\S/.test(line)) return;
  const route = routeOutputLine(line);
  if (route.to === 'plugin') this.forwardPluginLine(route.line);   // own budget (6.2)
  else this.sendLogLines(this.limiter?.accept(route.text) ?? []);
}
```

- Plugin lines must not count against, or be dropped by, the 200 lines/s `LOG` budget.
- The server checks only the header. It does **not** interpret the payload, so a new plugin type needs no server change – only VHDL and a widget.
- The same path works in board mode (`RunHandle.onOutput` → `forwardOutputLine`), which the real-time draft reuses.

### 6.2 Plugin budget

- Separate budget with the same window logic as `OutputLimiter`, higher limit (proposal: 2000 lines/s).
- Dropped plugin lines are reported as one `LOG` summary, e.g. `… 1234 plugin lines not shown (plugin limit: 2000 lines/s)`.
- Implementation choice: make `createOutputLimiter` generic over the item type, or add a small counter next to it.

### 6.3 `protocol.ts` – new server frame

```ts
| { verb: 'PLUGIN'; kind: string; instance: string; timeNs: number; payload: string }
```

Wire format mirrors `LOG` (header line, payload as body):

```
PLUGIN <kind> <instance> <t_ns>\n<payload>
```

```ts
case 'PLUGIN': {
  const line = decodePluginFrame(inline, body);
  return 'message' in line ? line : { verb: 'PLUGIN', ...line };
}
```

Compatibility: the frontend ignores unknown verbs ([`ghdl_implementation_plan.md`](ghdl_implementation_plan.md) § 6.2), so an older frontend simply does not show plugin output.

---

## 7. Frontend changes

Proposal code: [`ts/uartPayload.ts`](impl_files_for_plugins/ts/uartPayload.ts) – `parseUartPayload`, `uartDisplay`, `formatSimTime` (vitest tests in `uartPayload.test.ts`).

| Part | Proposal |
|---|---|
| `hdlClient.ts` | `case 'PLUGIN'` in `handleFrame`: check the header (`<kind> <instance> <t_ns>`, same pattern as the server – copied, as `STATE_LENGTH` already is), call a new handler `onPlugin({ kind, instance, timeNs, payload })` in `HdlClientHandlers`. |
| Plugin registry | `kind → { parse(timeNs, payload), Widget }`. First entry: `uart` → terminal widget. New plugin type = new entry. |
| Instances | One tab per `<instance>`, created on its first line. |
| Life cycle | Cleared on a new `RUN`/`RESET`; kept after `DONE` so the student can read the result. |
| Unknown kind | Shown in the console as text with a note, so it is not lost. |
| Invalid payload | Shown in the widget as raw text, marked invalid. |

uart widget:

- Text view: printable ASCII as text; CR, LF and CR LF each as one line break; TAB as is; other bytes as `⟨hh⟩` (`uartDisplay`).
- Hex view as an alternative (toggle).
- Timestamp per byte on hover or in a column (`formatSimTime`), with Δt to the previous byte.
- Framing errors (`FE`) highlighted in red.

---

## 8. Affected files

| File | Change |
|---|---|
| `server/plugins/vhdl/hdlb_pkg.vhd` (new) | from `impl_files_for_plugins/vhdl/` |
| `server/plugins/vhdl/uart_monitor.vhd` (new) | from `impl_files_for_plugins/vhdl/` |
| `server/src/pluginLine.ts` (+ test, new) | from `impl_files_for_plugins/ts/` |
| `server/src/engines/ghdlEngine.ts` | detect `library hdlboard`, analyse plugins with `--work=hdlboard` before the student files, clean `hdlboard-obj08.cf` |
| `server/src/session.ts` | route `@@HDLB` lines before the limiter, plugin budget |
| `server/src/protocol.ts` | `PLUGIN` frame (type, encode, decode) |
| `src/components/workbench/hdlClient.ts` | `case 'PLUGIN'`, `onPlugin` handler |
| `src/components/workbench/plugins/` (new) | registry, `uart/uartPayload.ts` (from `impl_files_for_plugins/ts/`), uart widget |
| `src/components/workbench/Workbench.tsx` | plugin panel / tabs |
| Windows installer, Docker image | include `server/plugins/vhdl/` |

---

## 9. Tests

| Level | Test |
|---|---|
| Unit (server) | `pluginLine.test.ts` (P-1 … P-9): valid lines, empty payload, time > 2³¹, rejected headers, routing, frame round-trip |
| Unit (server) | `session`: a `@@HDLB` line bypasses the `LOG` budget; a malformed one becomes `LOG`; plugin budget summary |
| Unit (server) | `protocol`: `PLUGIN` encode/decode in `protocol.test.ts` |
| Unit (frontend) | `uartPayload.test.ts`: payload parsing, text view, time format |
| Integration (GHDL) | `uart_tx_tb` gives four `PLUGIN` frames `48 65 69 21` with the expected `t_ns` (`uart_tx_tb.expected.txt`) |
| Integration (GHDL) | `uart_monitor_fe_tb` gives `00 FE` and a timestamp > 2³¹ ns (`uart_monitor_fe_tb.expected.txt`) |
| Integration (GHDL) | no `library hdlboard` → plugin library not analysed, run unchanged |
| Integration (GHDL) | student entity `uart_monitor` in `work` → no clash |
| Platforms | GHDL 4.1, 5.0.1 (Windows app) and 6.0.0 (Docker), including that stdout is delivered live on Windows |

---

## 10. Verification status

| Item | Status |
|---|---|
| `hdlb_pkg`, `uart_monitor`, both example testbenches | ✅ GHDL 4.1 (Linux), `run_examples.sh` passes |
| Timestamp > 2³¹ ns | ✅ GHDL 4.1 |
| stdout delivered live through a pipe | ✅ GHDL 4.1 (Linux) |
| `pluginLine.ts` | ✅ 16 tests (Node test runner), type-checks with `server/tsconfig.json` settings |
| `uartPayload.ts` | ✅ 15 tests (vitest), type-checks with `tsconfig.app.json` settings |
| GHDL 5.0.1 (Windows) / 6.0.0 (Docker) | ⏳ not yet tested |
| Server/frontend integration | ⏳ not implemented |

---

## 11. Open questions

1. Size of the plugin budget (lines per second, or per run).
2. Whether the editor's static analysis / diagnostics must know the library `hdlboard`, so `library hdlboard;` does not give false warnings.
3. Whether plugin lines should optionally also appear in the console (debug toggle).
4. GUI layout when a testbench uses several plugin types at once (the line format already supports it).

## 12. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| `plugin.json` with `params` (baud) and `implementations` | B2: a plugin is VHDL only, no config of its own |
| UART data as a polled snapshot via `output.txt` (like `LEDR`) | loses bytes when more than one arrives per 20 ms poll |
| Separate file channels (append files) for plugin data | unnecessary in batch: stdout is already ordered, lossless and delivered live |
| Timestamp from the wall clock (Node) | meaningless in batch; simulated time (`now`) is the right reference |
| `report` for plugin output | its `file:line:col:@time:(report note):` prefix hides the `@@HDLB` marker |
