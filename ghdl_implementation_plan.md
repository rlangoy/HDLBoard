# GHDL Backend — Implementation Plan

**Status: nothing described here is built yet.** This is a work order. It is
written to be executed by someone (or some agent) who has not been part of
the discussion that produced it, so every phase states the files to touch,
the exact edit, and the acceptance test that proves the phase is done.

The end state: the Workbench compiles and simulates the VHDL project in its
Files panel with real GHDL, and the board's LEDs and 7-segment displays show
what that VHDL actually drives — not, as today, a mock that copies the
switches straight to the LEDs.

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
- [Appendix A: persistent testbench skeleton](#appendix-a-persistent-testbench-skeleton)
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
hardware's own pin names is what makes that literally true — a student can
take their `DE1_SoC.vhd` to Quartus, add a pin assignment file, and program
the board.

```vhdl
entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SW       : in  std_logic_vector(9 downto 0);
        KEY      : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0     : out std_logic_vector(6 downto 0);
        HEX1     : out std_logic_vector(6 downto 0);
        HEX2     : out std_logic_vector(6 downto 0);
        HEX3     : out std_logic_vector(6 downto 0);
        HEX4     : out std_logic_vector(6 downto 0);
        HEX5     : out std_logic_vector(6 downto 0)
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
- **No reset port.** Reset is `KEY(0)` by convention, in the student's own
  VHDL, exactly as on hardware. The backend does not synthesise one.
- **Legacy tolerance.** If an entity declares `rst`, the testbench drives it
  from `not KEY(0)` so older files still elaborate. Document it as legacy;
  do not teach it.
- **`HEX` is six 7-bit ports, active low**, matching `segments.ts`'s
  documented `SEGMENT_PATTERNS` (`0` lights a segment) and the real part.

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
- `work/tb_top.vhd` stays the student's own offline testbench. It is **not**
  sent to the interactive backend (§ 6.3).

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

**Recommendation: 1 + 2.** Document the limit, and make the starter's
example use a named divide constant so the pattern is in front of the
student from day one. See § 12.

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
| `RUN` | — | the VHDL project | Analyze, elaborate, start. | `compile` + `start` |
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
- **`work/` is never sent.** `tb_top.vhd` is the student's own offline
  testbench. The generated testbench replaces it for interactive use, and
  analyzing both would give GHDL two testbenches.
- A file whose own first line looks like `@@FILE …@@` is rejected with
  `ERROR protocol` rather than silently mis-split.

### 6.4 Server → client

| Verb | Args | Body | Meaning | Proposal § 4 equivalent |
|---|---|---|---|---|
| `WELCOME` | version | — | Answer to `HELLO`. | — |
| `READY` | — | — | Analyzed, elaborated, simulating. | `status` |
| `STATE` | 52 chars `[01X]{52}` | — | Board outputs. | `output` |
| `LOG` | — | free text | Console line. | `status` |
| `ERROR` | stage | error text | Failure, classified. | `error` |
| `DONE` | reason | — | Session ended: `stopped`/`max-cycles`/`closed`. | `status` |
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
| `server.ts` | WebSocket server, connection accept, session registry, `MAX_SESSIONS` |
| `protocol.ts` | The **only** place § 6 is implemented. Encode/decode frames. No GHDL, no sockets — pure functions, unit-testable. |
| `session.ts` | One per connection: temp dir, state machine, lifecycle |
| `ghdl.ts` | Spawning GHDL; analyze, elaborate, run. Timeouts. |
| `tbTemplate.ts` | Generates the testbench from the detected port set |

Keeping `protocol.ts` free of I/O is what makes § 10.2's tests possible
without a socket or a GHDL install.

### 7.2 Session lifecycle

```ts
type SessionState = 'new' | 'compiling' | 'running' | 'stopped';
```

- Temp dir per session via `fs.mkdtemp`, GHDL's `cwd` always that directory,
  never the repo. Removed on teardown.
- `destroy()` on both `close` and `error`: kill any child process, clear
  timers, `fs.rm` the directory. A dropped connection must never leave GHDL
  running.
- No session survives reconnect — consistent with the Workbench's existing
  "no persistence" behaviour.

### 7.3 Port detection

Port over `detectEntityName()` / `detectPorts()` from the reference
(`server.js:52-133`) — a comment-stripped, balanced-paren scan of one
entity's own port clause. It is already written and already correct;
retarget it at § 3.2's names.

Two adaptations:

- **Finding the top entity.** The reference assumes one file. Here, scan all
  submitted files for entities and pick the one whose port names best match
  § 3.2's set. Do **not** assume the last file, and do not require a
  particular filename. If nothing matches, `ERROR elaborate` with a message
  naming the expected ports — this is a case a student will hit by
  misspelling `LEDR`, and the error must say so.
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
├─ server/                      NEW — Node + TypeScript, own package.json
│  ├─ package.json              one dep: ws
│  ├─ tsconfig.json
│  └─ src/
│     ├─ server.ts
│     ├─ protocol.ts            § 6, pure, unit-tested
│     ├─ session.ts
│     ├─ ghdl.ts
│     └─ tbTemplate.ts
├─ start.sh / stop.sh           NEW — both servers, PID + log files
├─ src/components/workbench/
│  └─ ghdlClient.ts             NEW — § 8.2
└─ ghdl_implementation_plan.md  this file
```

`server/` has its own `package.json` deliberately: the reference's
`design_description.md` § 6 records that resolving `ws` from a system-wide
install worked on one machine and failed on every other. Pin it locally.

This does **not** violate the repo's "no runtime dependencies beyond React"
rule (`README.md`). That rule governs the browser bundle. `ws` never reaches
the browser.

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
- **Bounds:** per-process wall-clock timeout, `MAX_SESSIONS`, and — if
  Candidate B — `MAX_CYCLES`.
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

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Simulation strategy** (§ 5) | Decide from the Phase 2 spike. Prefer persistent; fall back to re-simulation on spike failure. |
| 2 | **Clock-rate handling** (§ 5.5) | Document the limit, and put a named divide constant in the starter so the pattern is taught. |
| 3 | **`'X'` rendering** (§ 8.4) | Coerce to `0` now; revisit only with evidence. |
| 4 | **Starter rewrite scope** (§ 3.3) | Rename to `DE1_SoC.vhd` with real pin names. Affects course material — confirm before doing it. |
| 5 | **Waveform capture** | Out of scope. The reference built it, then deleted it as unused. Revisit only if asked. |

Decisions 1 and 3 are internal and can be made by whoever implements.
**Decisions 2 and 4 change what students see and should be confirmed first.**

---

## 13. Phased roadmap with acceptance criteria

**Phase 0 — cut the mock wiring** (§ 8.1)
Board dark and blank with all switches flipped; `typecheck` clean; own commit.

**Phase 1 — starter VHDL matches the board** (§ 3.3)
`ghdl -a --std=08 *.vhd` clean on the exported starter; `DE1_SoC` declares
the § 3.2 ports; `btn` gone; `TOP_LEVEL_ENTITY` updated.

**Phase 2 — spike the strategy** (§ 5.4)
A written pass/fail with the commands run and output observed, recorded in
this document. Not "it should work" — what happened.

**Phase 3 — `protocol.ts` + `tbTemplate.ts`**
Unit tests green. Generator output compiles under `ghdl -a` for: full
interface, `SW`/`LEDR` only, and a legacy entity with `rst`.

**Phase 4 — `session.ts` + `server.ts` + `ghdl.ts`**
Raw client (§ 10.3) passes every listed case. Kill the client mid-run;
`pgrep ghdl` returns nothing.

**Phase 5 — `ghdlClient.ts`**
Unit tests against a fake WebSocket: frames built correctly, `STATE`
mapped correctly, **`HEX0` lands in `value[0]`**.

**Phase 6 — wire into `Workbench`** (§ 8.3)
The end-to-end gate: with `LEDR <= not SW`, all switches down lights **all
ten LEDs**. That result is impossible under the Phase 0 mock, which is what
makes it proof.

**Phase 7 — process management and docs**
`start.sh`/`stop.sh` work from a fresh clone. `README.md` gains GHDL as a
requirement and install instructions (the reference's own README covers
Ubuntu/Fedora/macOS/WSL and is directly reusable). `Design_Description.md`
and `workbench/README.md` stop describing the board as a mock.

---

## Appendix A: persistent testbench skeleton

For the Phase 2 spike and, if it passes, Candidate A. Illustrative — the
generator produces the real one, with only the declared ports associated.

```vhdl
library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

entity DE1_SoC_tb is
  generic (
    input_file  : string := "input.txt";
    output_file : string := "output.txt";
    poll_cycles : integer := 50          -- input latency vs. I/O cost
  );
end entity;

architecture sim of DE1_SoC_tb is
  signal CLOCK_50 : std_logic := '0';
  signal SW   : std_logic_vector(9 downto 0) := (others => '0');
  signal KEY  : std_logic_vector(3 downto 0) := (others => '1');
  signal LEDR : std_logic_vector(9 downto 0);
  signal HEX0, HEX1, HEX2, HEX3, HEX4, HEX5 : std_logic_vector(6 downto 0);
  -- slv2str: MSB-first, '0'/'1'/'X'   (from the reference's tbTemplate.js)
begin

  uut: entity work.DE1_SoC
    port map (
      CLOCK_50 => CLOCK_50, SW => SW, KEY => KEY, LEDR => LEDR,
      HEX0 => HEX0, HEX1 => HEX1, HEX2 => HEX2,
      HEX3 => HEX3, HEX4 => HEX4, HEX5 => HEX5
    );

  -- Free-running clock. Never blocks, never waits on I/O.
  clkgen : process
  begin
    CLOCK_50 <= '0'; wait for 10 ns;
    CLOCK_50 <= '1'; wait for 10 ns;
  end process;

  -- Poll input, publish output. Regular files only: file_open on a regular
  -- file never blocks, which is what keeps the kernel from stalling (the
  -- failure the reference hit with a blocking pipe).
  io : process
    file fin  : text;
    file fout : text;
    variable l : line;
    variable rec : string(1 to 14);
    variable last : string(1 to 52) := (others => ' ');
    variable now  : string(1 to 52);
  begin
    loop
      for i in 1 to poll_cycles loop
        wait until rising_edge(CLOCK_50);
      end loop;

      file_open(fin, input_file, read_mode);
      if not endfile(fin) then
        readline(fin, l);
        read(l, rec);
        -- rec(1..10) = SW9..SW0, rec(11..14) = KEY3..KEY0
      end if;
      file_close(fin);

      now := slv2str(LEDR) & slv2str(HEX0) & slv2str(HEX1) & slv2str(HEX2)
                           & slv2str(HEX3) & slv2str(HEX4) & slv2str(HEX5);
      if now /= last then
        -- open/write/close per change: file_close is what flushes, and
        -- flushing is the whole point (§ 5.2).
        file_open(fout, output_file, write_mode);
        write(l, now); writeline(fout, l);
        file_close(fout);
        last := now;
      end if;
    end loop;
  end process;

end architecture;
```

The spike's job is to confirm that a change written to `input.txt` shows up
in `output.txt` within `poll_cycles`, while the clock keeps running.

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
