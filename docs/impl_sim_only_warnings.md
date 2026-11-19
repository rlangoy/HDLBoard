# Simulation-only code in designs — Implementation Plan

Status: phase 1 and the multiple-driver check (§ 8.1) built on branch imp_sim_only_tag (see
docs/impl_sim_only_warnings_build_plan.md). Phase 2 (§ 7) is a **future plan**: not scheduled. Date: 2026-11-18.

## 1. Goal

A student writes this in a board design:

```vhdl
process
begin
    LEDR(0) <= '1';
    wait for 500 ms;
    LEDR(0) <= '0';
    wait for 500 ms;
end process;
```

It simulates, and the LED blinks in HDLBoard. Quartus rejects it, so the same code never runs on a real DE1-SoC.
HDLBoard should still run it, but should say so in the code:

- **A third code group, `SIM-only`, beside today's `RTL` and `TB`** (§ 2.1). Code that sits in the hardware but
  can't run on it gets its own group, label, icon and regions, so the student sees at a glance that this code is
  not made for a real FPGA, the same way they see what is a testbench today.
- **A warning on every line that can't run on the hardware**, with a sentence on why and what to write instead.
- **A setting, *Design check*, with two modes: *Synthesis* (the default) and *Simulation only*.** *Simulation only*
  hides the warnings and the label. Nothing else changes (§ 6).
- **Testbenches are never warned about.** Simulation-only code is their job. HDLBoard already tells testbenches
  from designs automatically (`tbDetect/`, docs/impl_split_screen.md § 5).

### 1.1 Decisions

| # | Decision | Why |
|---|---|---|
| S1 | A warning, never an error; the run is never blocked. | The code is legal VHDL/Verilog, and the simulator runs it correctly. Seeing it work, then being told why the chip can't do it, is the lesson. |
| S2 | *Synthesis* is the default mode. | Rune's choice: checking for the FPGA is what a course wants. A host can change the default in `settings.json` (§ 6). |
| S3 | Only *hardware* code is checked: units reachable from the board design, or marked *Treat as design* (§ 4). | A testbench full of `wait for` is correct code. |
| S4 | Phase 1 is static and live (in the browser, 500 ms after typing stops, with the testbench detector). | Same cost as today's detector; works in every build, for VHDL and Verilog, without a run. |
| S5 | **Future plan:** phase 2 adds GHDL's own synthesis check (`ghdl --synth`) at Start, for VHDL. | It is exact, and catches latches, which a static check can't (§ 3.2). Multiple drivers are caught statically, live, for both languages (§ 8.1). |
| S6 | Code inside `-- synthesis translate_off … translate_on` or `` `ifndef SYNTHESIS `` is never warned about. | That is the standard way to say "simulation only, on purpose". The detector already finds these regions (`blank.ts`, `simOnlyRegions`). |
| S7 | Detection scores do not change. | The new checks read the detector's results but add no weights, so the golden fixtures (`fixtures.golden.test.ts`) stay as they are. |
| S8 | `SIM-only` is a **code group** shown to the student, not a new detector role. The role keeps its two values, `rtl` / `tb`. | The role drives pairing, the split view and saved overrides (8 files, `desktop.ts` Workspace). A SIM-only unit is still the design for all of those: the board runs it, a testbench pairs with it. The group is a second, derived field on top. One correction to the role comes with it (§ 4.2): a unit the board design uses is never a testbench. |
| S10 | A student-facing finding needs an **operation**, not just a clue. | The detector's rules are tuned to tell testbenches apart, and some match harmless code: `vhdl-file-io` matches `use std.textio.all;` alone (`rules.test.ts`). An import is a fine testbench clue but not a reason to tell a student their design can't be built. |
| S9 | A student can mark a file *Simulation model*: the group stays `SIM-only`, the line warnings go. | Simulation models are legitimate (a model of an external chip, the plugin monitors in docs/impl_files_for_plugins/). The label keeps saying what the code is; the warnings stop nagging. |

## 2. What HDLBoard already has

| Piece | Where | Use here |
|---|---|---|
| Testbench detector: blanked code, design units, ports, instances, process/initial blocks | `src/components/workbench/tbDetect/` | The input of every check. |
| Rules that already find most simulation-only constructs, **with line numbers**: `vhdl-wait-for`, `vhdl-wait-forever`, `vhdl-after`, `vhdl-file-io`, `vhdl-end-sim`, `vlog-delay`, `vlog-assign-delay`, `vlog-event-wait`, `vlog-display`, `vlog-end-sim`, `vlog-file-io`, `vlog-sv-verif`, `vlog-clock-gen`, `vhdl-clock-gen` | `tbDetect/rules.ts` | Reused as findings (§ 5.1). |
| Board-port veto: a unit with board ports is a design even with `wait for` in it | `rules.ts` (`*-board-ports`), `score.ts` | The example above has `LEDR`, so it is a design and is checked. |
| Role override: *Treat as design / testbench* | `TestbenchOverrides`, pane role badge | Lets a student switch the check on or off for one file. |
| Re-analysis 500 ms after the last edit, cached by content | `useTestbenchAnalysis.ts` | Live warnings with no new timer. |
| Per-line markers, gutter, tooltip, problem dot in the Files panel | `diagnosticStore.ts`, `CodeEditor.tsx`, `FileRowLabel.tsx` (`ProblemMark`) | Where the warnings show. Today these are filled by a run and cleared at the next Start (`useDiagnostics.startRun`). |
| HDLBoard's own checks at Start (duplicate architectures, output port read, Verilog `assign` to an input) | `Workbench.tsx` → `warnProjectChecks` | The place for the phase 2 synthesis check and the console summary. |
| Start-up defaults a host can set | `public/settings.json`, docs/SETTINGS.md | The default of the new setting. |
| Settings › Editor page | `settings/EditorSection.tsx` | Where the switch goes. |
| Role labels `TB` / `RTL`, role icons (flask / chip) | `testbenchText.ts`, `RoleIcon.tsx`, `EditorPaneHeader.tsx` | Where `SIM-only` goes. |
| Testbench regions: the blocks of a testbench unit that carry evidence, with Alt+PageUp/PageDown navigation | `tbDetect/regions.ts`, docs/impl_split_screen.md § 5.6 | The model for SIM-only regions (§ 5.3). |

### 2.1 Code groups: today and with this change

Today the detector sorts every design unit into one of two groups, and the file gets a role from its units:

| Group today | Means | Label / icon | File role |
|---|---|---|---|
| **RTL** (design) | Synthesizable code for the board | `RTL`, chip | `rtl` |
| **TB** (testbench) | Simulation-only code that tests a design | `TB`, flask | `tb` |
| (both in one file) | | chip + flask | `mixed` |

A design with `wait for` in it is either a design (board ports veto the testbench evidence, as in the blink example)
or wrongly a testbench (a sub-module with ports). Both cases look like normal code to the student.

With this change there are three groups:

| Group | Means | Label | Icon | How it is decided |
|---|---|---|---|---|
| **RTL** | Hardware code that can run on the FPGA | `RTL` | chip | Hardware unit (§ 4), no `never`/`ignored` finding |
| **SIM-only** | Hardware code that **only works in simulation**: the board can't run it as written | `SIM-only` | chip with a small wave mark, amber | Hardware unit (§ 4) with at least one `never` or `ignored` finding, or marked *Simulation model* (S9) |
| **TB** | Testbench: simulation-only on purpose, never meant for the board | `TB` | flask | As today, and not a hardware unit |

The file group follows from its units, as the file role does today: `rtl`, `sim-only`, `tb`, or `mixed` (a testbench
and a design in one file; the design part may itself be `sim-only`, and the icon shows that).

The group is recomputed with the analysis, so it changes as the student types: fixing the last `wait for` turns
`SIM-only` back into `RTL` within 500 ms. That moment is the reward, and the UI should make it visible (§ 5.3).

## 3. Research

### 3.1 What can't be synthesized

**A. Never synthesizable.** Synthesis fails, or the construct means nothing in hardware. These get the full warning.

| Construct | VHDL | Verilog | Found today by |
|---|---|---|---|
| Time delays | `wait for`, `wait;` | `#10` in `always`/`initial` | `vhdl-wait-for`, `vhdl-wait-forever`, `vlog-delay` |
| Waiting on something other than one clock edge | `wait until x = '1'`, `wait on x` (except § 3.3) | `@(x);`, `wait(...)` inside a block | `vhdl-wait-until`, `vlog-event-wait` (only in `initial` today; extend to `always`) |
| Generated clocks | `clk <= not clk after 10 ns` | `always #5 clk = ~clk` | `*-clock-gen` |
| File and text I/O | `file f : …`, a `line` variable, `readline`/`writeline`/`read`/`write` on one | `$fopen`, `$fscanf`, `$fdisplay`, `$dumpfile` | `vlog-file-io`. For VHDL a **new** matcher: `vhdl-file-io` also fires on the `use std.textio` import alone, so it is not reused (S10). |
| Ending the simulation | a call: `std.env.stop`, `std.env.finish`, or `stop;` / `finish;` after `use std.env` | `$finish`, `$stop` | `vlog-end-sim`. For VHDL a **new** matcher: `vhdl-end-sim` also fires on `use std.env` alone (`rules.ts`), so it is not reused (S10). |
| Simulation time | `now` | `$time`, `$realtime` | **new** |
| Pointers and dynamic memory | `access` types, `new`, `deallocate` | — | **new** |
| Protected types | `type … is protected`, a `shared variable` **of a protected type** | — | **new**. A `shared variable` of an array type is *not* matched: Quartus's own true dual-port RAM template uses one (§ 3.3). |
| Random numbers | `uniform` (`math_real`) on signals | `$random`, `$urandom` | **new** |
| Verification-only statements | — | `force`/`release`, `fork`/`join`, `event`, `program`, `class`, `randomize` | `vlog-sv-verif` (partly); `force`, `fork`, `event` **new** |
| `real` signals or ports | `signal x : real` | `real x;` | **new** (warn only on signals and ports, never on constants and generics) |
| A clock edge outside the register template | `if falling_edge(a) … elsif falling_edge(b)`, a branch after the edge | `always @(posedge a or posedge b)` whose `if` tests neither | **new**: `vhdl-edge-template`, `vlog-edge-template` (§ 3.4) |

