# GHDL Backend — Implementation Plan

**Status: built and verified, 2026-09-17.** This started as a work order —
written to be executed by someone (or some agent) who had not been part of
the discussion that produced it, so every phase states the files to touch,
the exact edit, and the acceptance test that proves the phase is done — and
was then actually executed end to end; § 13 records what happened at each
phase, including the six real defects found and fixed along the way that
weren't anticipated by the plan text itself. It now serves double duty: the
work order, and the as-built reference for how the backend works and why.
The imperative phrasing throughout ("write this file," "the backend must")
is kept as-written, describing what each phase's code now actually does,
not a future instruction.

The end state — reached: the Workbench compiles and simulates the VHDL
project in its Files panel with real GHDL, and the board's LEDs and
7-segment displays show what that VHDL actually drives — not, as before,
a mock that copied the switches straight to the LEDs (`Design_Description.md`
§ 5 convention 11 records why that mock had to go first).

## Contents

- [0. Read this first — order of work, and the trap in it](#0-read-this-first--order-of-work-and-the-trap-in-it)
- [1. Goal and scope](#1-goal-and-scope)
- [2. Source documents, and how they were reconciled](#2-source-documents-and-how-they-were-reconciled)
- [3. The board interface contract](#3-the-board-interface-contract)
- [4. Architecture](#4-architecture)
- [5. Simulation strategy — the decision that shapes everything](#5-simulation-strategy--the-decision-that-shapes-everything)
- [6. Wire protocol](#6-wire-protocol)
- [7. Backend design](#7-backend-design)
- [8. Frontend integration](#8-frontend-integration)
- [9. Project layout](#9-project-layout)
- [10. Testing and verification](#10-testing-and-verification)
- [11. Security](#11-security)
- [12. Open decisions](#12-open-decisions)
- [13. Phased roadmap with acceptance criteria](#13-phased-roadmap-with-acceptance-criteria)
- [Appendix A: generated testbench (real output)](#appendix-a-generated-testbench-real-output)
- [Appendix B: protocol transcript](#appendix-b-protocol-transcript)

---

## 0. Read this first — order of work, and the trap in it

**Phase 0 is to disconnect the switch→LED mock wiring, before any backend
work starts.** Not because it is tidy, but because leaving it in place will
actively mislead whoever integrates GHDL.

Today `Workbench.tsx` renders:

```tsx
<Leds value={sw} />                                     // line 446
<SevenSegmentDisplays value={numberToDisplays(dec, 6)} />  // line 447
```

The LEDs *are* the switches, and the displays *are* the switch value in hex.
Flip `SW3`, `LEDR3` lights. That is a mock, and it is convincing.

Here is the trap. Suppose you wire up the backend but the `STATE` frames
never arrive — wrong port, a parse bug, the testbench never reaching its
output line, GHDL failing silently. You flip a switch. **The LEDs respond
correctly anyway**, because the mock is still driving them. The board looks
exactly as it should when everything works. You will conclude the
integration is done, and you will be wrong, and you will find out later from
a design where `LEDR` is *not* `SW` — by which point the actual fault is
buried under everything built on top of it.

The mock's failure mode is that it is indistinguishable from success.

So: cut it first, in its own commit, and confirm the board goes dark and
stays dark. A board that does nothing is the honest state of a Workbench
with no backend, and it makes every later phase's progress legible — the
first LED that lights after Phase 0 is one GHDL actually drove.

Exact edits in § 8.1. Do that phase, verify it, commit it, and only then
read on.

The rest of the order:

| Phase | What | Gate |
|---|---|---|
| **0** | Cut the mock board wiring (§ 8.1) | Board dark, `typecheck` clean |
| **1** | Fix the starter VHDL to match the board (§ 3) | `ghdl -a` clean on the starter, by hand |
| **2** | Spike the simulation strategy (§ 5.4) | Evidence for persistent vs. re-simulation |
| **3** | Backend: protocol + testbench generator (§ 7) | Unit-testable, no WebSocket yet |
| **4** | Backend: session + GHDL orchestration (§ 7) | Raw protocol client round-trips |
| **5** | Frontend: `ghdlClient.ts` (§ 8.2) | Unit-testable against a fake socket |
| **6** | Wire the client into `Workbench` (§ 8.3) | Real LED lit by real GHDL |
| **7** | Process management, docs (§ 9) | Fresh-clone test passes |

Full acceptance criteria per phase: § 13.

---

## 1. Goal and scope

**In scope.** A Node.js backend that runs GHDL; a WebSocket protocol; a
frontend client; the wiring that replaces the board mock. The student writes
VHDL in the existing editor, presses Start, and interacts with a real
simulation through the existing board components.

**Out of scope, deliberately.** GHDL-in-the-browser (WASM) — not mature
enough to carry course material. Waveform capture (§ 12). Multi-user
accounts, persistence, or project storage — the Workbench is
session-scoped today and stays that way.

**Unchanged by this work.** Every component under `src/components/board/`,
`Switches/`, `Leds/`, `Pushbuttons/`, `SevenSegment/`. They already accept
controlled `value` props, which is all this needs. `Design_Description.md`
§ 5 convention 7 anticipated exactly this: *"The simulator will drive them
controlled."* This plan is that simulator. **No board component's props,
CSS, or geometry change.** If a phase seems to require editing one, stop —
something has gone wrong in the layer above it.

---

## 2. Source documents, and how they were reconciled

Three documents feed this plan and they do not fully agree. Where they
conflict, the resolution and its reason are recorded here rather than
settled silently.

| Source | What it is |
|---|---|
| `Implementation_og_ghdl_Design_Description_probosal.md` | The proposal in this repo. Strong on layering, principles, and the message set. |
| `../vhdlsim/tapec.uv.es/pardo/hdlsim/` | A **working, verified** GHDL-backed simulator for a DE10-style board, with its own `design_description.md` recording what was tried and rejected. |
| The user's stated preference | "websocket commands that is based not JSON". |

### 2.1 Conflicts and resolutions

**Protocol encoding — JSON (proposal § 4) vs. not (user).**
Resolved: **not JSON**, per the explicit instruction. But the proposal's
*message set* is adopted wholesale — `input`, `output`, `error`, `status`,
`start`, `stop`, `reset`, `compile` (§ 4, § 10) all survive as verbs
(§ 6.3). The disagreement was only ever about encoding, not about what needs
to be said. The proposal's error taxonomy (§ 10: compilation vs. runtime vs.
connection vs. invalid message) is adopted as `ERROR`'s stage token, which
makes it *more* machine-readable than the proposal's free-text `message`
field.

**Persistent GHDL (proposal § 5, § 11.4) vs. re-simulation (reference).**
This is the significant one, and it gets its own section — § 5. Short
version: the proposal's principle is right, the reference has evidence that
the obvious implementation of it does not work, and the resolution is to
**spike it before committing** rather than pick from the armchair.

**Backend language — TypeScript (proposal § 3.2) vs. JavaScript (reference).**
Resolved: **TypeScript**. The proposal is right and it matches this repo's
own mandate (`Design_Description.md` § 1.1: TypeScript, `strict`, no `any`).
The reference is plain JS only because it was retrofitted onto a plain-JS
site.

**Directory layout — `frontend/` + `backend/` (proposal § 6) vs. this repo.**
Resolved: **keep the repo as it is**, add `server/`. The proposal assumes a
greenfield project; this repo already has a working Vite frontend rooted at
`/` with `src/`, `package.json`, `vite.config.ts` and a documented layout in
`Design_Description.md` § 3. Moving it all into `frontend/` would be a large
diff that breaks every path in the docs and buys nothing. Named `server/`
rather than the proposal's `backend/` to match the reference it is ported
from, and the `start.sh`/`stop.sh` convention that comes with it.

**Entity naming — `DE1_SoC` (proposal) vs. `top` (this repo's starter).**
Resolved: **`DE1_SoC`, with real DE1-SoC port names.** See § 3 — this turned
out to be the most consequential finding of the review.

### 2.2 What the reference contributes

The technique this plan's fallback path is built on, and the evidence that
shapes § 5. Its `design_description.md` § 5.3 records that a persistent
GHDL process reading a **blocking** pipe was tried and rejected: GHDL's
kernel is single-threaded, so a VHDL process blocked in an OS-level read
stalls the entire simulator — the clock included. That is a real finding
from a real attempt, and § 5 is built around it rather than over it.

---

## 3. The board interface contract

**This section is a prerequisite for everything else, and it describes a
defect in the current repo.**

### 3.1 The problem

The board UI shows `SW[9:0]`, `KEY[3:0]`, `LEDR[9:0]`, `HEX[5:0]`. The
starter design the Workbench opens with (`files.ts`, `TOP_VHD`) declares:

```vhdl
entity top is
    port (
        clk : in  std_logic;
        rst : in  std_logic;
        led : out std_logic_vector(9 downto 0);
        hex : out std_logic_vector(6 downto 0);   -- ONE digit. Board shows six.
        sw  : in  std_logic_vector(9 downto 0);
        key : in  std_logic_vector(3 downto 0);
        btn : in  std_logic_vector(3 downto 0)    -- maps to nothing on the board
    );
end entity;
```

Four things are wrong for this purpose:

1. **`hex` is 7 bits — one display.** The board has six. There is no way to
   drive `HEX3` from this entity at all.
2. **`btn` exists and maps to nothing.** The board has `KEY[3:0]` and
   nothing else; `btn` is a second, phantom 4-bit input.
3. **`rst` is not a DE1-SoC pin.** The real board has no reset pin. Designs
   conventionally use `KEY(0)`.
4. **The names are not the board's names.** Real DE1-SoC top-level ports are
   `CLOCK_50`, `SW`, `KEY`, `LEDR`, `HEX0`…`HEX5`. `led`/`hex` are neither
   the hardware's names nor what the UI labels.

The starter is a plausible-looking teaching file, which was fine while
nothing consumed it. GHDL will consume it, and the six-displays-from-a-
7-bit-port problem has no workaround in the backend.

### 3.2 The contract

Adopt the **real DE1-SoC top-level interface**. This is the single most
valuable thing the proposal contributes: its § 11.2 and § 13 argue the same
file should work on the web simulator and on real hardware. Using the
hardware's own pin names is what makes that literally true for most of the
contract — a student can take their `DE1_SoC.vhd` to Quartus, add a pin
assignment file, and program the board. `KEY_N`/`HEX0_N`…`HEX5_N` are the
one deliberate exception — see the bullet below.

```vhdl
entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SW       : in  std_logic_vector(9 downto 0);
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity;
```

Rules the backend enforces against it:

- **Every port is optional.** A design that declares only `SW` and `LEDR` is
  valid and common (a first lab). The generated testbench associates only
  the ports the entity actually declares — § 7.3.
- **Case does not matter.** VHDL identifiers are case-insensitive; port
  detection lowercases before matching, so `LEDR`, `ledr` and `LedR` are one
  port.
- **No reset port.** Reset is `KEY_N(0)` by convention, in the student's own
  VHDL, exactly as on hardware. The backend does not synthesise one.
- **Legacy tolerance.** If an entity declares `rst`, the testbench drives it
  from `not KEY_N(0)` so older files still elaborate. Document it as legacy;
  do not teach it.
- **`HEX0_N`…`HEX5_N` are six 7-bit ports, active low**, matching
  `segments.ts`'s documented `SEGMENT_PATTERNS` (`0` lights a segment) and
  the real part.
- **`CLOCK_500Hz` is optional, and is not a real board pin.** Shipped
  2026-09-17 as the resolution to § 5.5's clock-rate constraint: an
  already-divided, hardwired 500 Hz `in std_logic`, so a design can be
  genuinely sequential — a counter, a debouncer, a blinking LED — without
  hand-writing a 50 MHz divider, which is correct but impractical to run
  interactively (§ 5.5). Purely a simulator convenience; a design that
  declares it will not synthesize against a real DE1-SoC pin assignment
  unmodified, and the starter/course material should say so wherever it
  is taught, not just here.
- **`KEY_N`/`HEX0_N`…`HEX5_N`, not `KEY`/`HEX0`…`HEX5`.** Renamed
  2026-09-17, at the course's request — the real DE1-SoC pins are still
  plain `KEY`/`HEX0`…`HEX5` (§ 3.1); the `_N` suffix is a course convention
  making each signal's active-low polarity explicit in its own name, not
  a hardware fact. Unlike the rest of this contract, a design that declares
  these needs the suffix stripped (or a thin renaming wrapper) before it
  synthesizes against a real DE1-SoC pin assignment unmodified — the same
  caveat as `CLOCK_500Hz` above, for a different reason.

### 3.3 Required change to `files.ts` (Phase 1)

Rewrite the starter project so it matches the contract:

- `top.vhd` → `DE1_SoC.vhd`, entity `DE1_SoC`, ports per § 3.2. Keep the
  architecture trivial and honest — `LEDR <= SW;` is the right first
  example, and it is the one `Design_Description.md` § 6 already uses.
- Drop `btn` entirely.
- `display7seg.vhd` stays as-is: it is already a correct active-low
  `"gfedcba"` decoder and is exactly what a student wires to a `HEX` port.
- Update `TOP_LEVEL_ENTITY` (`files.ts`) from `'top.vhd'` to
  `'DE1_SoC.vhd'` — it is the label `SimulationCard` prints after "Top:".
- `work/tb_top.vhd` → `tb_de1_soc.vhd`, updated to instantiate `DE1_SoC`
  with its real ports. It stays the student's own offline testbench and is
  **not** sent to the interactive backend (§ 6.3).

**Acceptance:** save the starter files to a temp directory and run
`ghdl -a --std=08 *.vhd` by hand. Clean, no errors. This is the first real
GHDL contact in the project and it needs no server to verify.

---

## 4. Architecture

Three layers, as the proposal's § 1 sets out, and its layering is adopted
unchanged:

```
┌───────────────────────────────────────┐
│ Browser — React + TypeScript          │
│                                       │
│   Workbench.tsx      owns board state │
│   ghdlClient.ts      speaks § 6       │
│   Switches/Pushbuttons → STIM         │
│   STATE → Leds/SevenSegmentDisplays   │
└──────────────────┬────────────────────┘
                   │ WebSocket, § 6 protocol
┌──────────────────▼────────────────────┐
│ Node.js + TypeScript — server/        │
│                                       │
│   server.ts       connections         │
│   protocol.ts     frame encode/decode │
│   session.ts      one per connection  │
│   ghdl.ts         process management  │
│   tbTemplate.ts   testbench generator │
└──────────────────┬────────────────────┘
                   │ spawn, files, stdout
┌──────────────────▼────────────────────┐
│ GHDL — per-session temp workdir       │
│                                       │
│   DE1_SoC_tb  (generated)             │
│     └── DE1_SoC  (the student's)      │
└───────────────────────────────────────┘
```

The invariant that makes the layers real, from the proposal § 3.1 and
§ 11.2, and worth stating because it is easy to violate under pressure:

- **No board component knows GHDL exists.** They take `value` props. That is
  the whole interface.
- **The student's VHDL contains nothing simulator-specific.** All simulator
  I/O lives in the *generated* testbench, never in `DE1_SoC.vhd`.
- **The frontend does not know the simulation strategy.** § 5's decision is
  invisible past the protocol boundary — which is exactly what makes it
  safe to defer.

One WebSocket connection = one session = one temp directory = one
elaborated design. Close the tab and everything is torn down.

---

## 5. Simulation strategy — the decision that shapes everything

### 5.1 The requirement

Proposal § 5 and § 11.4: *"changing SW0 must not cause a complete GHDL
compilation"*, and *"GHDL should run continuously instead of being restarted
for every input event."*

The first half is non-negotiable and both candidates satisfy it —
neither re-analyzes or re-elaborates per input. The second half is where
they differ.

### 5.2 Candidate A — persistent process (the proposal's model)

One `ghdl -r` runs for the session. Its testbench free-runs the clock and,
every *N* cycles, re-reads a small input file for the current `SW`/`KEY`
values and emits a state line when the outputs change.

- **Cost per update: constant.** Independent of how long the session has
  been running.
- **No session cap.** Runs until the user stops it.
- Matches the proposal's principle exactly.

**The risk, and it is specific.** The reference tried a persistent process
and rejected it (`design_description.md` § 5.3) — but it rejected a
*blocking* read on a named pipe, which stalls GHDL's single-threaded kernel
and freezes the clock. That finding does not condemn the approach; it
condemns blocking I/O inside it.

Non-blocking polling of an ordinary file avoids it: `file_open`/`readline`
on a regular file never blocks, so the clock keeps running. Three concrete
risks remain, and each has a known mitigation:

| Risk | Mitigation |
|---|---|
| **stdout is block-buffered through a pipe**, so state lines sit in a 4 KB buffer instead of arriving | Write state to a *file* and `file_close` after each write (VHDL's `file_close` flushes), and have Node watch it. Fallbacks: `stdbuf -oL`, or a PTY. **This is the single thing the spike must prove.** |
| **Input latency** up to the poll interval *N* | Tune *N*. At 500 Hz-equivalent, *N* = 50 cycles is 100 ms — below human perception for a switch flip. |
| **File I/O per poll costs simulation time** | Bounded by *N*; measure in the spike. |

### 5.3 Candidate B — re-simulation from t=0 (the reference's model)

Analyze and elaborate once. Every ~150 ms, re-run the already-elaborated
testbench from t=0 with `ghdl -r -gtotal_cycles=N -gstimuli_file=…`,
replaying the whole recorded input history.

- **Proven.** This is what the reference actually ships and verified.
- **No buffering, deadlock, or flush edge cases** — one process, one run,
  parse stdout at exit.
- **Cost grows with elapsed session time.** The reference benchmarks
  ~11.5 µs/cycle; at 100 k cycles a tick takes ~2.3 s and keeps climbing.
  It needs a `MAX_CYCLES` cap (~5 min of simulated time) to stop the session
  before it degrades into uselessness.

### 5.4 Resolution: spike before committing (Phase 2)

Do not choose from the armchair, and do not build both. Spend half a day
proving or disproving Candidate A's one real unknown, then commit.

**The spike.** No server, no WebSocket, no React. By hand:

1. Write a testbench (Appendix A) that free-runs a clock, re-reads
   `input.txt` every *N* cycles, and writes `output.txt` with
   `file_close` after each change.
2. Run it: `ghdl -r --std=08 DE1_SoC_tb`.
3. While it runs, `echo` new values into `input.txt` from another shell.
4. Watch `output.txt`.

**Pass:** output changes within a poll interval of the input change, the
clock keeps advancing throughout, and the process survives several minutes
without stalling or ballooning.

**Fail:** any stall, or output that only appears at process exit.

**If it passes → build Candidate A.** Constant-cost, uncapped sessions, and
it satisfies the proposal's principle honestly.

**If it fails → build Candidate B**, port `tbTemplate.js` and the tick loop
from the reference nearly unchanged, and document the session cap as a known
limitation. Record *why* in this document, so the next person does not
re-litigate it.

Either way, **§ 6, § 8 and every phase after are unaffected** — the protocol
was designed so the strategy is a backend implementation detail. That
decoupling is what makes deferring this decision safe rather than reckless.

### 5.4.1 Spike result: PASS — Candidate A

Run 2026-09-17, this machine, GHDL 5.0.1 (mcode). Real `DE1_SoC` entity
(§ 3.2's exact ports, `LEDR <= SW`), a testbench with a free-running
20 ns-period clock and a `poll_cycles = 50` file-poll process, both
analyzed and elaborated clean under `--std=08`.

**Test 1 — live input change, process already running.**
`ghdl -r` started in the background with `input.txt` = all-zero `SW`.
After 1 s wall time, `output.txt` already showed a result (proving the
first poll happened and flushed without the process ever blocking).
`input.txt` was then overwritten from another shell with a new `SW` value.
Within the next 1 s wall-time sample, `output.txt` reflected the new
value — the running process picked up the change on its next poll and
`file_close` made it visible to a concurrent reader with no special
synchronization.

**Test 2 — process health over time.** Re-run, sampled `ps -o stat,pcpu`
on the actual `ghdl-mcode` child three times over 2 s. All three samples:
`STAT=R`, `%CPU=100`. Not `D` (blocked on I/O) at any sample — the clock
process and the poll process are both making progress throughout, which is
exactly the property a blocking read would have broken (the reference's
own rejected approach, § 2.2).

**Test 3 — missing input file.** Started with no `input.txt` on disk at
all (the real first-poll condition of an actual session, before any
`STIM` has been sent). `file_open`'s `status` output parameter correctly
reported non-`open_ok`, the poll was skipped, `SW`/`KEY` stayed at their
declared reset values, and the process ran to timeout with no error.

**Verdict: build Candidate A.** The reference's rejection of a persistent
process was specifically about a *blocking* read stalling GHDL's
single-threaded kernel; non-blocking polling of a regular file does not
have that failure mode, and this spike exercised the exact mechanism
(external write while the reader polls) that would expose it if it did.
No stall was observed under any of the three conditions tested.

Consequence for the rest of this plan: **§ 7 and Appendix A now describe
the shipped design**, not a fallback pending a decision — every "if
Candidate A" qualifier below should be read as settled. § 12 decision 1 is
closed.

### 5.5 The clock-rate constraint — applies to both

Independent of the above, and it needs to be understood before someone
reports it as a bug.

GHDL simulates roughly 87 000 clock cycles per second (from the reference's
~11.5 µs/cycle). A student design that divides `CLOCK_50` down the honest
way —

```vhdl
if count = 24_999_999 then   -- 50 MHz → 1 Hz
```

— needs 25 million cycles for one LED blink. At 87 k cycles/s that is
roughly **five minutes of real time per blink**, in *either* architecture.
The cost is set by cycle count, not by what period the testbench assigns to
a cycle, so no amount of tuning fixes it.

What this means in practice: interactive simulation is excellent for
combinational designs and for sequential designs that react within
thousands of cycles, and unusable for 50 MHz-scale dividers. Options:

1. **Document it.** The console says so plainly when a session is running
   but the outputs never change. Cheap, honest, no curriculum change.
2. **Teach a simulation-friendly divide constant** — a `constant DIVIDE : natural`
   the student sets small for simulation and large for hardware. This is
   good engineering practice anyway and costs one line in the starter.
3. **Drive `CLOCK_50` at a rate that makes dividers visible** and accept the
   simulation is not timing-accurate to hardware.
4. **Add a second, already-divided clock port, independent of `CLOCK_50`.**
   Doesn't touch `CLOCK_50`'s own rate (so nothing about how a real
   50 MHz divider behaves changes, timing-accuracy included) and needs no
   curriculum change — a design opts in by declaring the extra port, or
   doesn't. Shipped as `CLOCK_500Hz`, § 5.7/§ 3.2.

**Recommendation: 1 + 2, plus 4 once it existed to recommend.** Document
the limit, and make the starter's example use a named divide constant so
the pattern is in front of the student from day one; § 5.6 covers what
changed once `CLOCK_500Hz` shipped. See § 12.

### 5.6 Batch mode — the same constraint, a different trigger, actually fixed

Shipped 2026-09-17, after a user hit a variant of this constraint that
wasn't the one this section originally anticipated: a **portless**
testbench (an entity with no ports at all — the classic self-contained
`process` that generates its own stimuli and `report`s its results, not a
board design missing a port by accident) submitted through the "set as
top" control (§ 8.1's dot). Wrapped in the usual persistent testbench,
its `wait for 10 ms;` calls took **~7 real seconds each** — measured,
not estimated — because the wrapper's own 20 ns polling clock (§ 5.2, on
by design so board input polling has something to schedule against) has
nothing to do with the submitted design at all, yet GHDL still has to
process every one of its ~1,000,000 toggles to let 10 ms of *anyone's*
simulated time elapse. § 5.5's fix (1 + 2, document and teach a small
divide constant) doesn't apply here — there is no divider to make
smaller, because there is no board interface in the picture at all.

**The fix:** when `findTopEntity` resolves a top with **zero ports**
(`portDetect.ts`), `session.ts` skips the wrapper and persistent mode
entirely and runs the submitted entity directly —
`ghdl -e/-r --std=08 <entityName>`, no generics, no polling. This is not
a smaller version of the same architecture; it is a different one,
because a portless entity's whole reason for existing is to supply its
*own* stimuli, so wrapping it in anything is redundant at best (nothing
to connect) and wrong at worst (see `ghdl.ts`'s `runBatch` doc comment).
Confirmed empirically, not just architecturally: the same testbench that
took ~7 s per `wait for 10 ms` under the wrapper completed **11 report
lines in 93 ms total** run this way (§ 10, batch-mode suite) — because an
unwrapped `wait for <duration>` with nothing else scheduled in between
costs GHDL almost nothing regardless of the duration's size; the earlier
cost was entirely the wrapper's, never the design's own.

**A second, related symptom this also fixes:** in persistent mode, a
session never signals "finished" — the wrapper's own `clkgen`/`io`
processes loop unconditionally forever (§ 7.2), which is exactly right
for a board design (the point is to keep reacting to switches until the
user says stop) but meant a portless testbench's own `report`-then-`wait;`
completion never reached the frontend, leaving Start/Stop stuck on "Stop"
indefinitely. Running unwrapped, the process now genuinely exits on its
own once quiescent, and a new `DONE completed` reason (§ 6.4, distinct
from user-initiated `stopped`) tells the frontend so — verified with a
process that finishes on its own (`DONE completed`, correct) and,
separately, one deliberately interrupted mid-run with `STOP`
(`DONE stopped`, its later `report` never reached, confirming it was
actually killed and not just outrun).

Also newly wired, and load-bearing for the above: `report`/`assert`
output. GHDL writes it to stdout, and the persistent run's process
handle had never captured stdout at all before this — silently
discarding it regardless of timing. Now forwarded live, one `LOG` frame
per line, in both modes (`ghdl.ts`'s `RunHandle`/`BatchHandle` both
expose `onOutput`). Safe to forward unfiltered: the generated wrapper
testbench itself never writes to stdout (its result line goes to
`output_file`, a real file, specifically so the two can never be
confused — § 7.2), so every line that arrives this way is the
student's own design, never internal plumbing.

**Bounded differently than the persistent case.** `BATCH_TIMEOUT_MS`
(60 s) kills a batch run that never reaches quiescence — a real
possibility now that nothing else keeps holding worse code up. The
persistent mode has no such bound because running forever is the
point; a batch run finishing is the point, so one that doesn't needs a
backstop the polling loop never did.

### 5.7 `CLOCK_500Hz` — option 4, shipped

Requested and shipped 2026-09-17: § 5.5's option 4, added to the list
retroactively rather than presented as though it had been there from the
start. A second, independent, always-hardwired clock signal —
`clk500_sig`, its own free-running `process` at a 2 ms period (1 ms
high, 1 ms low) in `tbTemplate.ts` — associated into the port map only
when the entity declares `CLOCK_500Hz`, following the exact optional-port
pattern every other signal already uses (§ 7.3). `CLOCK_50`'s own
`clk_sig` and period are completely untouched — this does not make a
50 MHz divider any more or less practical (§ 5.5 still applies to one in
full), it adds a way to sidestep needing one at all for a design that
just wants *a* human-visible clock.

**Deliberately unconditional, unlike the association itself.** The
`clk500gen` process always runs, whether or not the current entity
declares the port — matching `clkgen`'s own existing always-on pattern,
and cheap for the same kind of reason: 500 Hz (2 ms period) is trivial
next to `CLOCK_50`'s already-dominant ~20 ns one, so making it
conditional would save negligible cost for real added complexity (an
if/else over which processes exist at all, rather than just over what
they connect to).

**Verified as the interactive capability it exists to provide, not just
that it compiles.** A design declaring *only* `CLOCK_500Hz` and `LEDR` —
no `CLOCK_50`, no switches — toggling its own output on every clock edge:
the first `STATE` change arrived at **723 ms of real time** (raw protocol
test) and, separately, confirmed in the real browser with LED-on-count
sampled every 400 ms over 2.4 s, oscillating **0 → 10 → 0** with no input
touched at all. This is the decisive case § 5.5 established as
impractical under `CLOCK_50` alone (minutes per visible change) — the
same shape of design, now interactive.

**This verification had a real gap, found the same day by an actual
user.** Toggling on *every* edge only needs 1 ms of simulated time —
small enough that a cost this section didn't measure stayed hidden. A
design counting more than a couple of `CLOCK_500Hz` edges (a divide-by-N
blink, the whole point of a "genuinely sequential" design per § 3.2) hit
the same multi-minute wall § 5.5 describes, unchanged. § 5.8 covers what
was actually wrong and how it was fixed.

---

### 5.8 `clkgen` was unconditional — fixed, along with what it exposed

Found 2026-09-17, minutes after § 5.7 shipped: a user built exactly the
design § 5.7 promises `CLOCK_500Hz` makes practical — a divide-by-125
counter toggling an LED every 250 ms — and it never toggled once in
25 seconds of real time. The design's logic was correct. The wrapper was
the problem, and it was the same problem § 5.5/§ 5.6 already solved for
board designs and batch mode, reintroduced by `CLOCK_500Hz` itself.

**Root cause: `clkgen` (`clk_sig`, `CLOCK_50`'s ~20 ns-period generator)
ran unconditionally, in every session, whether or not the entity declared
`CLOCK_50` at all** — `tbTemplate.ts`'s `io` process counted `clk_sig`
edges (`poll_cycles`) as its own polling cadence, "so there is always
something to poll cycles against even for a design with no clock port at
all" (the comment this section retires). GHDL is a discrete-event
simulator: an unconditional `wait for 10 ns;` loop is a live, permanently
scheduled process regardless of whether anything reads the signal it
drives, and processing its ~50 million edges/second (of simulated time)
is what costs real wall-clock time — not the DUT's own logic. A design
using only `CLOCK_500Hz` still paid `CLOCK_50`'s full tax, just delayed
until its counter needed more than one or two `clk500_sig` edges to
produce a visible change. 250 ms of simulated time at that unconditional
20 ns-edge rate is the same order of magnitude of real time § 5.5 always
described for a literal 50 MHz divider — `CLOCK_500Hz` hadn't removed the
constraint for this shape of design, only hidden it behind however many
`CLOCK_500Hz` edges came before the first count wraps.

**The fix, in `tbTemplate.ts`:**

1. `clkgen` (and `clk_sig`'s generator process) is now emitted **only
   when the entity actually declares `CLOCK_50`** — `hasClock50 =
   ports.has('clock_50')`, gating the whole process block, not just the
   port association. A session with no `CLOCK_50` port now has zero
   `clk_sig` event volume at all.
2. The `io` process's own polling cadence no longer counts anyone's clock
   edges. It does a plain `wait for poll_interval_ns * 1 ns;` — a fixed
   simulated-time interval, unrelated to whatever clock (if any) the DUT
   itself runs on. The `poll_cycles` generic (edge count) is replaced by
   `poll_interval_ns` (a duration); `ghdl.ts`'s `-gpoll_cycles=` flag and
   `session.ts`'s constant were renamed to match.

**A second, smaller cost this fix exposed, fixed the same session.**
`poll_interval_ns` inherited the old cadence's *numeric* value unchanged
(1000, at 1 ns/unit instead of 1 ns/`clk_sig` edge — both worked out to
1 us). That was fine when `clk_sig`'s own cost dwarfed everything else;
once step 1 above removed that cost for a `CLOCK_500Hz`-only or clockless
design, the `io` process's own **file_open on every wakeup, unconditional
on whether anything changed** (§ 6.3's "missing input file is not an
error" bullet) became the new bottleneck: a 250 ms toggle interval at a
1 us poll cadence is 250,000 file-open/close pairs, and each one costs
real syscall time. `POLL_INTERVAL_NS` (`session.ts`) is now **1 ms**, not
1 us — 1000× fewer wakeups, still far finer than `OUTPUT_POLL_MS` (§ 7.2,
80 ms, the Node side's own re-read cadence) or anything a human notices.

**Verified, not just reasoned through** — the same divide-by-125 design
that never toggled once in 25 s of real time before this fix now toggles
roughly every 150–350 ms (raw protocol test, 25 s sample, ~110 toggles;
some jitter from `OUTPUT_POLL_MS` and process scheduling, close to the
design's own 250 ms target) — and a `CLOCK_50`-declaring board design
(the full starter interface, `SW`→`LEDR`) was re-verified unaffected:
same `ghdl -a`/`-e` clean compile, same functional switch→`LEDR` response
over a live WebSocket session, `clkgen` still present and still driving
`CLOCK_50` exactly as before. § 5.5's constraint is unchanged and still
applies in full to any design that actually declares and divides
`CLOCK_50` — this section only closes the gap `CLOCK_500Hz` was supposed
to close and initially didn't.

**This fix had a gap too, found the same day.** Removing `clkgen`'s
unconditional cost made a `CLOCK_500Hz`-only design *fast* — it never
made it *accurate*. § 5.9 covers a second user report, minutes later,
that a design whose own math meant a 10-minute toggle was toggling every
~7 seconds instead.

---

### 5.9 Real-time pacing — § 5.8 was fast, not honest

Found 2026-09-17, minutes after § 5.8 shipped: a user's own divide-by-N
`CLOCK_500Hz` counter, designed for a 10-second toggle, toggled roughly
every 10 seconds — but their *next* design, a divide-by-300000 counter
whose own math means a real 10-*minute* toggle on actual hardware,
toggled every ~7 seconds in the simulator. § 5.8 made `CLOCK_500Hz`
designs finish quickly; it never made them finish at the *right* speed.
GHDL still ran every session as fast as it could — § 5.8 just removed
`clkgen`'s artificial floor on that speed, so a long design now
compressed however many events it needed into however little real time
GHDL happened to take, an emergent, machine- and design-dependent ratio
with no relationship to what the same VHDL would actually do on a real
board. That's a correctness problem, not a performance one: a student
timing a debounce or a blink against what they see in the simulator would
learn the wrong number.

**The fix: pace the simulation to real time, not just remove artificial
slowness.** GHDL has no built-in wall-clock-synchronized run mode, and
standard VHDL has no way to read the OS clock or block on anything but
simulated time — so pacing has to happen from outside, by suspending and
resuming the OS process itself.

1. **A heartbeat, from the VHDL side** (`tbTemplate.ts`). A new
   unconditional `heartbeat` process, present in every board-mode session
   regardless of which clocks the entity declares, writes `now / 1 ms`
   (the session's own simulated-time progress, as a plain integer count
   of milliseconds) to a new `heartbeat_file` generic every 20 ms of
   *simulated* time — coarse enough not to reintroduce § 5.8's own
   unconditional-I/O-per-wakeup cost at this interval, fine enough to
   give real-time pacing something to correct against well inside one
   human-perceptible tick.
2. **A pacing loop, from the Node side** (`session.ts`'s `startPacing`).
   Every `PACING_CHECK_MS` (5 ms) of *real* time, read the heartbeat and
   compare it to real elapsed time since the run started. If the
   simulation is ahead by more than `PACING_SLACK_MS` (30 ms), `SIGSTOP`
   the GHDL process for **exactly that much drift** — not a capped
   partial correction — then `SIGCONT` and check again.
3. **`kill()` resumes before it terminates** (`ghdl.ts`). A process
   suspended by `SIGSTOP` doesn't act on `SIGTERM` until it's running
   again (Linux signal semantics), so `kill()` now sends `SIGCONT` first,
   unconditionally, before `SIGTERM` — otherwise Stop/Reset could wait
   out whatever pacing window happened to be in progress instead of
   taking effect immediately.

**The first version of this fix used a capped correction
(`PACING_MAX_STOP_MS = 250`) and didn't work** — found before it shipped,
by actually measuring, not by reasoning about the code. A capped pause
only ever pays down part of each cycle's drift, and since GHDL's own
unthrottled speed (measured independently at roughly 90× real time for a
`CLOCK_500Hz`-only design, itself bounded by the heartbeat's own 20 ms-sim
polling cost) reaccumulates far more drift per `PACING_CHECK_MS` window
than a 250 ms pause can repay, the result converges to a smaller, equally
arbitrary compression ratio instead of 1:1 — exactly the class of bug
this section exists to fix, reintroduced by an unprincipled constant.
Removing the cap (§ 5.9, `session.ts`) fixed it. A coarser
`PACING_CHECK_MS` (50 ms, the first value tried) was *also* too imprecise
on its own even with the cap removed: at ~90× native speed a 50 ms free-run
window can span most of a short toggle period in one uncorrected burst,
producing visibly uneven spacing between individual toggles. 5 ms brought
the burst size down enough to converge cleanly; this is a real,
measured trade-off between correction granularity and per-check overhead
(a synchronous heartbeat-file read plus a signal pair, 200×/second, for
the life of every board-mode session), not a value derived from first
principles.

**Verified, not just reasoned through.** A design scaled to a 2.5 s
target (2500 simulated-ms per toggle, the same shape as the reported
bug at a testable size) toggled at 2083, 2724, 2323, 2566, 2645 ms real
intervals across a 13 s sample — averaging ~2470 ms against the 2500 ms
target, close enough that the remaining gap is measurement jitter, not
a systemic bias. The user's own reported design (the literal
divide-by-300000, 600-simulated-second counter) was re-run for 20 real
seconds and confirmed to **not** toggle early, matching the "close to a
real 600 s" expectation rather than § 5.8's ~7 s result (the full 600 s
was not waited out in verification — a 20 s absence-of-early-toggle
check plus the scaled design's own measured ~1 % convergence error is
the evidence this rests on, not a literal 10-minute observation). Stop
sent deliberately mid-pause-window returned `DONE` in 1 ms, confirming
the `kill()` fix. A `CLOCK_50`-declaring board design (the full starter
interface) was re-run unaffected: same switch→`LEDR` functional
behaviour, same latency profile as before this section — GHDL is
already at or below real-time speed for that shape of design (§ 5.5),
so the pacing loop always measures non-positive drift and never engages.

**A cost, accepted rather than hidden.** The pacing loop runs
continuously for the life of every board-mode session, `CLOCK_50`-only
sessions included, even though those never trigger a single pause —
200 heartbeat-file reads and drift comparisons per real second, for as
long as a student leaves a simulation running. Cheap in isolation (a
small synchronous file read); not measured against `MAX_SESSIONS`'
concurrency ceiling (§ 11) together, which would be the thing to check
before treating this as free at scale.

---

### 5.10 Orphaned GHDL children — the bug that faked a regression

Found 2026-09-17, reported as "blinkTest takes several seconds to start
blinking". It didn't. The design was correct, the pacing (§ 5.9) was
correct, and a cold measurement of the exact starter project proved it:
**88 ms** to `READY` (six files analyzed and elaborated) and a first
blink at **250 ms**, matching the design's own 250 ms target. What was
actually wrong was the machine.

**Two `ghdl -r` processes, orphaned and spinning at 99.9 % CPU each, for
40 and 65 minutes.** `ps` found them immediately once the symptom was
treated as "too slow" rather than "starts late":

```
PID    PPID STAT  ELAPSED %CPU COMMAND
211658    1 R    01:05:33 99.9 ghdl-mcode -r ... -gpoll_cycles=50
223047    1 R       40:43 99.9 ghdl-mcode -r ... -gpoll_interval_ns=1000
```

`PPID 1` is the tell, and so is the flag on the first one: `poll_cycles`
was renamed to `poll_interval_ns` by § 5.8, so that process had outlived
the very backend build that spawned it. With two cores pinned, the
session under test ran roughly 5× slow — toggling every ~1200 ms against
its 250 ms target, which reads exactly like "it takes several seconds to
get going".

**Root cause: a session was only ever torn down by its own WebSocket
closing.** § 7.2's rule — "a dropped connection must never leave GHDL
running" — was implemented and correct, but it covers only the connection
dying, not the *backend* dying. `stop.sh` sends a plain `kill` (SIGTERM),
and Node's default disposition for that is to exit immediately without
unwinding anything, so every `./stop.sh`, every restart, and every Ctrl-C
stranded each live session's child. Board mode's wrapper loops forever on
purpose (§ 5), so nothing else was ever going to end them: they are
specifically the kind of process that cannot notice it has been orphaned.
This backend had restarted many times during a long working session, so
the orphans accumulated.

**The fix, in `server.ts`:** a `Set<Session>` registry (the sessions were
previously reachable only from inside each connection's own closure, so
there was nothing to iterate), plus `SIGTERM`/`SIGINT` handlers that
destroy every live session before exiting. Killing each child is
synchronous, so it completes regardless of what the socket close is
doing; a 1 s `unref`'d timer keeps a socket that never finishes closing
from holding the process — and its temp dirs — open. The `activeSessions`
counter it replaced had its own latent bug: `teardown` was registered on
both `close` and `error`, and an `error` is normally followed by a
`close`, so it decremented twice per failed connection. The `Set` makes
that self-correcting (`delete` returning false is what tells the second
call there is nothing to do).

**Verified by reproducing the leak, not by reading the diff.** With a
client deliberately left connected and a simulation running, the backend
was sent the same signal `stop.sh` sends. Before: an orphan. After:
`SIGTERM received — destroying 1 session(s) before exit.` in the log,
`pgrep ghdl-mcode` empty, and the session's temp directory gone too (the
async `fs.rm` completes inside the shutdown window). The ten stale
`/tmp/de1soc-sim-*` directories that had accumulated from earlier kills
were cleaned up by hand; nothing removes those retroactively.

**What this says about the earlier sections.** § 5.8 and § 5.9 were both
measured on this machine while at least one orphan was already running.
Their *conclusions* hold — the ratios each reports are large enough that
a constant-factor CPU tax doesn't change the finding, and § 5.9's target
convergence was confirmed again afterwards — but their absolute numbers
were taken on a contended machine and are pessimistic by some unknown
factor. The lesson is cheaper to state than it was to learn: when a
timing measurement disagrees with a timing prediction, check what else
is on the CPU before concluding anything about the code.

---

## 6. Wire protocol

### 6.1 Why this shape

Command-based, not JSON, per instruction. Rather than inventing a format,
this follows the SMTP/IRC/memcached family: a verb line, optional inline
argument, optional body.

The one WebSocket-specific simplification: **WebSocket already frames
messages.** TCP protocols need length prefixes because the stream has no
boundaries; a WebSocket `onmessage` hands over exactly one complete message.
So: **one command = one text frame**, and a body needs no length prefix and
no escaping — it is simply the rest of the frame. VHDL source travels
verbatim, newlines and all, with no encoding step in either direction.

Properties that follow:

1. **No escaping anywhere.** Nothing re-encodes a payload.
2. **A one-line parser.** `const i = text.indexOf('\n')` splits any frame.
3. **Readable on the wire.** A browser's WebSocket inspector shows what is
   happening without tooling; `wscat` can drive the backend by hand.
4. **Typed errors.** `ERROR`'s stage token (§ 6.5) classifies failures the
   proposal's § 10 lists, without string-matching GHDL's output.

### 6.2 Framing

```
frame       = head-line [ LF body ]
head-line   = verb [ SP inline-args ]
verb        = 1*UPPER
body        = *OCTET          ; everything after the first LF, verbatim
```

- Text frames only, UTF-8. A binary frame is a protocol error: reply
  `ERROR protocol` and close.
- Unknown verb: log it and ignore. Never disconnect — that is what lets an
  old client survive a newer server.
- No request/response correlation. `RUN` is answered by `READY` or `ERROR`;
  `STATE` and `LOG` arrive unsolicited whenever the backend has something to
  say. The frontend never polls.

### 6.3 Client → server

| Verb | Args | Body | Meaning | Proposal § 4 equivalent |
|---|---|---|---|---|
| `HELLO` | version | — | First frame. `1` today. | — |
| `RUN` | top file name (optional) | the VHDL project | Analyze, elaborate, start. | `compile` + `start` |
| `STIM` | 14 chars `[01]{14}` | — | New `SW`/`KEY` state. | `input` |
| `RESET` | — | — | Restart simulation from t=0, same compiled design. | `reset` |
| `STOP` | — | — | Stop simulating; connection stays open. | `stop` |
| `PING` | — | — | Keepalive. | — |

`STIM`'s 14 characters are `SW9..SW0` then `KEY3..KEY0`, MSB first — so the
client builds it as `` `${bitsToString(sw)}${bitsToString(key)}` `` using
the helper that already exists in `board/bits.ts`. No bit manipulation.

`RESET` is worth having and comes from the proposal: it restarts the run
without paying for analysis and elaboration again, which is the common case
when a student wants to start over after fiddling with switches.

**`RUN`'s body — multiple files.** The Files panel holds a project, and GHDL
needs every unit analyzed. Files are concatenated with a sentinel line, in
the `@@…@@` style the reference already uses for its result marker:

```
RUN
@@FILE display7seg.vhd@@
<verbatim source>
@@FILE DE1_SoC.vhd@@
<verbatim source>
```

- **Order matters.** Dependencies first, top entity last — GHDL analyzes in
  the order given. The client sends `files.filter(f => f.folder === 'vhdl')`
  in tree order, which puts the top entity last only by luck; the backend
  must therefore **not** assume the last file is the top. It finds the top
  entity by name (§ 7.3).
- **`work/` is never sent.** `tb_de1_soc.vhd` (the starter's `work/`
  testbench, `tb_top.vhd` before Phase 1's rename) is the student's own
  offline testbench. The generated testbench replaces it for interactive
  use, and analyzing both would give GHDL two testbenches.
- A file whose own first line looks like `@@FILE …@@` is rejected with
  `ERROR protocol` rather than silently mis-split.

**`RUN`'s inline arg — an explicit top file.** Added after the Files panel
grew a "set as top" control (a blue dot in front of the current top
`vhdl/` file, a gray circle on every other — click one to switch): the
frontend sends that file's *name* as `RUN`'s inline argument,
`RUN DE1_SoC.vhd\n@@FILE …`. This is not cosmetic — the backend elaborates
whichever entity that specific file declares, overriding § 7.3's
board-port-matching heuristic rather than falling back to it. Omitted
(no dot has ever been touched, or the named file wasn't actually among
the submitted ones — deleted client-side after being marked top, say),
the heuristic still runs exactly as originally specified. Verified with
two files declaring identical board ports but opposite logic
(`LEDR <= SW` vs. `LEDR <= not SW`, which a score-based heuristic alone
cannot distinguish): the explicit hint reliably picks the one actually
named, confirmed against the real simulated `LEDR` value, not just that
the right frame went out.

### 6.4 Server → client

| Verb | Args | Body | Meaning | Proposal § 4 equivalent |
|---|---|---|---|---|
| `WELCOME` | version | — | Answer to `HELLO`. | — |
| `READY` | — | — | Analyzed, elaborated, simulating. | `status` |
| `STATE` | 52 chars `[01X]{52}` | — | Board outputs. | `output` |
| `LOG` | — | free text | Console line. | `status` |
| `ERROR` | stage | error text | Failure, classified. | `error` |
| `DONE` | reason | — | Session ended: `stopped`/`completed`/`max-cycles`/`closed`. | `status` |
| `PONG` | — | — | Answer to `PING`. | — |

**`STATE` layout** — 10 + 6×7 = **52 characters**:

```
STATE <LEDR:10><HEX0:7><HEX1:7><HEX2:7><HEX3:7><HEX4:7><HEX5:7>
```

**`HEX0` comes first, not `HEX5`.** `SevenSegmentDisplays`'s `value` prop is
documented (`Design_Description.md` § 6) as *"one 7-bit segment word per
display, display 0 first"* — `value[0]` is `HEX0`. Sending `HEX0` first
makes the client a straight slice-and-map with no reversal. Getting this
backwards produces a board that looks plausible and displays every digit in
the wrong place, so it is called out here rather than left to be discovered.

Each field is **MSB first**, matching `bitsToString` and
`patternToSegments`, both of which already exist and already expect exactly
this. `patternToSegments(field)` consumes a `HEX` field directly.

Polarity is carried as-is, with no inversion anywhere: `SW`/`LEDR` active
high, `KEY` and `HEX` segments active low. GHDL, the wire, and the board
components already agree, so no layer translates. `'X'` covers any
std_logic value that is not `'0'`/`'1'` (see § 8.4).

**`completed` vs. `stopped`.** Only batch mode (§ 5.6) can produce
`completed` — a persistent board session never reaches it on its own,
since its wrapper is designed not to (§ 7.2). `stopped` covers every
user-initiated end, in either mode.

### 6.5 Error stages

| Stage | Cause | Frontend |
|---|---|---|
| `analyze` | `ghdl -a` failed on the student's source | Red console line; body carries GHDL's file:line |
| `elaborate` | `ghdl -e` failed on the generated testbench | Red; usually a port that does not match § 3.2 |
| `runtime` | simulation failed after `READY` | Red; stop the session |
| `protocol` | malformed or out-of-state frame | Log only — a client bug, not the student's |
| `internal` | unexpected server exception | Red |

### 6.6 Versioning

`HELLO`/`WELCOME` exist so a mismatch is detected rather than
misinterpreted. A server that does not support the requested version replies
`ERROR protocol`, lists supported versions in the body, and closes. New
verbs are additive.

---

## 7. Backend design

`server/`, Node.js + TypeScript, its own `package.json` and `node_modules`.
One runtime dependency: `ws`.

### 7.1 Modules

| File | Responsibility |
|---|---|
| `server.ts` | WebSocket server, connection accept, session registry (`Set<Session>`, also the `MAX_SESSIONS` count), signal-handled shutdown (§ 5.10) |
| `protocol.ts` | The **only** place § 6 is implemented. Encode/decode frames. No GHDL, no sockets — pure functions, unit-testable. |
| `session.ts` | One per connection: temp dir, state machine, lifecycle |
| `ghdl.ts` | Spawning GHDL; analyze, elaborate, both run modes (persistent § 5, batch § 5.6). Timeouts, stdout/stderr capture. |
| `tbTemplate.ts` | Generates the testbench from the detected port set |

Keeping `protocol.ts` free of I/O is what makes § 10.2's tests possible
without a socket or a GHDL install.

### 7.2 Session lifecycle

```ts
type SessionState = 'new' | 'compiling' | 'running' | 'stopped';
type SessionMode = 'board' | 'batch' | null;   // § 5.6
```

- Temp dir per session via `fs.mkdtemp`, GHDL's `cwd` always that directory,
  never the repo. Removed on teardown.
- `destroy()` on both `close` and `error`: kill any child process (either
  mode's), clear timers, `fs.rm` the directory. A dropped connection must
  never leave GHDL running. Registered once per session against
  `server.ts`'s `Set`, so `error`-then-`close` tears down once, not twice.
- **Neither may the backend's own death** (§ 5.10). `server.ts` keeps every
  live session in a `Set` and destroys them all on `SIGTERM`/`SIGINT` —
  a dropped *connection* was covered from the start; a killed *backend*
  (`stop.sh`, a restart, Ctrl-C) was not, and stranded board mode's
  deliberately-infinite wrapper children at 100 % CPU indefinitely.
- No session survives reconnect — consistent with the Workbench's existing
  "no persistence" behaviour.
- **`OUTPUT_POLL_MS` (80 ms)** — how often the Node side re-reads
  `output.txt` for a change, in board mode. The floor on end-to-end
  responsiveness regardless of how fast the VHDL side itself updates the
  file (§ 5.8) — no reason for the testbench's own polling to run finer
  than this.
- `mode` decides which of `run`/`batchRun` (and which handlers) are live —
  `board`'s wrapper loops forever on purpose (§ 5), so only `batch` can
  ever reach `DONE completed` on its own. A `RUN` can switch a session
  from one mode to the other mid-session; the previous run is torn down
  (its own `DONE stopped`) before the new one starts, same as re-`RUN`ning
  within one mode already did.
- **Exit-event identity, not just state.** Both `run.onExit` and
  `batchRun.done` are resolved against the *specific handle* that
  registered them (`this.run !== handle` / `this.batchRun !== handle`),
  not just `this.state`. `kill()` (Stop/Reset/a new RUN) clears the field
  synchronously, but the killed child's own exit event is necessarily
  asynchronous — if a new run has already started by the time it arrives,
  a plain state check reads 'running' again (the *new* run's) and would
  misattribute the stale exit to it.
- **Real-time pacing (§ 5.9)**, board mode only. `startRun` also starts a
  self-rescheduling `startPacing` loop, identity-checked against the same
  `handle` at every step for the same reason as `onExit` above. Torn down
  in the same three places `run`/`outputPollTimer` already are
  (`stopActive`, `destroy`, the run's own `onExit`) — a fourth place to
  remember, not a new pattern.

### 7.3 Port detection

Port over `detectEntityName()` / `detectPorts()` from the reference
(`server.js:52-133`) — a comment-stripped, balanced-paren scan of one
entity's own port clause. It is already written and already correct;
retarget it at § 3.2's names.

Two adaptations:

- **Finding the top entity.** The reference assumes one file. Here, scan all
  submitted files for entities and pick the one whose port names best match
  § 3.2's set — *unless* `RUN` named an explicit top file (§ 6.3), in
  which case that file's own declared entity wins outright, without being
  scored against the board interface at all. Do **not** assume the last
  file, and do not require a particular filename absent that hint. If
  nothing matches (no explicit hint, and no entity scores above zero),
  `ERROR elaborate` with a message naming the expected ports — this is a
  case a student will hit by misspelling `LEDR`, and the error must say
  so.
- **Optional ports.** `buildPortMap()` emits associations only for declared
  ports (`tbTemplate.js:21-33`). Unconnected outputs read `'X'` on the wire
  and render blank.

### 7.4 GHDL invocation

```
ghdl -a --std=08 <each file>
ghdl -a --std=08 DE1_SoC_tb.vhd
ghdl -e --std=08 DE1_SoC_tb
ghdl -r --std=08 DE1_SoC_tb [strategy-specific args]
```

- **`spawn(cmd, argsArray, { cwd })` only — never a shell string.** No
  source content, filename, or generic value is ever concatenated into a
  command line. This is the entire shell-injection defence; do not trade it
  for the convenience of `exec`.
- Every spawn gets a wall-clock timeout that kills the child. A design that
  never advances simulated time will otherwise hang forever — no cycle cap
  can catch it, because no cycles elapse.
- Capture `stderr` and forward it as `ERROR`'s body (proposal § 3.3's
  requirement that GHDL errors reach the web UI).

---

## 8. Frontend integration

### 8.1 Phase 0 — cut the mock wiring

**Do this first.** Reasoning in § 0. All edits in
`src/components/workbench/Workbench.tsx`.

**Step 1 — imports.** `bitsToNumber` and `numberToDisplays` become unused.
`noUnusedLocals` is on (`tsconfig.app.json:18`), so leaving them is a
**build error**, not a warning.

```tsx
// line 9 — drop bitsToNumber
import { Board, zeroBits, type BitVector } from '../board';

// line 13 — drop numberToDisplays, add blankSegments + the type
import {
  SevenSegmentDisplays,
  blankSegments,
  type SegmentVector,
} from '../SevenSegment';
```

Both `blankSegments` and `SegmentVector` are already exported from
`src/components/SevenSegment/index.ts`.

**Step 2 — delete the derived value.** Line 77:

```tsx
const dec = bitsToNumber(sw);   // DELETE
```

**Step 3 — add board output state**, next to `sw`/`key` (after line 76):

```tsx
// Board outputs are driven by the simulation backend, never by the inputs.
// Until GHDL is wired up they stay at their blank values — see
// ghdl_implementation_plan.md § 0 for why that is the correct state.
const [ledState, setLedState] = useState<BitVector>(() => zeroBits(10));
const [hexState, setHexState] = useState<SegmentVector[]>(() =>
  Array.from({ length: 6 }, () => blankSegments()),
);
```

**Step 4 — re-point the board.** Lines 446-447:

```tsx
<Leds value={ledState} />
<SevenSegmentDisplays value={hexState} />
```

Leave lines 448-449 (`Switches`, `Pushbuttons`) exactly as they are. Inputs
stay interactive; only outputs are cut.

**Step 5 — setters are unused until Phase 6.** `setLedState`/`setHexState`
are not called yet, which `noUnusedLocals` does *not* flag (they are used —
destructured and assigned). If the compiler does complain in your setup, do
not delete them and do not add `// @ts-ignore` (banned by
`Design_Description.md` § 1.1). Go straight to Phase 6 instead.

**Acceptance:**
- `npm run typecheck` clean.
- `npm run dev`, flip every switch and hold every pushbutton: **LEDs stay
  dark, all six displays stay blank.** Switches and buttons still move.
- Commit on its own, message to the effect of *"Disconnect the mock
  switch→LED wiring ahead of GHDL integration"*.

### 8.2 Phase 5 — `src/components/workbench/ghdlClient.ts`

The only file that speaks WebSocket. `Workbench.tsx` never touches the
socket directly.

```ts
export interface GhdlClientHandlers {
  onReady(): void;
  onState(ledr: BitVector, hex: SegmentVector[]): void;
  onLog(text: string): void;
  onError(stage: string, text: string): void;
  onDone(reason: string): void;
  onClosed(): void;
}

export class GhdlClient {
  constructor(url: string, handlers: GhdlClientHandlers);
  run(files: VhdlFile[]): void;
  stim(sw: BitVector, key: BitVector): void;
  reset(): void;
  stop(): void;
  close(): void;
}
```

- `run()` filters to `folder === 'vhdl'` and builds the `@@FILE …@@` body
  (§ 6.3).
- `onState` slices the 52-char field: `[0,10)` → `LEDR` via
  `patternToSegments`-style mapping, then six 7-char slices → `SegmentVector`
  via `patternToSegments`. **Slice 0 is `HEX0`** (§ 6.4).
- `'X'` → `0` per § 8.4.
- The parser is `indexOf('\n')` plus a `switch` on the verb. No dependency.

**URL resolution.** Derive from the page, never hardcode `localhost`:

```ts
`ws://${window.location.hostname}:${GHDL_WS_PORT}/ghdlsim`
```

so the LAN access this repo's `README.md` already documents
(`http://192.168.0.198:5173/`) reaches the backend too, with no config.

### 8.3 Phase 6 — wiring into `Workbench.tsx`

| Today | Becomes |
|---|---|
| `handleStart` schedules fake `Compiling …` timers (lines 334-365) | `client.run(files)`; `setStatus('compiling')`. Real `LOG` frames call `appendLog`. Delete `timers`/`clearTimers` if nothing else uses them. |
| `handleStop` clears timers, logs (lines 367-372) | also `client.stop()` |
| `setSw` / `setKey` | additionally `client.stim(nextSw, nextKey)`. Pass the **next** value, not the state variable — React state is not updated synchronously, and sending the stale one is a bug that presents as "the board is always one switch behind". |
| `status` | `'compiling'` on `run()`; `'running'` on `READY`; `'stopped'` on `DONE`/`ERROR`/socket close |
| `elapsedSeconds` | start the interval on `READY`, not on button press |

On `run()`, reset `ledState`/`hexState` to blank so the previous session's
last frame does not linger and read as this session's first result.

### 8.4 The `'X'` value

`STATE` may carry `'X'` for any std_logic that is not `'0'`/`'1'` — normal
before a design's reset settles, and for outputs the design never drives.
This repo's `Bit` is strictly `0 | 1` (`board/bits.ts`).

**Ship the coercion `'X' → 0`** in `ghdlClient`. It is one line and touches
no component.

The faithful alternative — a tri-state `Bit` with an "undefined" rendering,
as the reference has (its pink `ledundef`) — ripples through every board
component's props and needs a new documented visual state in
`Design_Description.md` § 4. Not worth it before there is evidence students
are confused by a dark board. Recorded in § 12.

---

## 9. Project layout

```
de1soc_Simulator/
├─ server/                      Node + TypeScript, own package.json
│  ├─ package.json              one runtime dep: ws
│  ├─ tsconfig.json
│  └─ src/
│     ├─ server.ts              connection accept, § 7.1
│     ├─ protocol.ts            § 6, pure, no I/O
│     ├─ session.ts             per-connection lifecycle, § 7.2
│     ├─ ghdl.ts                process spawning, § 7.4
│     ├─ portDetect.ts          top-entity + port-set scan, § 7.3
│     └─ tbTemplate.ts          testbench generator, § 7 / Appendix A
├─ start.sh / stop.sh           both servers, PID + log files in .run/
├─ src/components/workbench/
│  └─ ghdlClient.ts             § 8.2 — the only file that speaks § 6
└─ ghdl_implementation_plan.md  this file
```

`server/` has its own `package.json` deliberately: the reference's
`design_description.md` § 6 records that resolving `ws` from a system-wide
install worked on one machine and failed on every other. Pin it locally.

This does **not** violate the repo's "no runtime dependencies beyond React"
rule (`README.md`). That rule governs the browser bundle. `ws` never reaches
the browser.

**`start.sh` runs `./node_modules/.bin/vite` directly, not `npx vite`.**
Found by executing `stop.sh` and checking with `lsof`, not by reading the
script: `npx vite` runs vite as a *child* of npx, so `$!` only ever
captures npx's own PID, and killing that leaves vite itself running,
still holding the port — an orphaned process of exactly the kind § 7.2
and § 11 exist to prevent, just in the process-management script rather
than in a `Session`. Fixed by invoking the local binary directly, so
there is only one process to track and kill.

---

## 10. Testing and verification

The reference's own discipline, and it earned its place there: *do not trust
static reading — run it.* Several of its bugs were invisible in source and
obvious in a browser.

1. **VHDL first, by hand.** § 3.3's `ghdl -a` on the starter, and § 5.4's
   spike. No server code exists yet at this point, and both gates are real.
2. **`protocol.ts` unit tests.** Pure functions: encode/decode round-trips,
   multi-file `RUN` splitting, a body containing a `@@FILE@@`-lookalike,
   malformed `STIM`, unknown verbs. No socket, no GHDL.
3. **Raw protocol client.** A Node script using `ws` that drives the real
   backend and asserts on raw text. Cover: clean
   `RUN`→`READY`→`STIM`→`STATE`; `analyze` error (syntax); `elaborate`
   error (misspelled `LEDR`); multi-file with cross-file entity reference;
   partial interface (`SW`/`LEDR` only); `RESET`; `STOP`; disconnect
   mid-run (assert no orphan GHDL process — `pgrep ghdl`).
4. **Headless browser end-to-end.** Playwright is already a dev dependency
   (`tools/screenshot.mjs`). Load the Workbench, type VHDL into the real
   editor, Start, click a real switch, assert on the real `Leds` DOM. The
   decisive test is **`LEDR <= not SW`** — it passes only if the backend is
   genuinely driving the board, because the Phase 0 mock could never produce
   it. Make this the regression test.
5. **Fresh clone.** `git clone`, `npm install` at root and in `server/`,
   `./start.sh`, full round trip. Not "it worked on the machine that built
   it".
6. **Batch mode (§ 5.6), added post-ship, held to the same standard.**
   The user's own reported testbench, run for real: `READY`→11 `LOG`
   lines→`DONE completed` in under 100 ms, not estimated from reading the
   code. `DONE reason` distinguishes a run that finished on its own from
   one a `STOP` interrupted mid-way (a CPU-bound loop with no `wait`, so
   simulated-time tricks like `wait for 10 sec` can't fake "still
   running" — confirmed those cost GHDL nothing when nothing else is
   scheduled in between, which is also *why* batch mode fixes the timing
   problem). Switching modes across two `RUN`s on one connection (board →
   batch → board again), and the identity-checked exit handling in § 7.2,
   both exercised directly — the second was a latent race in the
   *original* persistent-mode code, found and fixed only because writing
   the equivalent batch-mode check first made the gap in the older code
   obvious.
7. **The `clkgen`/`CLOCK_500Hz` fix (§ 5.8), same day, same standard.**
   The reporting user's own design (a divide-by-125 `CLOCK_500Hz` counter)
   run against the pre-fix build first, to confirm the failure for real —
   25 s of real time, zero toggles — before touching any code. Re-run
   against the fix: toggling every ~150–350 ms, a 25 s sample, ~110
   toggles logged with timestamps. A `CLOCK_50`-declaring board design
   (the full starter interface) re-run the same way to confirm it: still
   `ghdl -a`/`-e` clean, `clkgen` still present in its output, switch→
   `LEDR` still functionally correct over a live session.
8. **Real-time pacing (§ 5.9), same day again.** The first implementation
   (a capped correction) shipped internally, tested, and failed — a
   scaled 2.5 s-target design measured at ~1.9 s average, not close
   enough — caught before it reached the user, not after. The fix
   (uncapped correction, a finer check interval) re-measured on the same
   scaled design: 2083, 2724, 2323, 2566, 2645 ms across five toggles,
   averaging ~2470 ms against the 2500 ms target. Stop sent deliberately
   during an active pause window returned `DONE` in 1 ms. The reported
   design itself (600 s target) run for 20 s and confirmed not to
   toggle early — the full 600 s was not waited out; § 5.9 states
   plainly what is and isn't covered by that. A `CLOCK_50` board design
   re-run unaffected: pacing measures non-positive drift for it and
   never engages.
9. **Orphaned children (§ 5.10) — the leak reproduced before it was
   fixed.** A client deliberately held open with a simulation running,
   then the backend sent the same `SIGTERM` `stop.sh` sends. Before the
   fix: a `PPID 1` `ghdl-mcode` still spinning after the backend was
   gone. After: `SIGTERM received — destroying 1 session(s) before exit.`
   in the log, `pgrep ghdl-mcode` empty, temp directory removed too.
   Also worth keeping as a habit rather than a test: `ps --sort=-pcpu`
   before trusting any timing measurement on this machine — § 5.10's
   whole investigation started as a false regression report.

> A note for whoever runs the Playwright tests here: in this project's
> headless setup, `ResizeObserver` callbacks are not delivered unless frames
> are being produced — take a screenshot between steps to pump the
> compositor, or layout-dependent assertions silently read stale values.
> This cost real debugging time during the board-scaling work.

---

## 11. Security

Running student-submitted VHDL through a real compiler is the feature; it
cannot be designed away. What is controllable:

- **No shell interpolation.** `spawn(cmd, argsArray)` (§ 7.4).
- **Bounds:** per-process wall-clock timeout, `MAX_SESSIONS`. A batch run
  (§ 5.6) needs its own explicit timeout (`BATCH_TIMEOUT_MS`) that the
  persistent mode doesn't: the polling wrapper's own infinite loop kept
  a runaway design alive on purpose before, which — for a batch run,
  with no such wrapper — is exactly the failure mode this timeout exists
  to catch instead (a process with no `wait` at all, or one waiting on a
  condition that never becomes true).
- **Filesystem isolation:** per-session `mkdtemp`, removed on teardown.
- **Validate at the boundary:** reject malformed `STIM` and oversized `RUN`
  bodies before touching disk. The protocol is unauthenticated; anything
  that reaches the port can send anything.
- **LAN scope.** This is a course tool on localhost or a classroom LAN. It
  is not hardened for the public internet, and making it so needs real OS
  sandboxing (container, seccomp, dedicated user) — out of scope, and
  stated here so nobody assumes otherwise.

---

## 12. Open decisions

| # | Decision | Status |
|---|---|---|
| 1 | **Simulation strategy** (§ 5) | **Closed 2026-09-17 — Candidate A** (persistent process). See § 5.4.1 for the spike evidence. |
| 2 | **Clock-rate handling** (§ 5.5) | **Closed 2026-09-17 — option 4 shipped as `CLOCK_500Hz`** (§ 5.7/§ 3.2): an already-divided, hardwired 500 Hz port, additive — nothing about a design's own `CLOCK_50`-based divider changes, and it is still slow for exactly the reason § 5.5 describes. Option 2 (teach a simulation-friendly divide constant in the starter) is still open on its own, now lower-priority: `CLOCK_500Hz` covers the common case (wanting *a* visible clock, not specifically a *derived-from-50 MHz* one) without touching course material at all. |
| 3 | **`'X'` rendering** (§ 8.4) | Closed — coerce to `0`. Internal, no course-material impact. |
| 4 | **Starter rewrite scope** (§ 3.3) | **Done** — `DE1_SoC.vhd`, real pin names, `btn` removed. Verified with `ghdl -a`/`-e`/`-r` on every starter file, including the offline testbench (Phase 1). |
| 5 | **Waveform capture** | Out of scope. The reference built it, then deleted it as unused. Revisit only if asked. |
| 6 | **`KEY`/`HEX0`…`HEX5` → `KEY_N`/`HEX0_N`…`HEX5_N`** (§ 3.2) | **Closed 2026-09-17**, at the course's request — a course convention, not a correction: the real DE1-SoC pins keep their plain names (§ 3.1), so this is the one part of § 3.2's contract that a design must rename before it synthesizes unmodified, same caveat as `CLOCK_500Hz`. Backend port-matching, the starter project, and this doc's Appendix A were all updated and re-verified against real GHDL together. |
| 7 | **`clkgen` unconditional, defeating `CLOCK_500Hz`** (§ 5.8) | **Found and closed 2026-09-17**, same day as decision 2, by an actual user hitting it. Not a new decision so much as decision 2 not actually being finished: `clkgen` now only exists when `CLOCK_50` is declared, and the `io` process's polling no longer rides its edges. Re-verified: the user's own repro (never toggled in 25 s before) now toggles every ~150–350 ms against a 250 ms target; a `CLOCK_50`-declaring board design re-checked unaffected. |
| 8 | **Simulator timing didn't predict hardware timing** (§ 5.9) | **Found and closed 2026-09-17**, minutes after decision 7, by the same user's next design. Decision 7 made `CLOCK_500Hz` designs fast; a design whose own math meant a 10-minute toggle was toggling every ~7 s instead — an emergent, unprincipled compression ratio, not real-time behaviour. Fixed with a VHDL-side heartbeat plus Node-side `SIGSTOP`/`SIGCONT` pacing, explicitly chosen (§ 5.9, `AskUserQuestion`) over leaving `CLOCK_500Hz` fast-forwarded. Re-verified: a scaled 2.5 s-target design converged to ~2470 ms average; the reported design confirmed not toggling early; Stop mid-pause returned in 1 ms; `CLOCK_50` designs unaffected (pacing never engages — already at or below real-time speed). |

| 9 | **Backend death orphaned its GHDL children** (§ 5.10) | **Found and closed 2026-09-17**, reported as a *third* timing complaint that turned out not to be a timing bug at all: two orphans from earlier restarts were pinning two cores, making a correct design measure ~5× slow. § 7.2's "a dropped connection must never leave GHDL running" only ever covered the connection dying. `server.ts` now keeps a session registry and destroys it on `SIGTERM`/`SIGINT`. Also fixed a latent double-decrement in the `error`-then-`close` teardown path it replaced. |

All nine are closed or explicitly out of scope. Whether to also add the
divide-constant teaching pattern from § 5.5's option 2 remains a live,
lower-priority question — it changes course material (what the starter
teaches), so it still warrants confirmation before doing it, unlike
`CLOCK_500Hz`, which changed only the board interface the backend
already owns.

---

## 13. Phased roadmap with acceptance criteria

All seven phases below were executed 2026-09-17. Each entry records what
the plan originally specified as the gate, and — where execution deviated
from the letter of that gate — what was actually done instead and why,
plus the real defects execution surfaced that a read-through would not
have caught. Nothing here is "should work"; each claim was run.

**Phase 0 — cut the mock wiring** (§ 8.1) — **done.**
`Workbench.tsx`: `bitsToNumber`/`numberToDisplays` removed, `ledState`/
`hexState` added (blank on mount), `<Leds>`/`<SevenSegmentDisplays>`
re-pointed to them. Verified in a real browser: every switch/key flip
with no session running leaves the board dark. `typecheck` clean.

**Phase 1 — starter VHDL matches the board** (§ 3.3) — **done.**
`files.ts`'s `TOP_VHD`/`TB_TOP_VHD` replaced with `DE1_SOC_VHD`
(`entity DE1_SoC`, the § 3.2 ports, `btn` gone) and `TB_DE1_SOC_VHD`.
`TOP_LEVEL_ENTITY` → `'DE1_SoC.vhd'`. Verified by extracting the actual
exported starter and running `ghdl -a/-e/-r --std=08` on every `vhdl/`
file plus the `work/` testbench by hand — all clean, not inferred from
reading the template strings.

**Phase 2 — spike the strategy** (§ 5.4) — **done. Result: Candidate A.**
Full pass/fail recorded in § 5.4.1: non-blocking file-based polling does
not stall GHDL's kernel, a live external input change is picked up and
flushed within one poll interval, and the process stays `R`/100 % CPU
(never `D`, blocked) across sampled intervals. § 12 decision 1 closed.

**Phase 3 — `protocol.ts` + `tbTemplate.ts`** — **done, with a deviation.**
No test runner exists yet in either package, so rather than add one for
a handful of pure functions, verification was direct: `generateTestbench()`
was run for four port-set scenarios (full interface, `SW`/`LEDR`-only,
legacy `rst` with `KEY_N`, legacy `rst` without `KEY_N`) and each output was
compiled — `ghdl -a`/`-e` — against a matching hand-written DUT. All four
elaborate clean. (The first attempt at the `rst`-without-`KEY_N` case used
the wrong DUT fixture — a copy-paste error in the *test*, not the
generator — caught because the elaboration error named the exact
mismatch; corrected and re-verified.) A full run-time round trip (not
just elaboration) was additionally run for the full-interface case,
confirming `STATE`'s output changes on a live `STIM`.

**Phase 4 — `session.ts` + `server.ts` + `ghdl.ts` + `portDetect.ts`** —
**done.** Verified with a raw `ws` client driving the live backend
end-to-end (not a mock, not localhost-only assumptions): clean
`RUN`→`READY`→`STIM`→`STATE`; an `analyze`-stage syntax error; an
`elaborate`-stage unmatched-entity error; a multi-file `RUN` with the top
entity's file sent *before* its dependency; `RESET`; `STOP`; and a hard
`ws.terminate()` mid-run confirmed via `pgrep` to leave no orphaned
`ghdl` process. **Two real defects found and fixed by this pass, not
anticipated by the plan text:**
- Analysis originally ran per-file in submission order, so a project
  whose top entity arrived before a file it depends on failed with a
  spurious "unit not found in library work" — exactly the fragility
  § 6.3 flagged as "top-entity-last only by luck," but the plan had not
  actually closed it. Fixed: `handleRun` now analyzes to a fixed point
  (each pass analyzes whatever remains; a pass that analyzes nothing new
  means the remaining failures are real), tolerating arbitrary file
  order rather than trusting the client's.
- `findTopEntity()`'s own regex-based port scan originally ran *before*
  `ghdl -a`, so genuinely invalid VHDL was intercepted by that heuristic
  and misreported as an `elaborate`-stage "no entity found" rather than
  an `analyze`-stage syntax error with GHDL's own diagnosis. Fixed:
  analysis now always runs first; the port scan only runs once GHDL has
  confirmed the source is valid.

**Phase 5 — `ghdlClient.ts`** — **done, with a deviation.** Same reasoning
as Phase 3: verified through Phase 6's real end-to-end test rather than
unit tests against a mocked `WebSocket`, since that harness would have
had to be built from nothing for one file. **`HEX0` lands in `value[0]`**
was confirmed visually — six independently-addressable segment readouts
in the real `SevenSegmentDisplays` DOM, correct positions.

**Phase 6 — wire into `Workbench`** (§ 8.3) — **done. The end-to-end gate
passed**, run in a real headless browser (Playwright) against the real
backend, exactly as prescribed: three switches flipped, the code edited
live in the real `<textarea>` from `LEDR <= SW;` to `LEDR <= not SW;`,
Start clicked — **7 of 10 LEDs lit** (10 − 3, inverted), a result the
Phase 0 mock cannot produce under any input, which is what makes it
proof rather than a plausible-looking coincidence. A further switch flip
while running changed the count live (7 → 6); Stop returned the board to
dark. **Two real defects found and fixed by this pass:**
- A session's testbench starts with `SW`/`KEY` at their own declared
  defaults, not wherever the board's switches already sat — flipping
  switches *before* Start had no effect on the first frame after Start
  until the user touched a switch again. Fixed: `onReady` now sends one
  `STIM` of the current input state immediately, read from `swRef`/
  `keyRef` (plain state would have been a stale closure here — the
  client's handlers are captured once, when the client is lazily built,
  not on every render).
- `onDone` (a plain `Stop`) did not blank the board, so it kept showing
  the last simulated frame after the user stopped the simulation —
  contradicts convention 11 exactly as directly as the mock it replaced
  ("nothing is currently driving this," yet something was still shown).
  Fixed: `onDone`, `onError` and `onClosed` all now call the same
  `blankBoard()` `handleStart` already used.

**Phase 7 — process management and docs** — see below; executed after
this table.

---

## Appendix A: generated testbench (real output)

Not illustrative — this is `generateTestbench('DE1_SoC', ports)`'s actual
output (`server/src/tbTemplate.ts`), captured by running it, for an entity
declaring the full interface (§ 3.2). A design that declares fewer ports
gets the same file with those associations simply absent from the `uut`
port map (§ 7.3) and their signals left at their declared "off" default —
no other structural difference. Entity name `de1soc_sim_tb`; signals are
`_sig`-suffixed to keep them visibly distinct from the DUT's own port
names in the association list. `sl2c`/`slv2str` are unchanged from the
reference's `tbTemplate.js`, adapted to this board's field widths.

```vhdl
library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

entity de1soc_sim_tb is
  generic (
    input_file       : string  := "";
    output_file      : string  := "";
    poll_interval_ns : integer := 1000;
    heartbeat_file   : string  := ""
  );
end entity;

architecture sim of de1soc_sim_tb is
  signal clk_sig    : std_logic := '0';
  signal clk500_sig : std_logic := '0';
  signal rst_sig    : std_logic := '0';
  signal sw_sig     : std_logic_vector(9 downto 0) := (others => '0');
  signal key_sig    : std_logic_vector(3 downto 0) := (others => '1');
  signal ledr_sig   : std_logic_vector(9 downto 0) := (others => '0');
  signal hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig
    : std_logic_vector(6 downto 0) := (others => '1');

  function sl2c(v : std_logic) return character is
  begin
    case v is
      when '0' => return '0';
      when '1' => return '1';
      when others => return 'X';
    end case;
  end function;

  function slv2str(v : std_logic_vector) return string is
    variable s : string(1 to v'length);
    variable idx : integer := 1;
  begin
    for i in v'high downto v'low loop
      s(idx) := sl2c(v(i));
      idx := idx + 1;
    end loop;
    return s;
  end function;

begin

  uut: entity work.DE1_SoC
    port map (
      clock_50 => clk_sig,
      clock_500hz => clk500_sig,
      sw => sw_sig,
      key_n => key_sig,
      ledr => ledr_sig,
      hex0_n => hex0_sig,
      hex1_n => hex1_sig,
      hex2_n => hex2_sig,
      hex3_n => hex3_sig,
      hex4_n => hex4_sig,
      hex5_n => hex5_sig
    );

  -- Free-running clock, only instantiated when the entity actually
  -- declares CLOCK_50 (§ 5.8) — its own 20 ns period is what makes a
  -- design that depends on it need millions of edges per visible change
  -- (§ 5.5). The `io` process below no longer rides on this clock's
  -- edges for its own timing (§ 5.8): this process exists solely to
  -- drive the DUT's own CLOCK_50 input.
  clkgen : process
  begin
    clk_sig <= '0'; wait for 10 ns;
    clk_sig <= '1'; wait for 10 ns;
  end process;

  -- CLOCK_500Hz: not a real DE1-SoC pin (§ 3.2) — a simulator-only
  -- convenience, already divided down to a human-visible rate, so a
  -- design can be genuinely sequential (a counter, a debouncer, a
  -- blinking LED) without hand-writing a 50 MHz divider, which would be
  -- correct but impractical to run interactively (§ 5.5). Runs
  -- unconditionally, like clkgen when present — 500 Hz is cheap enough on
  -- its own (§ 5.8) that there is nothing to gain by making this process
  -- itself conditional on the entity declaring it.
  clk500gen : process
  begin
    clk500_sig <= '0'; wait for 1 ms;
    clk500_sig <= '1'; wait for 1 ms;
  end process;

  -- Real-time pacing heartbeat (§ 5.9): reports this session's own
  -- simulated-time progress to the Node side every 20 ms of simulated
  -- time, so a session that would otherwise run far ahead of wall-clock
  -- time (§ 5.8's fix made this the common case for anything not
  -- declaring CLOCK_50) can be throttled (SIGSTOP/SIGCONT) back toward
  -- it — a design's timing in the simulator is then a real prediction of
  -- its timing on actual hardware, not an accident of how many events
  -- GHDL happened to process per real second.
  heartbeat : process
    file fhb : text;
    variable status : file_open_status;
    variable l : line;
  begin
    loop
      wait for 20 ms;
      if heartbeat_file'length > 0 then
        file_open(status, fhb, heartbeat_file, write_mode);
        if status = open_ok then
          write(l, now / 1 ms);
          writeline(fhb, l);
          file_close(fhb);
        end if;
      end if;
    end loop;
  end process;

  io : process
    file fin  : text;
    file fout : text;
    variable status : file_open_status;
    variable l : line;
    variable rec : string(1 to 14);
    variable last : string(1 to 52) := (others => ' ');
    variable now  : string(1 to 52);
  begin
    loop
      -- A plain time-based wait, not clock edges (§ 5.8) — this process
      -- has nothing to do with whatever clock, if any, the DUT itself
      -- runs on; tying it to CLOCK_50's own 20 ns period was what made a
      -- CLOCK_500Hz-only (or clockless) design pay CLOCK_50's cost anyway.
      wait for poll_interval_ns * 1 ns;

      -- STIM's own wire format (§ 6.3): SW9..SW0, KEY3..KEY0, 14 bits.
      -- A missing file (no STIM sent yet this session) is not an error —
      -- inputs simply keep their declared defaults. Getting this
      -- unconditional file_open() right the first time was the one
      -- correction the raw-client test suite (§ 10) forced (§ 5.4.1's
      -- spike used it too, but a real session's very first poll — before
      -- any STIM at all — is the case that actually exercises it).
      if input_file'length > 0 then
        file_open(status, fin, input_file, read_mode);
        if status = open_ok then
          if not endfile(fin) then
            readline(fin, l);
            if l'length >= 14 then
              read(l, rec);
              for i in 0 to 9 loop
                sw_sig(9 - i) <= '1' when rec(1 + i) = '1' else '0';
              end loop;
              for i in 0 to 3 loop
                key_sig(3 - i) <= '1' when rec(11 + i) = '1' else '0';
              end loop;
            end if;
          end if;
          file_close(fin);
        end if;
      end if;

      -- STATE's own wire format (§ 6.4): LEDR then HEX0..HEX5, 52 bits.
      now := slv2str(ledr_sig) & slv2str(hex0_sig) & slv2str(hex1_sig)
                               & slv2str(hex2_sig) & slv2str(hex3_sig)
                               & slv2str(hex4_sig) & slv2str(hex5_sig);
      if now /= last and output_file'length > 0 then
        -- Opened, written and closed on every change rather than held
        -- open for the session: file_close is what flushes, and a
        -- concurrent reader on the Node side needs that flush to see
        -- the update without waiting for this process to exit.
        file_open(status, fout, output_file, write_mode);
        write(l, now);
        writeline(fout, l);
        file_close(fout);
        last := now;
      end if;
    end loop;
  end process;

end architecture;
```

A legacy entity declaring `rst` additionally gets one concurrent
assignment after the `uut` instantiation — `rst_sig <= not key_sig(0);`
when `key_n` is also declared, `rst_sig <= '0';` when it isn't (§ 3.2's
"Legacy tolerance" rule) — one of two other ways the generated file
varies from this, `CLOCK_500Hz` (§ 5.7) aside: the other is `clkgen`
itself, present above only because this example declares `CLOCK_50` —
an entity that doesn't gets no `clkgen` process at all, not just no
association (§ 5.8).

---

## Appendix B: protocol transcript

```
C→S: HELLO 1
S→C: WELCOME 1
C→S: RUN
     @@FILE DE1_SoC.vhd@@
     library ieee;
     use ieee.std_logic_1164.all;
     entity DE1_SoC is
       port (
         SW   : in  std_logic_vector(9 downto 0);
         LEDR : out std_logic_vector(9 downto 0)
       );
     end entity;
     architecture rtl of DE1_SoC is
     begin
       LEDR <= not SW;
     end architecture;
S→C: LOG GHDL 5.0.1 (mcode)
S→C: READY
S→C: STATE 1111111111111111111111111111111111111111111111111111
C→S: STIM 00000000011111
S→C: STATE 1111111110111111111111111111111111111111111111111111
C→S: STOP
S→C: DONE stopped
```

All `HEX` fields read `1111111` — blank, active low — because this entity
declares no `HEX` ports, so the testbench leaves them unassociated (§ 7.3).

The first `STATE` arrives before any `STIM`: `SW` starts at zero, so
`not SW` is all ones and every LED lights. That is the partial-interface
path and the "outputs are driven, not mirrored" property in one frame — and
it is the same `not SW` design Phase 6's acceptance test uses, for the same
reason.
