# Real-time (board) plugins – implementation draft

> ⚠️ **DRAFT – NOT READY FOR IMPLEMENTATION.**
> Real-time plugins are implemented **last**, after the testbench-driven (batch) plugins in
> [`plugin_batch_implementation_plan.md`](plugin_batch_implementation_plan.md).
> Items marked **OPEN-n** must be decided before implementation; items marked **LIMIT-n** are known limitations.
> Last updated 2026-10-16. Overview: [`plugin_structure.md`](plugin_structure.md).

---

## 0. Status and prerequisites

| Prerequisite (from the batch plan) | Reused here for |
|---|---|
| Library `hdlboard` with `hdlb_pkg` and `uart_monitor` | the same plugin entities, unchanged |
| `@@HDLB` line protocol and timestamp | design → GUI direction |
| `routeOutputLine` in `Session.forwardOutputLine`, `PLUGIN` frame | already works for board runs (`RunHandle.onOutput`) |
| Plugin registry and uart widget in the frontend | same widget, plus an input field for Tx |

Goal: the student's **synthesizable top-level design** runs interactively on the virtual board, and a plugin acts as the device at the other end of a board pin – first receiving (design → GUI), later sending (GUI → design).

---

## 1. Background: today's board I/O

```
Browser (React)                   Node server (Session)                 GHDL (ghdl -r hdl_board_tb)
───────────────                   ─────────────────────                 ───────────────────────────
Switches/Pushbuttons
  └─ hdlClient.ts ──WebSocket──►  STIM <SW9..0><KEY3..0>  (14 bits)
                                  └─ stimQueue (seq, max 256)
                                     → input.txt (tmp + rename) ─────►  io process, every poll_interval_ns:
                                                                        one queue entry → sw_sig/key_sig → DUT
                                  output.txt read every 20 ms ◄──────   on change: "<52 bits> <seq>"
  LEDR/HEX0..5 ◄──WebSocket────   STATE <52 bits>                       (seq = acknowledgement)

                                  heartbeat-N.txt read        ◄──────   heartbeat: every 20 ms sim time
                                  1 grant per 20 ms real time ──────►   blocks on pacing FIFO / stdin
```

| Mechanism | Detail | Code |
|---|---|---|
| Inputs | Queue, not snapshot; one entry per poll, held ≥ `min_dwell_ns` | `session.ts`, `tbTemplate.ts` |
| Outputs | Snapshot, written on change, with the last applied seq | `tbTemplate.ts` (`io`) |
| Pacing | The simulation blocks itself; it can only run slower than real time (FIFO on POSIX, stdin on Windows) | `tbTemplate.ts` (`heartbeat`), `session.ts` |
| Poll timing | With `CLOCK_50`: 10 µs / 10 µs (sim ≈ 0.0015× real time). Without: 1 ms / 4 ms | `engines/boardTiming.ts` |
| Port map | Only ports the entity declares are connected; extra inputs are tied to `'0'` | `tbTemplate.ts`, `engines/extraPorts.ts` |
| Identical inputs | A `STIM` equal to the previous one is dropped (`bits === lastStimBits`) | `session.ts` |

---

## 2. Proposed method

### 2.1 Activation by board pin name

The student's top-level entity declares a board pin that a plugin owns. The generator of `hdl_board_tb` then instantiates the plugin and connects it – the same rule as for `clkgen`, which only exists when the entity declares `CLOCK_50`. No plugin config is involved (decision B2).

Proposed pin table (server code, next to `BOARD_PORTS` in `engines/boardPorts.ts`):