**B. Synthesizes, but synthesis ignores part of it, so the board behaves differently.** Still a warning, with text
that says *ignored* rather than *won't build*.

| Construct | VHDL | Verilog | Found today by |
|---|---|---|---|
| Assignment delays | `x <= a after 10 ns` | `assign #5 y = a;` | `vhdl-after`, `vlog-assign-delay` |
| Console output | `report`, `assert` | `$display`, `$monitor`, `$write`, `$strobe` | `vhdl-assert`, `vlog-display` → **quiet** warning (gutter `!` and tooltip only, `Diagnostic.quiet`). These are harmless and common while debugging a design. |

**C. Legal, but behaves differently on hardware** (incomplete sensitivity lists, unintended latches, multiple
drivers, combinational loops). This is a separate feature: phase 2 covers part of it for VHDL, phase 3 the rest (§ 8).

**D. Depends on the tool or the board** (internal `'Z'`, fit, timing at 50 MHz). Out of scope; only Quartus can say.

### 3.2 What `ghdl --synth` catches (tested with GHDL 6.0.0, the version `fetch-ghdl.sh` bundles)

| Test design | Result | Time |
|---|---|---|
| The blink process above | `error: signal assignment not allowed here`, `error: wait must be the last statement` | ~0.1 s |
| `if` without `else` in a combinational process | `error: latch infered for net "LEDR" (use --latches)` | ~0.1 s |
| Two concurrent assignments to `LEDR(0)` | `error: multiple assignments for "LEDR" offsets 0:0` | ~0.1 s |
| `std.textio` `line` variable | `error: variable with access type is not synthesizable` | ~0.1 s |
| `LEDR(0) <= SW(0) after 10 ns` | **accepted, no message** (the delay is silently dropped) | — |
| `process(SW(0))` reading `SW(1)` (incomplete sensitivity list) | **accepted, no message** | — |

So GHDL is exact for category A and catches some of C. Its wording is not student-friendly, so it needs HDLBoard
advice (phase 2). It misses B and incomplete sensitivity lists, so the static checks are needed anyway.
Verilog has no synthesis tool in HDLBoard (Icarus has none, Yosys is not bundled), so Verilog relies on phase 1
alone.

### 3.3 Things that look simulation-only but are not (false positives to avoid)

- `wait until rising_edge(clk);` (or `clk'event and clk = '1'`) as the **only** `wait` in a process: a clocked
  process, synthesizable. Do not warn.
- A Verilog `initial` block **without** `#` or `@`: Quartus uses it as a power-up value or ROM content. Do not warn.
- Signal initial values (`signal c : unsigned(3 downto 0) := (others => '0')`): fine on Intel FPGAs. Do not warn.
- `real` and `math_real` in constants and generics, computed once (`constant N : natural := integer(ceil(log2(...)))`).
- `assert` on constants or generics, e.g. a parameter range check: ignored by synthesis but harmless. It stays quiet.
- Anything inside `translate_off/on` or `` `ifndef SYNTHESIS `` (S6).
- `use std.textio.all;` with no file, no `line` variable and no read/write: nothing happens, nothing to warn (S10).
- A `shared variable` of an array type written from two clocked processes: Quartus's true dual-port RAM template
  ([Quartus Prime Pro user guide, *True Dual-Port Synchronous RAM*](https://docs.altera.com/r/docs/683082/25.1/quartus-prime-pro-edition-user-guide/true-dual-port-synchronous-ram)).
  Tested: GHDL 6.0 synthesizes it with `-frelaxed` or `--std=93`. Without either, VHDL-2008 analysis already
  rejects it ("type of a shared variable must be a protected type"), and that is a compile error, not this feature's.
  The vendor template is a negative test.

### 3.4 Edge-triggered code that is not a register template (built)

Quartus builds a flip-flop from **one clock edge, plus an optional asynchronous reset or set tested as a level
before it**:

```vhdl
if rst_n = '0' then           -- asynchronous reset (or set), a level
    q <= (others => '0');
elsif rising_edge(clk) then   -- the one clock edge, the last branch
    q <= d;
end if;
```

```verilog
always @(posedge clk or negedge rst_n)   // the clock, and one edge per reset or set
    if (!rst_n) q <= 0;                  // the first if tests a reset or set
    else        q <= d;