| Board pin | Direction (student's view) | Plugin | Plugin port | Idle level | Phase |
|---|---|---|---|---|---|
| `RS232_Tx` | `out` | `hdlboard.uart_monitor` | `rx` | – | Rx – first |
| `RS232_Rx` | `in` | `hdlboard.uart_sender` (to be written) | `tx` | `'1'` | Tx – later |

Example top level (from the original discussion, with the Rx pin added):

```vhdl
entity blinkTest is
  port (
    CLOCK_500Hz : in  std_logic;
    RS232_Rx    : in  std_logic;     -- driven by the Tx plugin (later)
    RS232_Tx    : out std_logic;     -- watched by uart_monitor (first)
    SW          : in  std_logic_vector(9 downto 0);
    KEY_N       : in  std_logic_vector(3 downto 0);
    LEDR        : out std_logic_vector(9 downto 0);
    HEX0_N      : out std_logic_vector(6 downto 0)   -- … HEX1_N .. HEX5_N
  );
end entity;
```

- **OPEN-1 – pin names.** The DE1-SoC has no RS232 connector on the FPGA side, so these are virtual pins. Choose names (`RS232_Tx`/`RS232_Rx`, `UART_TXD`/`UART_RXD`, a GPIO pin …) and whether the board graphic shows them as a connector.
- **OPEN-2 – where the pin → plugin mapping lives.** A TS table in `boardPorts.ts` (proposed) is HDLBoard code, not plugin config, but every new plugin pin then needs a server change. The alternative is a convention in the VHDL itself, for example a plugin port named after the board pin.

### 2.2 Generated testbench (excerpt)

Only generated when the entity declares the pin:

```vhdl
signal rs232_tx_sig : std_logic := '1';           -- idle level of a UART line
...
uut: entity work.blinkTest port map (..., rs232_tx => rs232_tx_sig, ...);

plg_rs232_tx: entity hdlboard.uart_monitor
  generic map (name => "RS232_Tx", baud => <see LIMIT-1 / OPEN-3>)
  port map (rx => rs232_tx_sig);
```

GHDL: `prepareBoard` in `ghdlEngine.ts` analyses the `hdlboard` library (as in the batch plan) **before** `hdl_board_tb.vhdl`, whenever a plugin pin is present.

### 2.3 Design → GUI (Rx)

- **No new channel.** The plugin's `@@HDLB` lines arrive on stdout and go through the same `routeOutputLine` → `PLUGIN` path as in batch mode.
- **Timestamps** stay simulated time. Without `CLOCK_50` a paced run keeps simulated time close to real time; with `CLOCK_50` simulated time runs far slower (LIMIT-2), and the GUI still shows simulated time.
- **Invariant to update:** `runtime.ts` states that a generated testbench never writes to stdout, so every stdout line is the student's own. With plugins in `hdl_board_tb` this becomes "every line that is not a plugin line is the student's own".

### 2.4 GUI → design (Tx) – proposal only

| Step | Proposal |
|---|---|
| Client → server | New client verb `PIN <kind> <instance>\n<payload>` (e.g. one byte to send). |
| Server → simulation | Append to a per-instance queue file `plugin-<instance>-in.txt` as `<seq> <payload>` lines, written tmp + rename like `input.txt`. |
| In the testbench | A generated reader process polls the file every `poll_interval_ns` and feeds the plugin through `<ch>_data` / `<ch>_valid`, waiting for `<ch>_ready`. |
| Acknowledgement | The plugin emits `hdlb_emit(kind, instance, "ACK <seq>")`; the server drops acknowledged entries (the same pattern as the `STIM` seq). |

Why not reuse the existing inputs:
- `STIM` is a fixed 14 bits, and an identical `STIM` is dropped, so typing "ll" would lose the second `l`.
- `min_dwell` (4 ms) makes one queue entry per 4 ms, while a byte at a low baud rate takes far longer to send.
- stdin carries pacing grants on Windows (LIMIT-4).

- **OPEN-4 – acknowledgement path:** in-band on stdout (proposed above) or through a separate output file.
- **OPEN-5 – flow control in the GUI:** what happens when the user types faster than the line can send (queue length, blocking the input field, or dropping).

### 2.5 Board port handling

- Plugin pins are added to the known port set, so `extraPorts.ts` neither warns about them nor ties them to `'0'`. A UART line held at `'0'` is a continuous *break*.
- `boardPortSuggestions.ts` can suggest the plugin pin names for typos (e.g. `RS232_TXD` → `RS232_Tx`).

### 2.6 RESET / STOP

`RESET` restarts the GHDL process, so plugin state starts over; the GUI clears the plugin tabs on `RESET`, the same as for a new `RUN`.

---

## 3. Known limitations

| ID | Limitation | Consequence |
|---|---|---|
| **LIMIT-1** | **Clock vs. baud.** A design clocked by `CLOCK_500Hz` can at most handle about 30–50 baud (10–16 samples per bit). | `uart_monitor`'s default of 115200 baud cannot work with a `CLOCK_500Hz` design. See OPEN-3. |
| **LIMIT-2** | **`CLOCK_50` is slow.** Simulated time runs at about 0.0015× real time. | At 115200 baud one byte takes ≈ 60 ms of real time; at 9600 baud ≈ 0.7 s. A higher baud rate *feels faster* in the simulator. |
| **LIMIT-3** | **Not repeatable.** | The result depends on when the user acts; use batch mode for verification. |
| **LIMIT-4** | **stdin is taken on Windows** (pacing grants). | GUI → design data needs a file channel (2.4). |
| **LIMIT-5** | **Latency GUI → design.** | One poll interval plus Node file I/O per entry; acceptable for typing, not for bulk data. |
| **LIMIT-6** | **VHDL only.** | The Verilog engine has its own testbench generator (`verilog/testbench.ts`) and would need Verilog versions of the plugins. |
| **LIMIT-7** | **Exact pin names required.** | A mistyped pin is treated as an ordinary extra port (tied / left open, with a warning). |

Clock vs. baud (GHDL, paced):

| Clock in the design | Baud | Sim time per byte | Real time per byte |
|---|---|---|---|
| `CLOCK_500Hz` | 50 | 200 ms | ≈ 200 ms |
| `CLOCK_50` | 9600 | 1.04 ms | ≈ 0.7 s |
| `CLOCK_50` | 115200 | 87 µs | ≈ 60 ms |

---

## 4. Open questions

| ID | Question | Options | Leaning |
|---|---|---|---|
| **OPEN-1** | Names of the plugin pins | `RS232_Tx`/`RS232_Rx`, `UART_TXD`/`UART_RXD`, a GPIO pin | – |
| **OPEN-2** | Where the pin → plugin mapping lives | TS table in `boardPorts.ts`; naming convention in VHDL | TS table (simple, explicit) |
| **OPEN-3** | How the baud rate is chosen in board mode without plugin config (B2) | generator picks it from the clock (`CLOCK_50` → 115200, otherwise 50); student must use the default; a fixed virtual pin per baud rate | generator picks from the clock – confirm it does not conflict with B2 |
| **OPEN-4** | Acknowledgement path for Tx | in-band `ACK <seq>` on stdout; separate output file | in-band (no new reader) |
| **OPEN-5** | Flow control when the user types faster than the line sends | bounded queue + disabled input; drop with a warning | bounded queue |
| **OPEN-6** | Should plugin pins be drawn on the virtual board? | connector symbol; only the plugin tab | – |
| **OPEN-7** | Plugin output budget in a long-running board session | same as batch (per second); per session cap | same as batch |

---

## 5. Affected files (tentative)

| File | Change |
|---|---|
| `server/src/engines/boardPorts.ts` | plugin pin table (OPEN-2) |
| `server/src/engines/extraPorts.ts`, `boardPortSuggestions.ts` | plugin pins are known ports; suggestions |
| `server/src/tbTemplate.ts` | plugin signals, instances, Tx reader process (2.4) |
| `server/src/engines/ghdlEngine.ts` | `prepareBoard`: analyse `hdlboard` before the testbench |
| `server/src/session.ts` | Tx queue files, `ACK` handling |
| `server/src/protocol.ts` | client verb `PIN` |
| `server/src/runtime.ts` | update the stdout invariant comment (2.3) |
| `server/plugins/vhdl/uart_sender.vhd` (new) | Tx plugin |
| `src/components/workbench/hdlClient.ts`, uart widget | send `PIN`; input field |

## 6. Tests (tentative)

- Generated testbench contains the plugin instance only when the pin is declared (unit, `tbTemplate`).
- A plugin pin is not tied to `'0'` and gives no extra-port warning (unit, `extraPorts`).
- Board run with `RS232_Tx` and a design that sends a fixed string gives the expected `PLUGIN` frames (integration, GHDL).
- Tx: queued bytes reach the design in order, repeated bytes are not dropped, `ACK` clears the queue (integration).
- `RESET` clears plugin state and GUI tabs.