```

GHDL and Icarus simulate other shapes without complaint, so a design can work in HDLBoard and fail in Quartus.
The old `keyCouter2Led` example did exactly that: `if falling_edge(KEY_N(1)) … elsif falling_edge(KEY_N(0))`
counted and reset in the simulator, and Quartus refused it. Measured with **Quartus Prime 25.1 Lite**
(`quartus_map <top> --source=<file> --family="Cyclone V"`), 2026-11-19:

| Code (in one process / always block) | Quartus | Check |
|---|---|---|
| `if falling_edge(b) … elsif falling_edge(a)` (the old example) | Error 10820: *can't infer register for count[0] because its behavior depends on the edges of multiple distinct clocks*; Error 10822 | `vhdl-edge-template` |
| `if rising_edge(a) … elsif falling_edge(a)` | Error 10819: *can't infer register for x because it changes value on both rising and falling edges of the clock* | `vhdl-edge-template` |
| `if rising_edge(a) … elsif b = '1'` (a branch after the edge; `else` the same) | Error 10818: *Can't infer register for "x" … because it does not hold its value outside the clock edge* | `vhdl-edge-template` |
| `if rising_edge(a) and rising_edge(b)` | Error 10628: *can't implement register for two clock edges combined with a binary operator* | `vhdl-edge-template` |
| `if rising_edge(a) …` and `if rising_edge(b) …` assigning the same signal | Error 10820 | `vhdl-edge-template`, kind `two-clocks`, on the later `if` |
| Two `always @(posedge …)` blocks on two clocks assigning one register | Error 10028: *Can't resolve multiple constant drivers* | `vlog-edge-template`, kind `two-clocks`, on the later block (the drivers check of § 8.1 warns too) |
| `always @(posedge a or posedge b) if (c) …` (the `if` tests no edge) | Error 10200: *cannot match operand(s) in the condition to the corresponding edges in the enclosing event control of the always construct* | `vlog-edge-template` |
| `always @(posedge up or posedge down) if (down) count <= count - 1; else count <= count + 1;` (the "reset" loads from the register: a second clock) | **Builds**, Warning 13004: *Presettable and clearable registers converted to equivalent circuits with latches. Registers power-up to an undefined state*; the board does not count | `vlog-edge-template`, kind `two-clocks` |
| `always @(KEY_N[1:0])` keeping `count` and `key_prev` (the old Verilog example) | **Builds**, Warning 10240: *inferring latch(es) for variable "count", which holds its previous value* | `vlog-level-storage` (tier `ignored`: it builds, but the board does not behave like the simulation) |
| `if b = '0' … elsif falling_edge(a)` (the new example), a reset and a set before the edge, `rising_edge(a) and b = '1'`, two `if`s on two clocks assigning two signals, the same clock in two `if`s, `a'event and a = '1'` | accepted | no finding (`registerTemplates.test.ts`) |
| `always @(negedge a or negedge b) if (!b) …`, `always @(posedge a or posedge b or posedge c) if (b) … else if (c) …`, `always @(a or b) x <= a & b;` | accepted | no finding |

The VHDL matcher walks each process's `if` / `elsif` / `else` / `end if`, and flags a branch that has two edges in
its condition, or comes after a branch with an edge in the same `if`. The `else` of `x <= a when c else b` is not a
branch. The Verilog matchers read the sensitivity list: with two or more edges, the first `if` must name one of them;
with none, a variable assigned with `<=` must not be read in the block (it keeps a value, so Quartus makes a latch).
The design check reads the code as synthesis does (`blankSource(…, 'synthesis')`: SYNTHESIS defined), so an
`ifdef SYNTHESIS branch is checked and its `else`, like `ifndef SYNTHESIS, is not. Two `if`s or blocks clash on a
register only where their bits can meet (`LEDR(0)` and `LEDR(1)` are two registers, `bits.ts`); code inside
`translate_off` takes part in no comparison. A latch is a variable that some path through the block leaves unassigned (an
`if` without `else`, a `case` without `default`; the block is walked as statements), or one assigned from itself; a
variable every path assigns is plain logic, in any order. A `wait until` is a clocked process when its condition has one
edge, in parentheses or with an enable joined by `and`, and no `for`, `or` or `on` (Quartus Prime 25.1 Lite builds
`wait until (rising_edge(clk))` and `wait until rising_edge(clk) and en = '1'`). Verilog names are compared with
case (`q` and `Q` are two registers), VHDL names without; a write inside `translate_off` takes part in no comparison.

Two views of the code meet in `hardware.ts`: the hardware walk follows the instances synthesis sees, and knows the
modules only synthesis sees (a module inside `ifdef SYNTHESIS); a testbench's DUT is found from the instances the
simulator runs, so an `ifndef SYNTHESIS around the DUT instance still pairs it. The blanker now blanks the directives
themselves, so a directive no longer hides the statement after it.

`always_ff` and `always_latch` are read as `always` (an `always_latch` is a latch on purpose). The latch rule asks for a
value kept without a clock: a variable assigned from itself (`x <= x + 1`) or one that decides the block (`if (x_prev …)`);
reading another output (`x <= a; y <= x;`) is plain logic. Each finding carries its language, so a Verilog finding
shows the Verilog template. In VHDL, `wait until` is a clocked process only with one edge and no other wait outside
`translate_off`.

**The message names the register and its clocks**, as the tools do, but names no tool: HDLBoard boards include
AMD/Xilinx ones (Basys 3, Nexys A7) built with Vivado. Quartus says *can't infer register for count[0] because its
behavior depends on the edges of multiple distinct clocks* (10820); Vivado says *[Synth 8-5787] Register … is clocked
by two different clocks in the same process*
([forum thread](https://embdev.net/topic/544440)). For the old example the warning reads:

> ⚠ **`count` uses two clocks, `KEY_N(1)` and `KEY_N(0)`: a register allows one clock edge, plus an optional asynchronous reset or set.**
>
> Allowed: one clock edge, plus an optional asynchronous reset or set tested as a level before it:
> `  if rst = '0' then             -- reset or set: optional, a level`
> `  elsif rising_edge(clk) then   -- the one clock edge, last`
> Here: `KEY_N(1)` is one clock, `KEY_N(0)` a second clock → error.
> The simulator runs it anyway, but synthesis stops here. Choose one of them as the clock, …

The headline is written for a beginner: what is wrong, then the rule. The tooltip shows the allowed shape with
comments, and marks the student's own clocks with "→ error".

The matcher hands the names with the line (`ConstructMatch.register`: the kind, what the `if` assigns, the clocks), and
`registerText` (`simOnlyText.ts`) words one headline per kind: two clocks, both edges of one clock, a change
outside the edge, two edges in one condition, a Verilog `if` that tests no edge, a latch. The tooltip gives the template above, and the usual fix for a button: sample it on the board's clock and compare it
with its value one clock earlier (`keyCounter7Seg` does this).

Sources: the Quartus runs above; Intel's register guidance, *Recommended HDL Coding Styles* in the
[Quartus Prime Pro user guide: Design Recommendations](https://www.intel.com/content/www/us/en/docs/programmable/683082/25-1/recommended-hdl-coding-styles-revision.html)
(and the templates under *Edit > Insert Template*); forum threads on the same errors, for example
[Error 10818](https://community.altera.com/discussions/quartus-prime/synthesis-error-10818/208234),
[multiple distinct clocks](https://community.altera.com/discussions/quartus-prime/cant-infer-register-because-its-behavior-depends-on-the-edges-of-multiple-clock/188680) and
[Error 10200](https://community.altera.com/discussions/quartus-prime/quartus-prime-verilog-error-10200-verilog-hdl-conditional-statement-error/323442).

### 3.5 The simulator's own clock (built)

HDLBoard gives every board a slow clock, `CLOCK_500Hz` unless the board's JSON names it (`ports.clock500Hz`), so a
design can count slowly enough to watch. The FPGA board has no such pin, so a hardware design that **reads** it only
works in the simulator: it gets the `sim-clock` finding (tier `never`, so the file is SIM-only) on the first line
that reads it (`simOnly/simulatorClock.ts`). The message names the board's own clock and the count for the same
rate: *On the board, use `CLOCK_50` (50 MHz) instead, and count 100 000 of its cycles for each tick of
`CLOCK_500Hz`.*

Not a read, and not flagged: the port declared and unused (every board's starter file declares it, marked
*Simulator only*), a component declaration or a formal (`CLOCK_500Hz =>`, `.CLOCK_500Hz(`), a Verilog `input`
declaration, code inside `translate_off`, and a unit without that port (a signal of the same name is its own). The
actual of a port map is a read. The clock comes from the active board (`CheckInput.simulatorClock`); with *Simulation
only* nothing is checked. The examples that show the slow clock (`blinkTest`, the Basys 3 and Nexys A7
`keyCounter7Seg`) are SIM-only on purpose, and a test says so.

## 4. Which code is hardware

One pure function decides it for everything that needs to know: the live warnings, the code groups, pairing, and the
phase 2 targets. They never disagree about which unit is hardware or which unit a testbench tests.

```ts
/** docs/impl_sim_only_warnings.md § 4. Pure; recomputed with the analysis. */
export function hardwareView(analysis: ProjectAnalysis, overrides: TestbenchOverrides): HardwareView;

export interface HardwareView {
  /** `fileId:unitKey` of every checked unit. */
  readonly hardware: ReadonlySet<string>;
  /** Testbench unit -> the design it tests (§ 4.2); absent when none or ambiguous. */
  readonly dutOf: ReadonlyMap<string, string>;
  /** Units whose role is corrected to `rtl` for pairing (§ 4.2). */
  readonly asDesign: ReadonlySet<string>;
}
```

**Roots.** A unit is a root of the hardware when its file is not marked *Treat as testbench* and one of these holds:

1. the detector calls it a design (`role === 'rtl'`);
2. it has board ports (the detector's veto: `hasBoardPorts`);
3. it is the **resolved DUT** of a testbench (§ 4.2);
4. its file is marked *Treat as design* or *Simulation model*.

**Walk.** Every unit a checked unit instantiates is checked too, directly or through other units. The walk follows
`instances` through `ProjectAnalysis.unitIndex`, per language, and includes instances in an architecture in another
file (§ 4.1). It skips instances inside `translate_off` / `` `ifndef SYNTHESIS `` (§ 4.3). It never enters a file
marked *Treat as testbench*, and it guards against cycles like the detector's other passes.

The student's *Treat as testbench* always wins: such a file is never a root, never reached, and never anybody's DUT.

| Case | Checked? |
|---|---|
| The blink example (has `LEDR`) | Yes, root 2. |
| `counter.vhd` with ports and a stray `wait for`, used by the board design | Yes, by the walk. The detector calls it a testbench (strong evidence), but it is in the hardware. |
| The same `counter.vhd`, used only by `counter_tb.vhd` | Yes, root 3: it is `counter_tb`'s resolved DUT. |
| `counter_tb.vhd`, portless, instantiates `counter` | No. |
| `uart_monitor` instantiated by `counter_tb` beside the DUT | No: a testbench's other instances are not its DUT (§ 4.2). |
| A monitor instantiated by the board design inside `translate_off` | No (§ 4.3). |
| A standalone sub-module with `wait for` that nothing uses yet | No: it looks like a testbench. Its badge says TB, and *Treat as design* turns the check on. |

### 4.1 An entity and its architecture in different files (VHDL)

The detector builds units from entities and attaches only the architectures **in the same file**
(`designUnits.ts`, `vhdlUnits` / `architectureOwners`). An architecture whose entity is in another file belongs to no
unit, so it is dropped. With the board ports in `top.vhd` and the blink process in `top_rtl.vhd`, phase 1 would reach
the entity and find no `wait for` anywhere.

Fix, without changing detection:

- `designUnits.ts` also returns the file's **unowned architectures**: name, entity name, span, ranges, blocks and
  instances, with the architecture's own file id and lines. A new field `FileAnalysis.architectures`; units and roles
  are unchanged, so the golden fixtures stay green (S7).
- At project level, `hardwareView` links each unowned architecture to its entity by name (VHDL case rules, via
  `unitIndex`). The architecture's instances join the walk (§ 4), and its code gets the construct matchers. The
  findings carry the **architecture's** file id and line numbers, so the warnings land where the code is.
- The architecture's file gets the group of its entity's unit: `top_rtl.vhd` is `SIM-only`, and so is `top.vhd`
  (its unit is). An architecture whose entity is in no file is not checked. That is already a compile error.

### 4.2 A design the detector took for a testbench, and a testbench's DUT

`counter.vhd` has ports and a stray `wait for`, so the detector calls it a testbench (strong evidence). Two ways
it is still hardware:

- **The board design uses it.** The walk reaches it.
- **Only `counter_tb` uses it.** Then nothing reaches it, so the testbench has to name it. Today's pairing can't:
  it only takes `rtl` units as designs (`pairing.ts`, `rtlUnits`).

**Resolved DUT.** For each testbench unit (role `tb`, and its file not marked *Treat as design*), take the units it
instantiates that the project defines, leaving out files marked *Treat as testbench*. Its DUT is, in this order:

1. the instance target paired with it by a stored pair override (`overrides.pairs`), when the code doesn't
   contradict it (`contradictsCode`);
2. else the one whose name is the testbench's stem (`testbenchStem`: `counter_tb` → `counter`);
3. else the only one with role `rtl`;
4. else the only one at all;
5. else none. The case is ambiguous, so nothing is promoted: a testbench that instantiates a DUT and two monitors,
   none named after it, promotes nothing rather than a guess.

**Role correction.** Every unit the walk reaches from a root of type 2, plus every resolved DUT, is in `asDesign`.
`effectiveFile` (`pairing.ts`) gives those units the role `rtl` as an **automatic override**, with lower priority
than the student's own *Treat as …* mark. So pairing, the split view and Run see `counter.vhd` as a design, and
`counter_tb` pairs with it. The live warnings and the phase 2 targets read the same `HardwareView`.

The group is `SIM-only` from the findings (§ 5.3), whatever the role. `pairing.test.ts` gets both cases.

### 4.3 Code the student excluded from synthesis

The lexer records `translate_off … translate_on` and `` `ifndef SYNTHESIS `` regions but keeps their code, because
the detector uses it as testbench evidence (`blank.ts`, `simOnlyRegions`). So an instance inside such a region is
still in `DesignUnit.instances`. Dropping findings afterwards is not enough: a monitor the board design instantiates
inside `translate_off` would still be reached, promoted to `rtl` for pairing, and warned about in its own file.

- `FileAnalysis` keeps its `simOnlyRegions` (the field `analyzeFile` already has in hand).
- `Instance` gets `guarded: boolean`, true when its line is in one of them.
- The walk skips guarded instances (§ 4); the DUT resolution counts them (a testbench may guard anything).
- Findings inside those regions are still dropped (S6).

Test with two files: `top.vhd` instantiates `monitor` (in `monitor.vhd`, with `wait for`) inside `translate_off`.
`monitor` is not checked and keeps its role. Move the instance below `translate_on`, and `monitor` becomes checked,
`SIM-only`, and a design for pairing.

## 5. Design

### 5.1 Findings — new module `src/components/workbench/simOnly/`

| File | Content |
|---|---|
| `constructs.ts` | The catalogue of § 3.1 A and B as data: `id`, `language`, `tier: 'never' \| 'ignored' \| 'quiet'`, and either `fromRule: RuleId` (reuse the detector's evidence lines) or `find(unitText)` (a new matcher on the same blanked code, written like those in `rules.ts`). |
| `hardware.ts` | `hardwareView(...)` (§ 4): checked units, resolved DUTs, role corrections. The one source for warnings, groups, pairing and phase 2. |
| `groups.ts` | `codeGroups(analysis, hardware, findings, overrides): CodeGroups`: the group of every unit and file (§ 2.1), and the SIM-only regions (§ 5.3). |
| `findings.ts` | `simOnlyFindings(file: FileAnalysis, hardware): SimOnlyFinding[]`: for each hardware unit, its constructs, with lines inside `simOnlyRegions` dropped and the § 3.3 exceptions applied. One finding per construct per line. |
| `simOnlyText.ts` | Every message, in English, one entry per construct: a short title, why it can't run on the chip, and what to write instead. |
| `*.test.ts` | § 9. |

```ts
export interface SimOnlyFinding {
  readonly fileId: string;
  readonly line: number;
  readonly unitName: string;
  readonly construct: SimOnlyConstructId;   // e.g. 'vhdl-wait-for'
  readonly tier: 'never' | 'ignored' | 'quiet';
}

export type CodeGroup = 'rtl' | 'sim-only' | 'tb';
export type FileGroup = CodeGroup | 'mixed';

export interface CodeGroups {
  /** Key `fileId:unitKey`. */
  readonly byUnit: ReadonlyMap<string, CodeGroup>;
  readonly byFile: ReadonlyMap<string, FileGroup>;
  /** Per file: the blocks of SIM-only units that hold a finding, like `TestbenchRegion`. */
  readonly simOnlyRegions: ReadonlyMap<string, readonly TestbenchRegion[]>;
}
```

The group is computed at project level, not in `analyzeFile`: whether a unit is hardware depends on who instantiates
it (§ 4), which a per-file, content-cached analysis can't know. `UnitRole` and `FileRole` do not change (S8).
`FileAnalysis` gains one field, `architectures` (§ 4.1).

**The group follows the findings, never the role.** A unit is `sim-only` when it is checked (§ 4) and has a
`never` or `ignored` finding. A file is `sim-only` when one of its checked units, or one of its unowned
architectures, has one. The file's role decides nothing here. That keeps the line markers and the label in step:
a file can't have SIM-only warnings and no SIM-only label, or the other way round.

The *Simulation model* mark is a new optional field of `TestbenchOverrides`:
`simModels?: Readonly<Record<string, true>>` (fileId). It is saved in the desktop `Workspace` like the role overrides
(docs/impl_split_screen.md § 6.7): `WORKSPACE_VERSION` stays 1, a missing field reads as empty, an older app ignores it.

Pure and structured-clone friendly, like the detector, so it can move to the detector's Worker later.

Constructs taken from the detector reuse its line evidence, so there is one regex per construct, not two.
The new ones (`now`, `access`/`new`, `protected` types, `real` signals, VHDL file operations, `force`, `fork`,
`event`, `$time`, `$random`) live only in `constructs.ts`, so the detector's scores don't change (S7).
`vhdl-wait-until` gets the § 3.3 clock-edge exception here, not in the detector.

A detector rule is reused only where its every match is an operation that can't be built (S10). Each reuse is
checked against the rule's own tests in `rules.test.ts`. Where a rule also matches a harmless clue, as
`vhdl-file-io` matches the import, `constructs.ts` has its own matcher instead.

### 5.2 Showing them

**Editor.** Findings become diagnostics with `severity: 'warning'` (`quiet: true` for tier `quiet`) and an
`advice` with the text from `simOnlyText.ts`. They belong to a **live layer** that is not cleared at Start:

- `useSimOnlyWarnings(analysis, overrides, enabled): DiagnosticsByFile` recomputes when the analysis changes,
  so 500 ms after typing stops.
- `Workbench.tsx` merges the layer with the run's diagnostics (`mergeDiagnostics(run, live)`, a new pure function in
  `diagnosticStore.ts` with the same caps and dedup) before handing them to the editor (`diagnostics={…}`) and to
  `problemsOf`.
- When phase 2 reports the same line, the message shown is the live one, with GHDL's text kept as a detail.

Example tooltip for the blink example, line 4:

> ⚠ **`wait for` only works in simulation.** The FPGA has no timer that `wait for` could use, so Quartus rejects
> this process. On the board, count clock cycles instead: at 50 MHz, 500 ms is 25 000 000 cycles of `CLOCK_50`.
> *Show example*

*Show example* opens a short counter template, in the file's language. The clock name and frequency come from
the active board (its clock port); without one, the text says "the board's clock".

Tier `ignored` wording, e.g. `after`:

> ⚠ **`after 10 ns` is ignored on the hardware.** Synthesis drops the delay, so on the board `LEDR(0)` follows
> `SW(0)` at once. Only the simulation shows the delay.

**Dismissed by a click, shown again from the console.** A click in the editor clears a run's markers, and makes
the file's live warnings *quiet*: the text after the line goes, the gutter's `!`, its tooltip and the SIM-only label
stay (`findingDiagnostics.ts`: `quietFile`, `withQuieted`). They are keyed by file and headline, not line, so they
stay quiet while lines above move, and a new problem still shows. A console link to the file (the Start summary's
*Line n*, or a compiler message) shows them again (`showFile`), and so does a click on a line number or its `!`, for
that line (`showLine`; the gutter click no longer clears the run's markers). The `!` sits past the pane divider's
grab strip, which used to cover it.

**The problem card, with Copy.** A marked line number (or its `!`) has no native tooltip any more: resting the
pointer on it for 350 ms opens a card beside the gutter (`DiagnosticCard.tsx`, `useDiagnosticCard.ts`). It shows the
severity, the headline, the explanation with its code lines in a code box, and who says it, as text that can be
selected; **Copy** puts `file, line n`, the line itself and the message on the clipboard as plain text
(`diagnosticCardText.ts`), ready to paste to a teacher or into a chat. The card stays while the pointer is on it; a
click on the line number pins it; Esc, a scroll or a click in the code closes it. Compiler errors get the same card.
The Start summary's *Line n* link opens it too, pinned, once the line is in view (`usePinCardOnReveal`, `RevealRequest.openCard`).

**From the keyboard.** Alt+Enter on a line opens its problem card, pinned, with the focus on Copy; Esc closes it and
hands the focus back to the code. Esc is caught before the editor's own Esc, so it closes only the card. A pinned card
follows its line when the code scrolls. A dismissal is kept per occurrence (the n-th warning with a headline in the
file, and the code on its line), so restoring one line restores no other, a copy inserted above a dismissed one is
another warning, and editing the line shows its warning again. Two identical lines with the same warning cannot be told apart: a copy inserted above a
dismissed line takes the dismissal (how many are quiet never changes, only which one).

**Console.** At Start (`warnProjectChecks`), one summary line per SIM-only file The summary is built from the files of the run, analysed at Start (`designViewNow`), not from the check of 500 ms
ago, and only for those files., not one line per finding:
`blink.vhd is SIM-only: 2 lines only work in simulation; they run here but not on the board.` The file name links to
the first line.

### 5.3 The `SIM-only` code group in the UI

Everywhere the UI shows `RTL` or `TB` today, it can now show `SIM-only`:

| Place | Today | SIM-only |
|---|---|---|
| Pane header badge (`EditorPaneHeader.tsx`, `BadgeMenu`) | `RTL` / `TB` button with its menu | `SIM-only` button in amber, same menu. Tooltip: "Simulation-only design — 3 lines run in the simulator but not on the board". |
| Files panel, file menu (`RoleIcon`, `FileRowLabel`) | chip / flask / plain file | the SIM-only icon (chip with a wave mark, amber), tooltip as above. `mixed` with a SIM-only design part shows that icon plus the flask. |
| Badge menu | *Treat as testbench / design*, *Use detection*, pairing | adds *Simulation model* (S9), a check item. Its hint: "This code is meant for simulation only. Keep the SIM-only label, hide the line warnings." |
| `Detected: …` line in the menu (`detectedAs`) | "Detected: Design (high)" | "Detected: SIM-only design — wait for (line 4), wait for (line 6)". It lists the findings, so the student sees *why*; this also fills the rule-explanation view `RULE_TEXT` was written for. |
| Regions | TB regions in testbench units, Alt+PageUp/PageDown | **SIM-only regions**: each process / `always` / `initial` block of a SIM-only unit that holds a finding, with a faint amber band in the gutter. The same keys move through them in a design pane. The navigator says "SIM-only 1/2". |
| Split view, pairing, Run | — | unchanged: SIM-only counts as a design (S8). |

When the group changes from `SIM-only` to `RTL` because the last finding was fixed, the badge changes
with a short transition. Screen readers get a polite announcement: "blink.vhd is now RTL: it can run on the board".

In *Simulation only* mode (§ 6), there is no `SIM-only` group: those units show as `RTL` as today.

All strings go into `testbenchText.ts` (`TEXT.simOnlyLabel`, `TEXT.simOnlyTooltip`, `TEXT.fileRoleSimOnly`,
`TEXT.simModel`, …), so they stay in the one file a translation needs.

### 5.4 Accessibility

The SIM-only badge has text, not only colour, and the icon has a tooltip and screen-reader text, as `RoleIcon` does today. Warnings are announced the way current markers are. The amber colour uses
the existing warning token, which already passes the contrast tests (`themeContrast.test.ts`).

## 6. The setting

A mode, chosen like the testbench split view's *Automatic / Always / Never* (radio choices in `EditorSection.tsx`):

| | |
|---|---|
| Where | Settings › Simulation, a card **Design check** (first on Settings › Editor; moved 2026-11-19). |
| Mode **Synthesis** (default) | "Check designs for FPGA synthesis. Lines that only work in simulation get a warning, and the file is marked `SIM-only`." Everything in this plan is active. |
| Mode **Simulation only** | "Don't check designs for synthesis. For models and exercises that never go to an FPGA." No live layer, no `SIM-only` group (those units show as `RTL`, as today), no console summary, no phase 2 check. Testbench detection is unchanged. |
| Default | **Synthesis.** |
| Stored | This browser's site storage, like the other editor choices (`hdlboard.designCheck.v1`: `'synthesis' \| 'simulation'`); other open tabs follow it. |
| Start-up default | `public/settings.json` key `designCheck` (`"synthesis"` or `"simulation"`, default `"synthesis"`), documented in docs/SETTINGS.md next to `bouncyButtons`. A student's own choice still wins. |
| Shown at Start | In *Simulation only* mode, the run's first console line (the one that names the board, `logRunBoard`) adds "Design check: Simulation only", linked to the setting. A student who sees no warnings can tell why. |

The names say what is checked *for*: synthesis (the FPGA) or simulation (the simulator). They match the words
Quartus and GHDL use (`--synth`), and need no explanation for a student.

A future third mode, **Synthesis (strict)**, could turn the warnings into errors that block the run, for graded labs.
It is out of scope (S1); the setting is a mode already, so it can be added later without migrating it.

## 7. Phase 2 — GHDL synthesis check (VHDL) — future plans

**Status: future plan, not scheduled.** Phase 1 and the static multiple-driver check (§ 8.1) cover what a course
needs most. Phase 2 would add what only a synthesis tool sees — latches above all — for VHDL only, at the cost of
protocol 8 and a second GHDL process per run. The design below is kept so the work can start from it.


1. **Verify the bundled builds** have synthesis: Windows installer, AppImage (`fetch-ghdl.sh`, v6.0.0), Docker /
   Render image. The winget GHDL 6.0.0 mcode build used for the tests in § 3.2 does.
2. **Request: a new frame, protocol 8.** The client chooses the targets, because only it has the project analysis, the
   overrides and the setting. `RUN` is a text frame (`RUN <top file>[ @<unit>]`, then `@@FILE …@@` sections), and
   today's decoder reads any extra header text as part of the top file name, and refuses anything before the first
   `@@FILE` marker (`protocol.ts`, `parseRunHeader`, `splitRunBody`). So `RUN` itself stays unchanged. The targets go
   in a frame of their own, sent just before `RUN`, as `OPTIONS` is:

   ```
   SYNTH-CHECK
   ["blink","counter"]
   ```

   - The body is a JSON array of VHDL unit names (at most 3); `[]` means no check. The frame holds for the next `RUN`
     only, and the session forgets it after that run, so a later run without one gets no check.
   - `hdlClient.ts` sends it only when `backendSpeaks(SYNTH_PROTOCOL)` (`SYNTH_PROTOCOL = 8`, `PROTOCOL_VERSION`
     `'8'`, a line in the version history). The mode is *Simulation only*, the run is Verilog, or there is no target → the frame
     is not sent.
   - An older backend never receives it and gets the exact `RUN` frame it gets today. Protocol 7's `ERROR protocol`
     rule would refuse an unknown frame without stopping the run, but the client doesn't rely on that.
   - Server → client: `SYNTH` frames carry the messages (GHDL text). One `SYNTH-END <run>` frame ends the check. Both
     carry the run number, so a result that arrives after the next Start is dropped.
3. **Target rule** (client, `simOnly/synthTargets.ts`, pure, from the same `HardwareView` as § 4): the targets are
   the run's checked units that no other checked unit in the run instantiates. These are the roots of the hardware.
   - **Design run:** the top unit itself.
   - **Testbench run:** the testbench's resolved DUT (§ 4.2), never the testbench. A portless testbench's
     `wait for` lines are not checked. No resolved DUT → no check.
   - **Ambiguous:** a unit name that resolves to two files, an entity with several architectures and no
     configuration, or a VHDL `configuration` in the run. That unit is left out without a message. A wrong check
     is worse than none.
   - At most 3 targets per run.
4. **Server** (`server/src/engines/ghdlEngine.ts`): after the run's analysis succeeds, for each target it runs
   `ghdl --synth <the run's flags> <unit>` in the session directory, from the already-analyzed `work` library.
   The flags are the ones `planGhdlFlags` resolved for that run (`--std`, `-fsynopsys`, `-frelaxed`), and no source
   file is passed again.
   - **Tested** (GHDL 6.0.0): a design using `std_logic_unsigned`, analyzed with `-fsynopsys`, synthesizes with the
     same flags. Without `-fsynopsys`, synthesis fails with "use of synopsys package … needs the -fsynopsys option".
     That is the misleading warning this rule prevents.
   - `ghdl --synth … -e UNIT` without the files is refused ("unknown command option '-e'"); the unit name alone is
     the form that reads the library.
   - **Scheduling: Start is never delayed.** Analysis runs as today. Then, with the library analyzed, the
     simulation starts **and** the check is launched as a separate, independent child process. `READY` and the board
     do not wait for it. Sequential would put up to the full time limit on every Start; a bounded delay of 0.1–2 s
     is visible on a live board, and the check is advisory.
     - Time limit 2 s for all targets together; the check is killed then, or when the run ends or is stopped,
       whichever comes first. A killed check sends `SYNTH-END` with no messages.
     - `ghdl --synth` only reads the `work` library, and the simulation doesn't write it after elaboration, so the
       two processes don't race. The integration test confirms this on Windows and Linux.
     - It counts towards the session's process limit (`processCount`, docs/HOSTING_SIZING.md) as one more short-lived
       child. Where that limit leaves no room, the check is skipped and the run goes on.
   - A message about an option or a missing library unit (anything that is not about the design) is dropped and
     logged on the server only.
5. **Client:** parse with the existing GHDL diagnostic parser. Mark each message `severity: 'warning'`, and add
   advice in a new `synthAdvice.ts`:
   `signal assignment not allowed here` + `wait` → the `wait for` text; `latch infered` → latch text;
   `multiple assignments for` → multiple-driver text; `access type is not synthesizable` → file I/O text.
   An unknown message keeps GHDL's own text.
6. **Suppression after locating.** Synthesizing a target also synthesizes everything it instantiates. So GHDL may
   report a line in a child the client never named, such as a file marked *Simulation model*. After each `SYNTH`
   message is located to a file and line, the same filter as the live layer applies:
   - no warning in a file marked *Simulation model* or *Treat as testbench*;
   - none in a unit that is not in `HardwareView.hardware`;
   - none on a line inside `simOnlyRegions`.

   A dropped message changes no group: a *Simulation model* keeps its `SIM-only` badge.
7. Lines already in the live layer are merged (§ 5.2).

## 8. Phase 3 — legal but different on hardware (category C)

### 8.1 Multiple drivers (built)

On the FPGA a signal is one wire with one source. Two sources fight, and Quartus refuses the design ("can't
resolve multiple constant drivers"); the simulator resolves a `std_logic` to 'X' (the LEDs stay dark) and Icarus
lets the last write win. A common beginner mistake: the starter's `LEDR <= SW;` left in beside a new process that
drives `LEDR(0)`.

| | |
|---|---|
| A driver | VHDL: one process, or one concurrent statement (`<=`, `when … else`, `with … select`). Verilog: one `always` block, one `assign`, or one `wire x = …`. Every assignment of a process or block to a signal is one driver. |
| A clash | Two drivers of the same signal whose bits overlap: the whole signal meets any part of it; constant bits and ranges (`LEDR(0)`, `LEDR(7 downto 4)`, `LEDR[7:4]`) meet when they overlap; an index known only while running (`LEDR(i)`) meets only the whole signal. |
| Not a clash | Different bits; one process assigning a signal twice; a comparison `a <= b`; variables and loop variables; Verilog `initial` blocks (power-up values); a driver that drives `'Z'` (a tri-state bus); anything inside a `generate` (its alternatives or loop index decide); code hidden from synthesis (S6); two architectures of one entity. |
| Names | Only the body's declared signals (Verilog: nets and variables) and its entity's ports, which may be in another file (§ 4.1). |
| Where | Hardware code only (§ 4), in *Synthesis* mode (§ 6); a *Simulation model* gets no warning. |
| Shown | A live warning on every driver: "`LEDR` has more than one driver.", and in the tooltip the other drivers' lines and what to do. At Start, one console line per signal, linked to its first driver. The group does not change: the code is not simulation-only, it is wrong on both. |
| Code | `simOnly/drivers.ts` (drivers per architecture or module, cached with the file's scan; the clashes), `driverLanguages.ts` (how each language assigns), `bits.ts`; tests `drivers.test.ts`. |

### 8.2 Still to plan

Static checks, the same structure as phase 1, but a separate catalogue and its own setting later if needed:
incomplete sensitivity lists (neither GHDL nor Icarus warns; § 3.2), latches, and combinational loops. Follow docs/HDLBoard_VHDL_Static_Analysis_Recommendations.md: group related findings,
distinguish concurrent from sequential assignments. Plan this phase separately when phase 1 has shipped.

## 9. Tests

- **`constructs.test.ts`:** for every construct, one positive and one negative snippet in each language it applies to.
  The negatives include every case in § 3.3.
- **`hardware.test.ts`:**
  - board top → sub-unit → sub-sub-unit;
  - a testbench that instantiates the design (the design is checked, the testbench is not);
  - both role overrides;
  - an instance cycle;
  - a VHDL unit name in different case.
- **`findings.test.ts`:**
  - the blink example gives two `never` findings, on lines 4 and 6;
  - lines inside `translate_off` and `` `ifndef SYNTHESIS `` give none;
  - a mixed file is checked only for its design unit.
- **`constructs.test.ts`, negatives from the review:**
  - Quartus's true dual-port RAM template (`shared variable` of an array type) → no finding;
  - `use std.textio.all;` alone in a board design → no finding, group `rtl`; adding a `line` variable and a
    `writeline` → finding, group `sim-only`.
- **Split entity and architecture (§ 4.1):**
  - the blink example as `top.vhd` (entity, board ports) and `top_rtl.vhd` (architecture) → two findings
    in `top_rtl.vhd` at its own line numbers; both files `sim-only`;
  - the architecture in `top_rtl.vhd` instantiates `counter` from a third file → `counter` is checked;
  - the golden fixtures still pass: the new `architectures` field changes no unit or role.
- **`groups.test.ts`:**
  - blink example → unit and file `sim-only`; remove both `wait for` lines → `rtl`;
  - `counter.vhd` with ports and `wait for`, used by the board design: line warnings **and** the `SIM-only` label,
    checked together in one test, and the role is corrected to `rtl` for pairing (§ 4.2);
  - `counter.vhd` without board ports, tested by `counter_tb.vhd` only, with a `wait for` (so role `tb`) → it is
    `counter_tb`'s resolved DUT: checked, `SIM-only`, role `rtl` for pairing, and `counter_tb` pairs with it;
  - the same, with `counter.vhd` marked *Treat as testbench* → not checked, not a DUT, no pair;
  - `counter_tb` instantiating `counter` and `uart_monitor` → only `counter` is the DUT; with neither named after the
    testbench and neither `rtl` → no DUT at all;
  - `use std.env.all;` alone in a board design → no finding, group `rtl`; `std.env.finish;` in it → finding;
- **`hardware.test.ts`, guarded instances (§ 4.3):** the two-file monitor test — instance inside `translate_off` →
  `monitor` unchecked, role unchanged; the instance moved below `translate_on` → checked, `SIM-only`, `rtl`;
  - a portless testbench → `tb`; a file with a testbench and a SIM-only design → `mixed`;
  - *Simulation model* → `sim-only` with no line warnings; *Treat as testbench* → `tb`;
  - SIM-only regions: one per block with a finding, none for blocks without;
  - *Simulation only* mode → no `sim-only` anywhere.
- **Unchanged detection:** `fixtures.golden.test.ts` and `score.test.ts` pass unchanged (S7).
- **`diagnosticStore.test.ts`:**
  - `mergeDiagnostics` respects the caps and dedup;
  - the live layer survives `startRun`.
- **Settings:**
  - the mode is *Synthesis* by default;
  - `settings.json` `"designCheck": "simulation"` sets *Simulation only*;
  - a stored choice overrides the file.
- **Performance:** add the findings to `tbDetect/performance.test.ts`'s budget for a large file.
- **`synthTargets.test.ts`:**
  - design run → the top;
  - testbench run → the DUT, never the testbench;
  - ambiguous names, several architectures, a configuration → left out;
  - *Simulation only* mode or Verilog → no `SYNTH-CHECK`.
- **Phase 2 integration (server):**
  - the four § 3.2 designs give the expected messages;
  - a portless testbench (with `wait for`) driving a DUT with a latch: exactly one synthesis warning, in the DUT's
    file, on the latch; none in the testbench;
  - a `std_logic_unsigned` design with `-fsynopsys` on `auto`: no synthesis message;
  - a run whose synthesis check times out still simulates;
  - a `RUN` without a `SYNTH-CHECK` before it runs no synthesis, and a `SYNTH-CHECK` holds for one run only;
  - `READY` arrives while the check is still running (a fake `ghdl` that sleeps 1.5 s in `--synth`);
  - an unmarked top that instantiates a file marked *Simulation model* with a latch: after Start, the model keeps
    its `SIM-only` badge and gets no line warning;
  - stopping the run kills the check, and a `SYNTH` of the previous run arriving after the next Start is dropped.
- **Protocol (`hdlClient.test.ts`, `protocol.test.ts`):**
  - a new client talking to a protocol-7 backend sends exactly today's frames: no `SYNTH-CHECK`, the same `RUN`
    (with `@<unit>` for a selected unit), and the selected unit runs;
  - against protocol 8, `SYNTH-CHECK` comes right before `RUN`, and not at all in *Simulation only* mode;
  - `SYNTH-CHECK` with a body that is not a JSON array of names is refused with `ERROR protocol`, and the run goes on.
- **In the app:** in Chrome: paste the blink example and check the warnings, the chip,
  the tooltip, and that the LED still blinks; fix the code and watch `SIM-only` turn into `RTL`; switch to *Simulation only*
  and back to *Synthesis*; mark the file *Simulation model*, then *Treat as testbench*.

## 10. Steps

1. `simOnly/constructs.ts`, `findings.ts`, `simOnlyText.ts` with their tests (pure, no UI).
2. `FileAnalysis.architectures` and `simOnlyRegions`, `Instance.guarded` in the detector (§ 4.1, § 4.3), then
   `simOnly/hardware.ts` (`hardwareView`) with tests: roots, the split-file walk, guarded instances, the resolved DUT,
   and the automatic `rtl` role in `effectiveFile` (§ 4.2).
3. `simOnly/groups.ts` with tests, and the `simModels` override field (Workspace save and load).
4. `mergeDiagnostics` and `useSimOnlyWarnings`; wire into `Workbench.tsx` (editor markers, problem dots).
5. The setting: storage, `settings.json` key, Settings › Editor card, docs/SETTINGS.md.
6. The `SIM-only` group in the UI (§ 5.3): badge, icon, menu items, *Detected* line, SIM-only regions and their
   navigation, the RTL transition.
7. *Show example* templates (VHDL, Verilog), using the board's clock name.
8. Console summary at Start.
9. *Future plan.* Phase 2: verify the GHDL builds; protocol 8 (`SYNTH-CHECK`, `SYNTH`, `SYNTH-END`, version gating in
   `hdlClient.ts`); `synthTargets.ts`; the server's independent `--synth` child with the run's flags; `synthAdvice.ts`
   and the suppression filter.
10. docs/changelog.txt and help text; add the third group to docs/impl_split_screen.md § 4.5.

Steps 1–2 are independent of each other; 3 and 4 need both; 5–8 need 3 and 4.

## 11. Acceptance criteria

- The blink example simulates as before. Within one second of being pasted, with no run needed, it shows two
  warnings, and its file is in the `SIM-only` group (badge, Files panel icon, SIM-only region).
- Replacing the `wait for` process with a `CLOCK_50` counter turns the group into `RTL` within one second.
- The same blink example split into `top.vhd` (entity) and `top_rtl.vhd` (architecture) shows the two warnings in
  `top_rtl.vhd`, and both files are `SIM-only`.
- Quartus's dual-port RAM template and a design with only `use std.textio.all;` show nothing.
- The same process in a portless testbench shows no warning, and the file stays `TB`.
- *Simulation model* keeps `SIM-only` and removes the line warnings; the choice survives a restart of the desktop app.
- Pairing, the split view and Run behave for a SIM-only design exactly as for an RTL one.
- `wait until rising_edge(CLOCK_50);` in a clocked process, an `initial` ROM, and code in `translate_off` show
  nothing.
- In *Simulation only* mode, no new warning, chip or console line appears anywhere.
- Fresh install: the mode is *Synthesis*. `settings.json` can set *Simulation only* for everyone.
- Typing stays as fast as today: the check runs only with the detector, not on every keystroke.
- *Future plan,* phase 2: a latch in a VHDL board design gets a warning at Start explaining the missing `else`.
- *Future plan,* phase 2: a testbench run warns about its DUT only, and a design that needs `-fsynopsys` gets no synthesis message.
- *Future plan,* phase 2: Start takes no longer than today; the synthesis warnings arrive after the board is live.
- *Future plan,* phase 2: a new client works with an older backend exactly as today, without the check.

## 12. Open questions

1. Should a teacher be able to lock the setting per project (in `.hdlboard.json`), not just per host?
2. (Future plan.) Should phase 2 run on every Start, or only from a *Check for hardware* button? It costs about 0.1 s for a small
   design. A large design may take longer.
3. Should tier `quiet` (`report`, `assert`, `$display`) be visible at all in designs? Plan says gutter-only.
4. Is `SIM-only` the final label text? The badge is narrow; `SIM` alone would match `TB` / `RTL` in length, with
   "Simulation-only design" in the tooltip.
5. Should the Files panel be able to group or filter files by code group (RTL / SIM-only / TB)? Not planned; the
   icons are enough for the project sizes HDLBoard sees.
