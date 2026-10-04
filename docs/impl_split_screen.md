# Split-Screen Testbench / Design Editor — Implementation Specification

> Licensed under the [GNU General Public License v2.0](../LICENSE).

| | |
|---|---|
| **Document** | `docs/impl_split_screen.md` |
| **Version** | 1.2 |
| **Status** | Ready for implementation |
| **Changes in 1.1** | Simulate runs the testbench the student is looking at (D10, D20, D21: `runTarget`, `work/` runs); a high-confidence testbench opens the split even when its design is missing (D22). New testbenches are named `<stem>_tb` (the `tb_` prefix is reserved); fixtures renamed. Q1/Q2 decided. |
| **Changes in 1.2** | One normative rule set (§ 1.1). The split opens on **any strong testbench evidence**; the design side never decides (D22, D23). Rules are classed *strong* / *weak* and UI decisions use the class, not score bands (D23). Simulate routes to the testbench unit and focuses its pane (D24). Role-coloured pane headers (D25). New rule `vlog-event-wait`; `vlog-delay` split from `vlog-assign-delay`; `vhdl-file-io` is weak. |
| **Supersedes** | *Split-Screen RTL/Testbench Editor Specification* v2.0 where § 3 (Decisions) says so |
| **Target** | HDLBoard (`src/components/workbench/`), React 18.3 + TypeScript 5.6 + Vite 5, plain CSS |
| **Languages** | VHDL (GHDL, `--std=08`) and Verilog (Icarus Verilog) |

---

## Contents

1. [Summary](#1-summary)
2. [What HDLBoard already has](#2-what-hdlboard-already-has)
3. [Decisions](#3-decisions)
4. [User experience](#4-user-experience)
5. [Detection engine](#5-detection-engine)
6. [Architecture and code](#6-architecture-and-code)
7. [Test plan and fixtures](#7-test-plan-and-fixtures)
8. [Implementation steps](#8-implementation-steps)
9. [Acceptance criteria](#9-acceptance-criteria)
10. [Out of scope (phase 2)](#10-out-of-scope-phase-2)
11. [Open questions](#11-open-questions)

---

## 1. Summary

HDLBoard gets a **vertical split inside the editor column**: the **testbench (TB)
pane on the left** and the **design (RTL) pane on the right**, next to the board
it drives. A pure, lexical detector scores every design unit (VHDL entity +
architecture, Verilog module) for simulation-only constructs that appear **in
code, never in comments, strings or disabled preprocessor regions**. When the
file a student opens — or the file they press **Simulate** on — is or has a
testbench, the split opens and each pane scrolls to its own code. A
setting chooses *Automatic / Always / Never*; a three-way view switch
**[TB | Both | RTL]** and chip/flask icons make the role of every pane visible
at a glance.

**What runs is what you press Play in.** Play in the TB pane runs that
testbench unit; Play in the RTL pane, or a run with no testbench involved, runs
exactly as today (AC-6). That needs one small protocol addition — an optional
`runTarget` unit on `RUN` — and lets a `work/` testbench run (D20, D21).

### 1.1 Core behaviour rules

These rules are normative. Every later section implements them; where a later
section seems to say otherwise, this list wins and the section is the bug.

| # | Rule |
|---|---|
| **B1** | **The split opens when the shown file is, or is paired with, a testbench** — a unit with *strong* testbench evidence (§ 5.4), or one the user marked as testbench. Weak evidence alone never opens it; it offers the suggestion chip (§ 4.7). |
| **B2** | **Pairing only decides what the RTL pane shows**: the paired design, the same file's design unit, or an empty state. It never decides *whether* the split opens. |
| **B3** | **The layout changes only on open, tab switch, Simulate, reveal or create** — never while typing. |
| **B4** | **Simulate routes to the testbench**: Start or a tab's Play on a file that contains a testbench unit runs that unit and focuses the TB pane; on a design file it runs the design and focuses the RTL pane. A pane's own Play always runs that pane's unit. |
| **B5** | **What runs is what is focused.** After any Simulate, the pane whose unit runs has focus and shows Stop. |
| **B6** | **The user's word beats detection**: a pin from the view switch, a role override and a pair override are never overruled by detection. *Never* never auto-opens; *Always* splits whenever the file has a testbench (a design with none keeps a single pane). A pair override the code contradicts - the testbench instantiates designs defined in other files, none in the paired one - is not the user's word about this code: it is never offered, used or kept (`contradictsCode`, pruned at startup and after every analysis). |
| **B7** | **A one-unit design file runs exactly as today** (AC-6). |

---

## 2. What HDLBoard already has

The spec is written against the repository as it stands. These facts decide
most of the design; an implementer should read the named files first.

| Area | Today | Consequence for this feature |
|---|---|---|
| Stack mandate | `Design_Description.md` § 1.1: TypeScript + React + **plain CSS**, no CSS-in-JS, no Tailwind. Runtime dependencies are `react` and `react-dom` only. | No panel library; the divider is built like the existing ones (D2). |
| Code standard | § 1.3 Clean Code; Verilog plan § 7: functions aim ≤ 20 lines, hard cap 40; pure logic apart from I/O; `noUnusedLocals`. | Detector, pairing and view logic are pure modules with their own tests. |
| Editor | `CodeEditor.tsx`: a transparent `<textarea>` over a highlighted `<pre>`, with its own tab strip, gutter, diagnostics and `useRevealLine`. File content lives in `Workbench` state (single source of truth). | Two panes showing one file is two `<textarea>`s bound to the same string — no shared-model machinery needed (D9). |
| Pane geometry | `paneLayout.ts` (pure) + `usePaneLayout.ts` (hook): Explorer \| editor \| Board, pointer-captured dividers (`.wb-resizer`), snap-to-collapse (`collapsesAt`), layout in `localStorage` key `hdlboard.paneLayout.v1`. `EDITOR_MIN_W = 200`. | The split divider reuses the same class, capture technique and collapse rule. The split lives *inside* the editor column; `fitSidePanes` is unchanged. |
| Tokenizers | `tokenizeSource` → `vhdlHighlight.ts` (line-based; does **not** treat VHDL-2008 `/* */` as comments; its `'…'` rule can swallow `clk'event … '1'`) and `verilogHighlight.ts` (tracks block comments). | The detector gets its own *blanking* lexer (§ 5.2) rather than reusing the highlighter's tokens. Precedent: `server/src/engines/vhdlPorts.ts` `blankComments`. |
| Folders and names | `fileKinds.ts`: `vhdl/` and `verilog/` hold designs; `work/` holds VHDL `tb_*` files, which are **kept out of every run**. Since 1.2.2 `fileNameRules.ts` **refuses new file names starting with `tb_`** (reserved for the generated `hdl_board_tb`); existing `tb_` files in `work/` are left as they are. | New testbenches are named `<stem>_tb` and live in `vhdl/` or `verilog/` like any file, so they run normally. `work/` is legacy: its files are shown and paired, and run only as a run target (D21). |
| Running | Start runs the file marked top (blue dot); a tab's Play icon makes that file top and runs it (`runIcon.ts`). The backend picks **board** mode when the top has a board port (`SW`, `LEDR`, `KEY_N`, `HEX0_N`…, `CLOCK_50`), **batch** mode for a portless top. Verilog's top module is the file's only module, else the one named like the file (`chooseTopModule`). | Simulate arranges panes, then runs the unit of the pane pressed (D10, D20). A mixed file can no longer only run the unit named like the file. A board design without a testbench is normal — no "no testbench" nag. |
| Persistence | Desktop app: `Workspace { files, openTabs, activeTabId, topFileId }` via `desktop.ts`. Browser: nothing stored except `localStorage` UI state. | UI preferences → `localStorage`; per-project overrides → `Workspace` (D12). |
| Settings | `SettingsDialog.tsx`: one desktop-only setting; the browser shows "No settings are available for now". | The split preference becomes the first setting in both builds. |
| Theme / language | One light theme. UI text is English (note: `index.html` declares `lang="no"`, Q4). | Colour tokens ready for a dark theme; strings in one module (D15, D16). |

---

## 3. Decisions

Each row resolves a point from spec v2.0 or from the review comments. "Review"
refers to the reviewer's notes that came with v2.0.

| # | Decision | Replaces / answers | Why |
|---|---|---|---|
| D1 | **TB pane left, RTL pane right**, inside the editor column. Not configurable. | v2.0 § 3 diagram (RTL left); review "resolve left/right default (critical)". | Requested default. It also reads well in HDLBoard: the RTL pane sits beside the Board pane, the hardware it describes; the TB sits beside the Explorer. A setting would double the test surface for no requested use. |
| D2 | **No `react-resizable-panels`, no Allotment.** The divider is a small hook in the style of `usePaneLayout`. | v2.0 § 14; review "optionally list Allotment". | The mandate allows no styling frameworks and the app ships no runtime deps beyond React; the existing dividers already solve capture, clamping and collapse. The library is also a moving target: v4 renamed `PanelGroup`/`PanelResizeHandle` to `Group`/`Separator`, so a spec pinned to its API dates quickly. |
| D3 | Detection is **lexical** (blanked source + patterns), not a parser. tree-sitter/WASM grammars rejected. | v2.0 § 5 "parsed HDL syntax". | Same approach as `declaredNames.ts` and `vhdlPorts.ts`; no new dependency; the fixtures (§ 7.1) pin down every case the lexer must get right. |
| D4 | Scores are computed **per design unit**, each rule counting **at most once per unit**, clamped to 0…100. A file's role is derived from its units. | v2.0 § 6–8 (file-level, unbounded). | A file can hold design and testbench (single-file case). Presence-based scoring stops fifty `wait for`s inflating a score. |
| D5 | **Re-weighted rules** (§ 5.4). Notable: `$readmemh`/`$readmemb` score **0**, `initial` **+5**, `wait until` **+10**, `after` **+10**, `assert` **+5**; **board ports −50**; `$finish`/`std.env.stop` **+30**; translate_off / `` `ifndef SYNTHESIS `` **+20**. | v2.0 § 6–7. | Memory init with `$readmemh` in an `initial` block is synthesizable for FPGAs, `wait until rising_edge(clk)` is synthesizable, `after` and `assert` appear in student RTL. A design with DE1-SoC ports is never a testbench. |
| D6 | The score (0…100) is kept for the "Why?" popover and as the **medium** bar (≥ 40 with weak evidence only). It no longer decides *high*: that comes from evidence class (D23). | v2.0 § 8; review "score thresholds brittle". | A score is a sum of guesses; whether a construct can exist in hardware is a fact about the construct. |
| D7 | **The layout changes only on a pair-change event** (open, tab switch, Simulate, reveal, create) — **never while typing.** Typing may show a suggestion chip. | Review "auto-close when last TB region deleted". | A layout that jumps under the caret is worse than one that is a step behind. |
| D8 | **One tab strip, paired view** — not VS Code-style editor groups with a tab strip each. Clicking a tab shows that file and its partner. | v2.0 § 3–4. | Students get one place to find files; state stays a pair, not two tab lists. VS Code's own "Split in Group" shows the same file twice inside one group, which is the single-file case here. |
| D9 | **Phase 1 ships both** single-file dual view and multi-file pairing. | Review step 5 ("decide whether the first implementation supports same-document dual view"). | Content is already single-sourced in `Workbench` state, so the dual view costs two textareas and two reveal targets. |
| D10 | **The pane you press Play in decides what runs.** Simulate arranges the panes first (medium confidence suffices). Play in the TB pane runs that testbench **unit**; Play in the RTL pane, a tab's Play and Start on a design run the design as today — naming its unit only when the file holds more than one. v2.0's "No testbench detected" dialog is **dropped**; a `RunTestbenchDialog` (testbench *units*) appears only when a design without board ports is run and a testbench instantiates it. | v2.0 § 11; 1.0's "Simulate never changes what runs"; review "run-target behaviour". | A TB pane that Simulate ignores is decoration: in 1.0 a mixed `alu.v` ran `alu`, and a `work/` testbench could not run at all. In HDLBoard the board *is* the stimulus for most labs, so nagging on every board run would still be wrong. |
| D11 | Region navigation on **Alt+PageDown / Alt+PageUp** (plus buttons). | v2.0 § 10 (Alt+[ / Alt+]). | On Norwegian and other Nordic layouts `[` is AltGr+8, so Alt+[ cannot be typed. |
| D12 | **UI preferences in `localStorage`** (`hdlboard.editorSplit.v1`); **role and pair overrides in the project** (`Workspace`, desktop) and session-only in the browser. Last-visited TB region **not persisted** (D18). | v2.0 § 12 vs § 13 contradiction. | Preferences belong to the person, overrides to the project. |
| D13 | **No quick-scan pass and no Web Worker.** Full analysis is a few milliseconds; a budget test guards it. | Review "quick scan on open"; v2.0 § 15 incremental analysis. | Two code paths for one result is dead weight at student file sizes. `analyzeProject` is pure, so moving it to a Worker later is mechanical (§ 5.9). |
| D14 | Auto-close policy: (a) opening a file without TB in *Automatic* → single pane; (b) **closing the partner's tab** collapses the split and pins that pair single for the session; (c) deleting TB code shows a note in the TB pane, the layout updates at the next pair change. | Review "pure RTL file while in split mode", "auto-close". | Each case follows from D7 and from "never override user intent". |
| D15 | Badge colours are tokens in `Workbench.css`; text + icon on every badge. | Review "theme support". | Only a light theme exists; tokens make a dark theme a token swap. Colour is never the only cue (existing editor rule). |
| D16 | All new UI text in **`testbenchText.ts`**, English, no i18n library. | Review "internationalisation". | The UI is English; one file is all a later translation needs. |
| D17 | Pairing uses HDLBoard's folders (`vhdl/`, `verilog/`, `work/`), instantiation and naming. v2.0 § 16 directories (`tb/`, `sim/`…) do not exist here. | v2.0 § 16; review "how the system chooses left/right with multiple candidates". | Rules in § 5.8 are deterministic, with a tie-break chain. |
| D18 | Last selected TB region is session state only. | v2.0 § 13. | After a restart the first region is the right place to start. |
| D19 | Roles are labelled **TB** (flask icon) and **RTL** (chip icon); tooltips spell out "Testbench — simulation-only code" and "Design (RTL) — synthesizable code". | v2.0 § 3; review "chip vs flask". | Short, recognisable, and both words are course vocabulary. |
| D20 | **`RUN` gets an optional run target**: `RUN <topFile> @<unit>`. The server elaborates that unit instead of choosing one from the file name, and rejects a unit the top file does not declare. Without it, behaviour is byte-identical to today. | 1.0 Q2. | The smallest change that lets a testbench inside a mixed file run. An uploaded file name may contain spaces, so the target is not "the second token": it is a trailing ` @<identifier>` after the file's accepted extension, which no file name can end in. |
| D21 | **A `work/` testbench runs when it is the run target**: the run sends the `vhdl/` files **plus that one file**. Every other run still excludes `work/`. | 1.0 Q1. | Only legacy files are affected: new `tb_` names are refused since 1.2.2. Keeps the reason `work/` exists — a stray testbench never breaks a board run — while the testbench the student is looking at can run. |
| D22 | **A testbench opens the split whatever its design side looks like** (B2). The RTL pane shows the paired design, or an empty state: *"counter_done is not in this project"* when the DUT is missing, *"This testbench does not instantiate a design"* when it names none. | 1.0 § 4.2 rule 4; 1.1 (single pane for a testbench with no DUT); review "one rule". | The request was "open when a file contains testbench syntax". One rule is easier to predict than three, and the empty state still says something useful. |
| D23 | **Evidence classes.** Each rule is *strong* (a construct that has no meaning in synthesizable code: `wait for`, `wait;`, clock generators, procedural `#` delays, `$finish`/`std.env.stop`, a portless unit driving a DUT, …) or *weak* (also found in RTL: `after`, `wait until`, `assert`, `initial`, `$display`, translate_off, names, VHDL file I/O). Confidence: **high** = any strong evidence; **medium** = weak only and score ≥ 40; **low** otherwise. Board ports veto both. | Review "open on medium / `containsTbSyntax` flag", "use evidence flags". | Implements the request literally — "syntax not meant for generating code" — without opening the split for an RTL file with an `assert`. VHDL textio is weak because ROM init from a file is a synthesizable idiom, like `$readmemh`. |
| D24 | **Simulate routing** (B4, B5): Start / tab Play on a file with a testbench unit runs that unit (`@unit` only when the file holds more than one unit) and focuses the TB pane. A remembered `topUnit` from a pane's Play wins while that unit still exists. | Review "Simulate pane routing under-specified". | Matches "Simulate should find which window the code belongs in". Changes today's behaviour only for files holding more than one unit, where today's pick was by file name. To run the board design of such a file, press Play in the RTL pane. |
| D25 | **Role-coloured pane headers**: a 3 px top accent and a tinted header strip in the role colour; the same icons appear wherever a file is listed for pairing or running. | Review "pane headers visually different", "icons in pickers". | Orientation at a glance, still never colour alone (icon + text stay). |

**Considered and not adopted (review of 1.1):**

| Suggestion | Why not |
|---|---|
| Emoji icons (🧪 / 🔧) in the view switch | Render differently per OS and font; the repo draws its own SVG icons. The switch already has icon + visible text. |
| Rule for "multiple stimulus assignments in one process" | RTL processes assign many signals too; it would add false positives, not testbenches. |
| Rule for `rising_edge(clk)` "generators" with delays | A process-style clock generator is already caught by `wait for` (strong). `rising_edge` itself is RTL. |
| Rule for any `@(posedge …)` in a portless module | `always @(posedge clk)` is normal in both; the useful case — an event wait *inside `initial`*, including `repeat (n) @(posedge clk)` — is the new `vlog-event-wait`. |
| Pair cache keyed by content hash | `findPair` runs once per click over results already cached per file content (§ 5.9); a second cache would be state without a measured need. |
| Cutting the implementation detail | The detail is what lets the spec be implemented without guessing; the ambiguity the review found is fixed by § 1.1 instead. |

---

## 4. User experience

### 4.1 Layout

The split lives in the editor column only. Explorer, Board and console keep
their existing dividers and behaviour.

```text
+----------+-+------------------------------------------------------+-+----------+
| Explorer | | counter_tb.vhd [F] | counter.vhd [C] |  +   [F TB][Both][C RTL] | | Board    |
|          | +-------------------------+-+--------------------------+ |          |
|          | | [F TB] counter_tb.vhd   | | [C RTL] counter.vhd   (?)| |          |
|          | |   < 2/3 stimulus >  (?) | |                          | |          |
|          | |                         |#|                          | |          |
|          | |  testbench code         |#|  design code             | |          |
|          | |                         |#|                          | |          |
+----------+-+-------------------------+-+--------------------------+-+----------+
| Console                                                                        |
+--------------------------------------------------------------------------------+
  [F] = flask icon (TB)   [C] = chip icon (RTL)   # = split divider   (?) = "Why?"
```

- One tab strip spans the editor column (D8). The view switch sits at its
  right end, where VS Code puts its split button.
- Each pane has a **pane header**: role icon + badge, file name, (TB pane)
  region navigator, and a "Why?" button (§ 4.4).
- The partner's tab is visible in the strip and drawn with `is-visible`
  (lighter than `is-active`), so both shown files are findable.

### 4.2 View modes

**Setting** — *Settings → Editor → Testbench split view* (radio group, stored in
`localStorage`, § 6.7):

| Value | Behaviour |
|---|---|
| **Automatic** (default) | The split opens on a pair-change event when the shown pair has a testbench with **strong** evidence or a role override (B1). Weak evidence only (medium) offers the suggestion chip (§ 4.7). |
| **Always** | Every pair is shown split; a missing side shows its empty state (§ 4.6). |
| **Never** | Never opens on its own. The view switch still works. |

**View switch** — a radio group in the tab strip:

```text
[ (F) TB ] [ (|) Both ] [ (C) RTL ]
```

Order matches the panes (TB left). Choosing a value **pins** that view for the
current pair for the rest of the session; automatic detection never overrides a
pin. *TB* or *RTL* alone shows that pane full width.

**Resolution** (pure, `resolveView`, § 6.3) — evaluated on pair-change events only (D7):

1. A pin for this pair → the pinned view.
2. *Never* → the anchor's own role (single pane).
3. *Always* → `both`.
4. *Automatic* → `both` if the pair has a testbench whose confidence is high
   (medium is enough when the event is **Simulate**); otherwise the anchor's
   role. The design side plays no part (B2).

The **anchor** is the file the event is about (the clicked tab, the run file,
the revealed file). In a single-file pair both sides are the same file and the
anchor role is `rtl`.

### 4.3 When the layout changes

| Event | What happens |
|---|---|
| Open from Explorer, click a tab, open via console diagnostic | Flush analysis for that file → find pair → resolve view → show. Partner is added to the tab strip if not open. |
| Click inside the other pane | `activeTabId` becomes that pane's file (Play icon moves with it). **Pair and view do not change.** |
| Typing | Analysis re-runs 500 ms after the last keystroke. Badges, regions and the suggestion chip update. **Layout does not change.** |
| Simulate (Start, a tab's Play, or a pane's Play) | Flush analysis for all files → pair anchored at the run file → resolve view with medium allowed → show → **focus the pane whose unit will run** (B4, B5) → run the target of § 4.10. |
| Close the partner's tab | Split collapses to the anchor; the pair is pinned single for the session (D14 b). |
| Close the anchor's tab | Existing tab-close rule picks the next active tab → that is a pair-change event. |
| Create testbench (empty state) | New file opens in the TB pane; a pair override links it to the design. |
| Window or column too narrow | See § 4.9. |

### 4.4 Pane header

```text
[F TB] counter_tb.vhd        < 2/3 stimulus >        (?)
```

- **Role colour** (D25): the header strip is tinted with the role tint and has a
  3 px top border in the role ink, so TB (violet) and RTL (teal) panes read
  apart before any label is read.
- **Run control**: the existing `SimToggle` (Play / Stop) in each pane header,
  bound to *that pane's* unit (§ 4.10). It follows `runIconFor`'s rules: while a
  run is going, only the pane running it shows Stop.
- **Role badge** (icon + text). It is a menu button:
  - *Detected: Testbench (high)* — informational, shows the confidence word.
  - *Treat as testbench* / *Treat as design* — role override for the whole file (§ 5.7).
  - *Use detection* — clears the override.
  - *Pair with another file…* — a list of same-language files of the opposite role; sets a pair override.
- **Region navigator** (TB pane only, hidden when there is one region or none):
  `<` and `>` buttons, `n/m`, and the region label. Wraps around.
- **"Why?"** opens a popover listing the evidence for the shown unit, one row
  per rule with its line number and a one-sentence explanation from
  `testbenchText.ts`, e.g.

  > **Line 21 — `wait for`** pauses for a span of simulated time. Hardware has no
  > way to wait for "25 ns" on its own, so synthesis rejects it.

  Clicking a row reveals that line. This turns detection into teaching material
  for PB1180 rather than a black box.

### 4.5 Tab strip icons

Every tab shows the flask (file role `tb` or `mixed`) or the chip (`rtl`) before
its name; tooltip *"Testbench"*, *"Design"*, or *"Design + testbench"*. A file
with no units (empty, or not yet parsed) shows the existing `FileIcon`. The
same icon precedes every file in *Pair with another file…*, *Open existing…*
and `RunTestbenchDialog` (D25).

### 4.6 Empty states

Shown in a pane whose side of the pair is missing (view *Both* or *TB*/*RTL*
pinned with nothing to show).

**TB side empty** (design with no testbench):

```text
        (F)  No testbench for counter.vhd

   [ Create testbench ]   [ Open existing... ]   [ Show design only ]
```

- *Create testbench* opens `NewFileDialog` with `suggestedName` = `<stem>_tb`
  (not `tb_<stem>`: that prefix is refused by `fileNameRules.ts`) and the
  design's language; the file lands where `folderForUpload` puts it (`vhdl/`
  or `verilog/`), opens in the TB pane and is paired by override.
- *Open existing…* is the *Pair with another file…* list.
- *Show design only* pins `rtl` for this pair.

**RTL side empty** (testbench whose DUT is not in the project — opened
automatically per D22):

```text
        (C)  counter_done is not in this project

   [ Open existing... ]   [ Show testbench only ]
```

A testbench that instantiates nothing (a self-checking testbench of functions,
say) gets the same panel with *"This testbench does not instantiate a design"*
(D22).

**TB pane with no testbench code left** (single-file pair after the student
deleted it): a one-line note above the code, *"No testbench code left in this
file."* with *[Close split]*. No automatic collapse (D7).

### 4.7 Suggestion chip

A non-modal chip in the tab strip, `role="status"`, never takes focus:

```text
(F) Testbench code found in check.vhd   [ Open split view ]  [ x ]
```

Shown when, for the current pair, the setting is *Automatic*, nothing is pinned,
the split is not open, and either the testbench has **weak evidence only**
(medium) or its first **strong** evidence appeared while typing (B3).
*Open split view* pins `both`; `x` hides the chip for this pair for the session.

### 4.8 Divider

Same look as the existing `.wb-resizer` (5 px, highlight while dragging), but
focusable. It follows the WAI-ARIA *Window Splitter* pattern with the **TB pane
as the primary pane**.

| Input | Effect |
|---|---|
| Drag | Resizes; pointer capture and `wb-is-resizing-x` exactly as `usePaneLayout.beginResize`. |
| Drag a pane below half of `SPLIT_PANE_MIN_W` | That pane snaps shut (`collapsesAt`), view pins to the other side. Dragging back out within the same drag reopens it. |
| Double-click | Resets to 50 %. |
| ← / → | Moves 2 % of the column. **Shift**: 10 %. |
| Home / End | TB pane to its minimum / maximum. |
| Enter | Collapses the TB pane (view `rtl`), focus moves to the view switch's checked radio. Choosing *Both* restores the previous fraction. |
| Release / key-up | Fraction stored in `localStorage`. |

ARIA: `role="separator"`, `tabIndex={0}`, `aria-orientation="vertical"`,
`aria-label="Resize testbench editor"`, `aria-controls` = TB pane id,
`aria-valuenow` = TB width in % (rounded), `aria-valuemin`/`aria-valuemax` = the
current bounds in %.

### 4.9 Narrow columns

Split needs `2 × SPLIT_PANE_MIN_W + SPLIT_DIVIDER_W` = **405 px** of editor
column. Below that, *Both* renders the **focused pane only**, the switch's
*Both* button is disabled with the tooltip *"Too narrow for side by side — hide
the Explorer (Ctrl+B) or the board (Ctrl+Alt+B)"*, and *TB* / *RTL* act as a
two-way toggle. The resolved view is kept, so widening the window restores the
split. The side panes are **not** squeezed to make room (`fitSidePanes`
unchanged).

### 4.10 Simulate

**What runs** (D10):

| Pressed | Runs | `RUN` sent |
|---|---|---|
| Play in the **TB pane** | The testbench unit shown there (in a mixed file, the TB unit — not the unit named like the file) | `RUN <tb file> @<tb unit>`; for a `work/` file, the `vhdl/` files plus that file (D21) |
| Play in the **RTL pane** | The design unit shown there | `RUN <design file>` — unchanged for a one-unit file; in a mixed file `RUN <file> @<design unit>`, because the backend would otherwise pick the unit named like the file, which may be the testbench (`alu_tb.v`) |
| A **tab's** Play, or **Start** | Routed (D24): the stored `topUnit` if it still exists; else the file's **testbench unit** if it has one (first in source order); else its design | `RUN <file>` for a one-unit file — unchanged; `RUN <file> @<unit>` when the file holds more than one unit |

After routing, the pane of the unit that runs gets focus and its header shows
Stop (B5). Pressing Play in a pane makes that file top **and** records its unit
(`topUnit`, § 6.6). The Simulation card shows it: *Top: alu.v › alu_tb*. The
Explorer's blue dot may now sit on a `work/` file, but only when it got there
from a TB pane; the dot's own click still offers only `vhdl/` and `verilog/`
files (`hasTopDot` unchanged).

**Sequence:**

```text
Play / Start pressed
  -> flush analysis (all files)
  -> pair anchored at the run file, view resolved with medium allowed
  -> run target routed (D24), panes shown, the running unit's pane focused,
     TB pane at its first region
  -> run check (design target only):
       board design, or portless ........................... run
       no board ports AND >= 1 testbench unit instantiates it  RunTestbenchDialog
       anything else ........................................ run as today
  -> run(files, topFile, runTarget?)
```

`RunTestbenchDialog` lists testbench **units** (file › unit), so the
single-file case works:

```text
alu.v has no board ports, so the board can't drive it.
Run it from a testbench instead?

  (o) alu_test.v > alu_test      <- best pair, preselected
  ( ) alu.v > alu_tb             <- same file, its testbench unit

[ Run testbench ]  [ Run alu.v anyway ]  [ Cancel ]
```

*Run testbench* runs the chosen unit exactly as Play in the TB pane would;
*Run … anyway* runs the design as today. `work/` testbenches are included
(D21). There is **no** "No testbench detected" dialog (D10).

**Server side** (D20, step S9):

- `protocol.ts`: `RUN` frame gains `runTarget?: string`. The header is parsed
  with `/^(.*\.(?:vhdl?|vh?))\s+@([A-Za-z_]\w*)$/i`: group 1 is the top file,
  group 2 the target. No match → the whole inline text is the top file, as
  today. `hdlClient.run` writes it the same way.
- `ghdlEngine.ts` / `portDetect.ts`: `findTopEntity(files, topFile, runTarget?)`
  uses the named entity when given; board / batch / extra-ports mode is then
  decided from **that** entity's ports, exactly as for any top. A name the top
  file does not declare fails with *"alu.vhd declares no entity alu_tb."*
- `verilog/ports.ts`: `chooseTopModule(topFileName, names, runTarget?)` returns
  `runTarget` when it is among `names`, else the same kind of error; without it,
  today's rule.
- `hdlClient.filesForRun(files, topFileName)`: a `work/` top adds that one
  file to the `vhdl/` set (D21).

### 4.11 Keyboard

| Keys | Action | Notes |
|---|---|---|
| Alt+PageDown / Alt+PageUp | Next / previous TB region | Matched on `e.code`, as Ctrl+B is. Works from either pane. |
| Tab / Shift+Tab | Reach the view switch, the pane headers and the divider | Divider is in tab order between the two panes. |
| ← / → in the view switch | Move the checked radio (roving tabindex) | Standard radio group. |
| Divider keys | § 4.8 | |

No new global shortcut toggles the split (the view switch is one Tab stop
away); see Q5.

### 4.12 Accessibility

- Panes are `<section>` with `aria-label` *"Testbench editor, counter_tb.vhd"* /
  *"Design (RTL) editor, counter.vhd"*; each textarea has the same label.
- View switch: `role="radiogroup"`, `aria-label="Editor view"`, buttons
  `role="radio"` + `aria-checked`, each with icon **and** text.
- Role badges: icon + text; never colour alone.
- Only the **focused** pane renders the diagnostics live region text, so a file
  shown twice is not announced twice.
- Suggestion chip: `role="status"`, polite, no focus steal.
- Focus hand-off on Enter-collapse follows `usePaneLayout.handOffFocus`'s pattern.
- Contrast ≥ 4.5:1 for badge text on its tint (checked in S7).

### 4.13 Visual tokens

Added to `Workbench.css` next to `--wb-rail-w`:

```css
/* Role colours: a tint for the badge, an ink for its text and icon. Distinct from
   the diagnostics' red/amber so a role is never read as a problem. */
--wb-role-tb-ink: #6d28d9;
--wb-role-tb-tint: #f3e8ff;
--wb-role-rtl-ink: #0f766e;
--wb-role-rtl-tint: #ccfbf1;
/* Pane header accent (D25): top border in the ink, strip in the tint. */
--wb-role-accent-w: 3px;
/* Same width as .wb-resizer, so the split divider looks like the other three. */
--wb-split-divider-w: 5px;
```

New icons in `icons.tsx` — `ChipIcon`, `FlaskIcon`, `SplitViewIcon` — 16×16
viewBox, `stroke="currentColor"`, `strokeWidth="1.5"`, round caps (the existing
icons' stroke style, but in `currentColor` so the badge ink colours them).

### 4.14 Text

All strings — labels, tooltips, empty states, the chip, the dialog and every
rule explanation — live in `testbenchText.ts` as named constants and small
functions (`noTestbenchFor(name)`). English only (D16).

---

## 5. Detection engine

### 5.1 Pipeline

```text
file content
  -> blank(language)            comments, strings, attributes, inactive `ifdef
                                regions -> spaces; newlines kept; pragmas recorded
  -> designUnits(blanked)       entity+architecture / module, spans, ports,
                                board ports, instances, blocks
  -> evidence(unit, rules)      every rule match: rule id, line
  -> score(unit)                presence-based sum, clamped 0..100, confidence
  -> regions(file)              TB units and their evidence-carrying blocks
analyzeProject(files)           per-file results (cached by content) + unit index
findPair(anchor, analysis, overrides, mru)
```

All stages are pure TypeScript with no React import (Verilog plan § 7 rule 4).

### 5.2 Blanking lexer — `tbDetect/blank.ts`

Output is a string of **identical length**: every character inside a comment,
string or inactive region becomes a space, newlines stay. Offsets and line
numbers in the blanked text are therefore the source's own (the
`vhdlPorts.ts` technique, extended).

```ts
export interface BlankedSource {
  /** Same length as the source; non-code characters are spaces, newlines kept. */
  readonly code: string;
  /** Lines (1-based) of translate_off..translate_on and `ifndef SYNTHESIS regions. */
  readonly simOnlyRegions: readonly LineSpan[];
}

export function blankSource(language: Language, source: string): BlankedSource;
```

**VHDL** (case-insensitive downstream):

| Construct | Rule |
|---|---|
| `-- …` | Comment to end of line. Before blanking, test it for a pragma: `--\s*(pragma\|synthesis\|synopsys)\s+translate_(off\|on)` → open/close a sim-only region. |
| `/* … */` | VHDL-2008 block comment (HDLBoard compiles with `--std=08`). May span lines. |
| `"…"` | String; `""` is an escaped quote. Bit-string literals (`x"FF"`) are blanked with it — harmless. |
| `'` | **Character literal only when** the previous non-space character is not a letter, digit, `_`, `)` or `]` **and** the character after next is `'` (`'1'`). Otherwise it is an attribute or qualified-expression tick (`clk'event`, `unsigned'(…)`) and stays code. |

**Verilog** (case-sensitive downstream):

| Construct | Rule |
|---|---|
| `// …` | Comment; pragma test as above (`synthesis translate_off`, etc.). |
| `/* … */` | Block comment. |
| `"…"` | String with `\"` escapes. |
| `(* … *)` | Attribute instance — blanked. (`(*)` in `@(*)` is not an attribute: require `(*` not followed by `)`.) |
| `` `define NAME `` / `` `undef NAME `` | Maintain an in-file define set. |
| `` `ifdef `` / `` `ifndef `` / `` `elsif `` / `` `else `` / `` `endif `` | Evaluate against the in-file defines only (an unknown macro is undefined, as with a plain `iverilog` call without `-D`). Inactive branches are blanked. An **active** `` `ifndef SYNTHESIS `` branch is recorded as a sim-only region. |

Verilog numbers such as `8'd10` need no special case: Verilog has no character
literals, so `'` is always code.

### 5.3 Design units — `tbDetect/designUnits.ts`

```ts
export interface DesignUnit {
  /** As written; VHDL comparisons are case-insensitive, Verilog's are not. */
  readonly name: string;
  readonly kind: 'entity' | 'module' | 'program';
  /** 1-based, inclusive. VHDL: from the context clause before the entity to the end of its last architecture. */
  readonly span: LineSpan;
  readonly hasPorts: boolean;
  readonly hasBoardPorts: boolean;
  /** Units this one instantiates, in source order. */
  readonly instantiates: readonly string[];
  /** process / initial / always blocks, for regions. */
  readonly blocks: readonly CodeBlock[];
}

export interface CodeBlock {
  readonly label: string;            // process label, or e.g. "initial block"
  readonly span: LineSpan;
}
```

**VHDL.** `entity <name> is` starts an entity; its header ends at the first
`end` after it. `port (` inside the header → `hasPorts`. `architecture <a> of
<name> is` belongs to that entity; it ends at the last `end …;` before the next
`entity`, `architecture`, `package` or end of file. Library and `use` clauses
belong to the **next** entity (so `use std.textio.all;` counts for the
testbench below it). Instances:

```text
<label> : entity <lib>.<name> [(<arch>)] (generic|port) map
<label> : component <name> (generic|port) map
<label> : <name> (generic|port) map
```

Blocks: `[<label> :] process … end process`.

**Verilog.** `module <name>` … `endmodule` (and SV `program` … `endprogram`).
Portless: the header is `module x;` or `module x();`, with or without a
`#( … )` parameter list. Instances: a statement in the module body of the form
`<ident> [#( … )] <ident> (` whose first word is not a keyword. Blocks:
`initial` and `always…`, the body being the following `begin … end`
(`fork … join`) with depth tracking, or the next statement up to `;`.

**Board ports.** Port names compared with HDLBoard's board-port list
(`CLOCK_50`, `SW`, `KEY_N`, `LEDR`, `HEX0_N`…`HEX5_N`, plus whatever
`server/src/engines/boardPorts.ts` lists). The client and server share no code,
so `tbDetect/boardPorts.ts` carries a *keep in step* comment, exactly as
`fileKinds.ts` does for `language.ts`.

### 5.4 Rules — `tbDetect/rules.ts`

Patterns run on blanked code. Each rule is data:

```ts
export interface DetectionRule {
  readonly id: RuleId;                 // 'vhdl-wait-for', 'vlog-delay', ...
  readonly weight: number;
  readonly strength: 'strong' | 'weak' | 'veto';
  /** Matches in one unit's blanked code; each match gives one evidence line. */
  readonly find: (unit: UnitText) => readonly number[];
  /** The "Why?" sentence, from testbenchText.ts. */
  readonly explanation: string;
}
```

Each rule also has a **class** (D23): **S** = strong, a construct with no
meaning in synthesizable code; **W** = weak, also found in RTL.

**VHDL**

| Id | Matches | Weight | Class |
|---|---|---|---|
| `vhdl-portless` | Entity has no port clause | +25 | W |
| `vhdl-wait-for` | `wait for` | +30 | S |
| `vhdl-wait-forever` | `wait;` | +20 | S |
| `vhdl-clock-gen` | `x <= not x after …` (same name both sides) | +25 | S |
| `vhdl-after` | `after` in an assignment — **excluding** the ones in a `vhdl-clock-gen` match | +10 | W |
| `vhdl-wait-until` | `wait until` / `wait on` | +10 | W |
| `vhdl-file-io` | `std.textio`, `std_logic_textio`, a `file … :` declaration | +25 | W |
| `vhdl-end-sim` | `std.env.stop` / `std.env.finish`, `use std.env`, a statement `stop;` / `finish;` | +30 | S |
| `vhdl-drives-dut` | Portless **and** instantiates a unit | +20 | S |
| `vhdl-assert` | `assert` / `report` | +5 | W |
| `vhdl-tb-name` | Unit name `tb_*`, `test_*`, `*_tb`, `*_test`, `*_testbench`, `testbench` | +15 | W |
| `vhdl-framework` | `vunit_lib`, `runner_cfg`, `osvvm` | +40 | S |
| `vhdl-sim-only` | A non-empty translate_off region inside the unit | +20 | W |
| `vhdl-board-ports` | A board port in the port clause | −50 | veto |

**Verilog**

| Id | Matches | Weight | Class |
|---|---|---|---|
| `vlog-portless` | Portless module header | +25 | W |
| `vlog-delay` | A `#` delay control **inside an `initial` or `always` block**: `#10`, `#(T/2)`, `#DELAY`, `##1` — **excluding** delays inside a `vlog-clock-gen` match | +30 | S |
| `vlog-assign-delay` | A `#` delay on a continuous assignment or net (`assign #2 y = a;`) | +10 | W |
| `vlog-clock-gen` | `always #… x = ~x;` / `forever #… x = !x;` | +25 | S |
| `vlog-event-wait` | An event control used as a statement inside `initial`: `@(posedge clk);`, `repeat (n) @(negedge clk);`, `wait (done);` | +20 | S |
| `vlog-initial` | `initial` | +5 | W |
| `vlog-display` | `$display`, `$write`, `$monitor`, `$strobe` (and their `b`/`h`/`o` variants) | +15 | W |
| `vlog-end-sim` | `$finish`, `$stop` | +30 | S |
| `vlog-file-io` | `$fopen`, `$fclose`, `$fscanf`, `$fgets`, `$fdisplay`, `$fwrite`, `$dumpfile`, `$dumpvars` | +25 | S |
| `vlog-drives-dut` | Portless **and** instantiates a module | +20 | S |
| `vlog-tb-name` | Same name patterns as VHDL (case-insensitive here) | +15 | W |
| `vlog-sv-verif` | `program`, `clocking`, `mailbox`, `semaphore`, `covergroup`, `class`, `randomize(` | +25 | S |
| `vlog-uvm` | `uvm_*` identifiers, `` `uvm_* `` macros, `import uvm_pkg` | +40 | S |
| `vlog-sim-only` | A non-empty translate_off or `` `ifndef SYNTHESIS `` region inside the unit | +20 | W |
| `vlog-assert` | SV immediate `assert` | +5 | W |
| `vlog-board-ports` | A board port in the port list | −50 | veto |

Parameter lists (`module m #(…)`) and parameter overrides
(`<module> #(…) <instance> (`) are never delays.

**Deliberately not rules:** `$readmemh` / `$readmemb` (synthesizable ROM/RAM
init), `$time`, `$random`, `timescale`, process labels such as `stim_proc`.

### 5.5 Score, confidence, role

```ts
export type Confidence = 'low' | 'medium' | 'high';
export type UnitRole = 'rtl' | 'tb';

/** Weak evidence alone makes a probable testbench from here up (D6). */
export const MEDIUM_FROM = 40;

export interface EvidenceSummary {
  readonly score: number;               // clamp(sum of distinct rule weights, 0, 100) — for "Why?"
  readonly hasStrongEvidence: boolean;  // any rule of class strong fired
  readonly vetoed: boolean;             // board ports
}

/** Each rule counts once, however many lines match it; the lines are all kept as evidence. */
export function summarize(evidence: readonly Evidence[]): EvidenceSummary;

/** D23: the class decides high, the score only separates medium from low. */
export function confidenceOf(e: EvidenceSummary): Confidence {
  if (e.vetoed) return 'low';
  if (e.hasStrongEvidence) return 'high';
  return e.score >= MEDIUM_FROM ? 'medium' : 'low';
}

/** A unit is a testbench from medium up — the bar for pairing and for the chip. */
export const roleOf = (confidence: Confidence): UnitRole => (confidence === 'low' ? 'rtl' : 'tb');
```

A file's role: `tb` if all units are `tb`, `rtl` if none are, `mixed` otherwise
(no units → `undefined`). A role override (§ 5.7) replaces every unit's role in
the file and sets confidence `high`.

### 5.6 Regions

```ts
export interface TestbenchRegion {
  readonly unitName: string;
  readonly label: string;       // block label, "clock generator", or the unit name
  readonly span: LineSpan;
}
```

For each `tb` unit, in source order: every block that contains evidence becomes
a region (VHDL concurrent clock generators become a one-line region labelled
*clock generator*). A `tb` unit with no such block contributes one region, the
unit itself. The TB pane opens at the first region; the RTL pane at the first
`rtl` unit's first line. Region navigation cycles through these.

### 5.7 Overrides

```ts
export interface TestbenchOverrides {
  /** fileId -> forced role for every unit in the file. */
  readonly roles: Readonly<Record<string, UnitRole>>;
  /** design fileId -> testbench fileId. */
  readonly pairs: Readonly<Record<string, string>>;
}
```

Overrides are the primary truth (B6): detection is the fallback for files the
user has not marked. Entries for deleted files are dropped on delete; renames
keep the id.

### 5.8 Pairing — `tbDetect/pairing.ts`

```ts
export interface EditorPair {
  readonly anchorId: string;
  readonly tb: PaneTarget | null;
  readonly rtl: PaneTarget | null;
  /** Confidence of the testbench side; 'high' when it comes from an override. */
  readonly tbConfidence: Confidence;
  /** The DUT the testbench instantiates when no file defines it (D22), else null. */
  readonly missingDut: string | null;
}
export interface PaneTarget {
  readonly fileId: string;
  readonly line: number;
  /** The unit this pane runs (the TB unit in a mixed file). */
  readonly unitName: string;
}

export function findPair(
  anchorId: string,
  analysis: ProjectAnalysis,
  overrides: TestbenchOverrides,
  recentFileIds: readonly string[], // most recently active first
): EditorPair;
```

Order of rules:

1. **Pair override** for the anchor (either direction) → use it.
2. **Self pair**: the anchor has both `rtl` and `tb` units → both sides are the
   anchor file, at their first lines.
3. Anchor is **design**: score every same-language file with a `tb` unit:

   | Evidence | Points |
   |---|---|
   | A `tb` unit instantiates a unit defined in the anchor | +100 |
   | Testbench file stem is `tb_<s>`, `<s>_tb`, `test_<s>` or `<s>_test`, where `<s>` is the anchor's file stem or one of its unit names (case-insensitive) | +50 |
   | Testbench is in `work/` | +10 |

   Keep candidates with ≥ 50. Highest wins; ties → most recently active
   (`recentFileIds`); still tied → file name, alphabetical.
4. Anchor is **testbench**: the DUT is the instantiated unit whose name matches
   the testbench name stem, else the first instantiated unit that is defined in
   the project; its file is the design side. If it instantiates units but none
   is defined in the project, `rtl` is `null` and `missingDut` names the first
   one (D22).
5. Mixed languages never pair.

The same scoring powers *Pair with another file…* (sorted candidates) and
`RunTestbenchDialog` (runnable candidates only).

### 5.9 Performance and caching

- `analyzeProject(files, previous)` reuses a file's result when its `content`
  string is identical (`===`) to the cached one; only changed files are
  re-analysed. No finer-grained incremental analysis (D13).
- Typing: `useTestbenchAnalysis` re-analyses 500 ms after the last change.
- Pair-change events call `flush()`, which analyses the changed files
  synchronously first, so a decision is never made on stale results.
- Budget, enforced by a test (§ 7.4): one 5 000-line file < 50 ms; starter
  project + all fixtures cold < 150 ms. If a future machine breaks the budget,
  `analyzeProject` moves to a Worker unchanged — it is pure and its inputs and
  outputs are structured-clone friendly.

---

## 6. Architecture and code

### 6.1 Module map

New, **pure** (no React):

| File | Responsibility |
|---|---|
| `workbench/tbDetect/blank.ts` | § 5.2 blanking lexer, both languages |
| `workbench/tbDetect/designUnits.ts` | § 5.3 units, ports, instances, blocks |
| `workbench/tbDetect/boardPorts.ts` | Board-port names (keep in step with the server) |
| `workbench/tbDetect/rules.ts` | § 5.4 rule tables |
| `workbench/tbDetect/score.ts` | § 5.5 score, confidence, role |
| `workbench/tbDetect/regions.ts` | § 5.6 |
| `workbench/tbDetect/pairing.ts` | § 5.8 |
| `workbench/tbDetect/analyzeProject.ts` | Glue + cache; the module's only public entry besides `findPair` |
| `workbench/tbDetect/index.ts` | Barrel |
| `workbench/editorView.ts` | `resolveView`, `pairKey`, suggestion visibility |
| `workbench/editorSplit.ts` | Fraction bounds, key steps, `canSplit`, storage parse/load/save |
| `workbench/testbenchText.ts` | All strings (D16) |

New, **React**:

| File | Responsibility |
|---|---|
| `useTestbenchAnalysis.ts` | Debounced analysis + `flush()` |
| `useEditorSplit.ts` | Fraction state, divider pointer/keyboard handlers, persistence |
| `EditorTabStrip.tsx` | Tab strip extracted from `CodeEditor` (+ role icons, `is-visible`) |
| `EditorSurface.tsx` | Gutter + `<pre>` + `<textarea>` extracted from `CodeEditor` |
| `SplitEditor.tsx` | Two surfaces, divider, narrow fallback |
| `EditorPaneHeader.tsx` | Badge menu, region navigator, "Why?" |
| `ViewSwitch.tsx` | Radio group |
| `TestbenchEmptyState.tsx`, `TestbenchSuggestion.tsx`, `EvidencePopover.tsx`, `RunTestbenchDialog.tsx` | § 4.6, 4.7, 4.4, 4.10 |
| `SplitEditor.css` | Grid, divider focus ring, badges |

Changed: `CodeEditor.tsx` (composes strip + 1 or 2 surfaces), `Workbench.tsx`
(state + events), `hdlClient.ts` (`run(files, topFile, runTarget?)`,
`filesForRun` for a `work/` top), `SimulationCard.tsx` (shows the unit),
server `protocol.ts`, `portDetect.ts`/`ghdlEngine.ts`, `verilog/ports.ts` and
`verilogEngine.ts` (D20), `useRevealLine.ts` (`focus` option), `icons.tsx`,
`SettingsDialog.tsx`, `desktop.ts` (`Workspace.testbench`), `Workbench.css`
(tokens), `index.ts` (barrel), `README.md`, `Design_Description.md` § 9,
`changelog.txt`.

### 6.2 Core types

```ts
export interface FileAnalysis {
  readonly fileId: string;
  /** The content this result was computed from — the cache key. */
  readonly content: string;
  readonly language: Language;
  readonly units: readonly AnalyzedUnit[];
  readonly role: 'rtl' | 'tb' | 'mixed' | undefined;
  readonly regions: readonly TestbenchRegion[];
}

export interface AnalyzedUnit extends DesignUnit {
  readonly evidence: readonly Evidence[];
  readonly summary: EvidenceSummary;    // score, hasStrongEvidence, vetoed
  readonly confidence: Confidence;
  readonly role: UnitRole;
}

export interface Evidence { readonly ruleId: RuleId; readonly line: number; }

export interface ProjectAnalysis {
  readonly byFile: ReadonlyMap<string, FileAnalysis>;
  /** Unit name (lower case for VHDL) -> defining file id, per language. */
  readonly unitIndex: Readonly<Record<Language, ReadonlyMap<string, string>>>;
}
```

### 6.3 View logic — `editorView.ts`

```ts
export type SplitPreference = 'auto' | 'always' | 'never';
export type EditorView = 'tb' | 'both' | 'rtl';
export type PairEvent = 'open' | 'run';

export function pairKey(pair: EditorPair): string {
  return `${pair.tb?.fileId ?? '-'}|${pair.rtl?.fileId ?? '-'}`;
}

export function resolveView(
  pair: EditorPair,
  preference: SplitPreference,
  pinned: EditorView | undefined,
  event: PairEvent,
): EditorView {
  if (pinned) return pinned;
  const anchorView = anchorRoleView(pair); // 'tb' when the anchor is the TB side alone, else 'rtl'
  if (preference === 'never') return anchorView;
  if (preference === 'always') return 'both';
  const enough = event === 'run' ? pair.tbConfidence !== 'low' : pair.tbConfidence === 'high';
  return pair.tb && enough ? 'both' : anchorView; // B1, B2: the design side never decides
}
```

### 6.4 Split geometry — `editorSplit.ts`

```ts
import { EDITOR_MIN_W, collapsesAt } from './paneLayout';

/** Each half must stay as usable as the editor alone. */
export const SPLIT_PANE_MIN_W = EDITOR_MIN_W;
export const SPLIT_DIVIDER_W = 5;           // = --wb-split-divider-w
export const SPLIT_DEFAULT_TB_FRACTION = 0.5;
export const SPLIT_KEY_STEP = 0.02;
export const SPLIT_KEY_STEP_LARGE = 0.1;

export const canSplit = (columnWidth: number): boolean =>
  columnWidth >= 2 * SPLIT_PANE_MIN_W + SPLIT_DIVIDER_W;

export interface FractionBounds { readonly min: number; readonly max: number; }
export function fractionBounds(columnWidth: number): FractionBounds;

/** A key on the focused divider: the new fraction, 'collapse' (Enter), or undefined (not ours). */
export function fractionForKey(
  key: string, shift: boolean, current: number, bounds: FractionBounds,
): number | 'collapse' | undefined;

export interface EditorSplitPrefs { readonly tbFraction: number; readonly preference: SplitPreference; }
const STORAGE_KEY = 'hdlboard.editorSplit.v1';
export function parseEditorSplitPrefs(json: string | null, defaults: EditorSplitPrefs): EditorSplitPrefs;
export function loadEditorSplitPrefs(defaults: EditorSplitPrefs): EditorSplitPrefs;
export function saveEditorSplitPrefs(prefs: EditorSplitPrefs): void;
```

Drag collapse uses `collapsesAt(paneWidth, SPLIT_PANE_MIN_W)` for whichever pane
is shrinking — the same rule as the side panes.

### 6.5 Rendering

```tsx
// SplitEditor.tsx (shape, not final code)
<div
  className={cx('wb-split', `is-${shownView}`)}
  data-editor-view={shownView}
  data-focused-pane={focusedPane}
  style={{ '--wb-split-tb': `${tbFraction}fr`, '--wb-split-rtl': `${1 - tbFraction}fr` } as CSSProperties}
>
  {showsTb && <EditorPane role="tb" ... />}
  {shownView === 'both' && (
    <div
      className="wb-resizer wb-split__divider"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={TEXT.resizeTestbenchEditor}
      aria-controls={TB_PANE_ID}
      aria-valuenow={Math.round(tbFraction * 100)}
      aria-valuemin={Math.round(bounds.min * 100)}
      aria-valuemax={Math.round(bounds.max * 100)}
      onPointerDown={split.onDividerPointerDown}
      onKeyDown={split.onDividerKeyDown}
      onDoubleClick={split.resetFraction}
    />
  )}
  {showsRtl && <EditorPane role="rtl" ... />}
</div>
```

```css
/* SplitEditor.css */
.wb-split.is-both {
  display: grid;
  grid-template-columns:
    minmax(0, var(--wb-split-tb)) var(--wb-split-divider-w) minmax(0, var(--wb-split-rtl));
}
.wb-split__divider:focus-visible { outline: 2px solid var(--wb-focus-ring, #2563eb); outline-offset: -1px; }
```

`shownView` is the resolved view, narrowed to the focused pane when
`!canSplit(columnWidth)` (§ 4.9). Column width comes from a `ResizeObserver` on
`.wb-split`, as `usePaneLayout` measures `.wb-body`.

**`CodeEditor` refactor (S6).** `CodeEditor` keeps its exported name and props
and gains:

```ts
export interface CodeEditorSplitProps {
  view: EditorView;
  pair: EditorPair;
  focusedPane: 'tb' | 'rtl';
  onFocusPane: (pane: 'tb' | 'rtl') => void;
  tbFraction: number;
  // divider handlers, header callbacks ...
}
// CodeEditorProps gains: split?: CodeEditorSplitProps
```

Without `split` it renders exactly as today (strip + one surface), which keeps
the existing tests and `ComponentGallery` unchanged.

**Same file in both panes.** Both `EditorSurface`s receive the same `content`
and call the same `onChange(id, …)`. Each owns its scroll and caret. An edit in
one pane re-renders the other; that textarea loses its native undo history
(the browser clears it when `value` is set from script). Accepted: undo still
works in the pane being typed in. Diagnostics markers show in both.

**Reveal without focus.** `RevealRequest` gains `focus?: boolean` (default
`true`, today's behaviour). Initial placement of the non-anchor pane uses
`focus: false`, so opening a pair never moves the caret out of the pane the
student clicked.

### 6.6 Workbench integration

New state in `Workbench.tsx`:

```ts
const analysis = useTestbenchAnalysis(files);              // { current, flush }
const split = useEditorSplit();                             // prefs, fraction, handlers
const [overrides, setOverrides] = useState<TestbenchOverrides>(EMPTY_OVERRIDES);
const [display, setDisplay] = useState<EditorDisplay | null>(null); // { pair, view, focusedPane }
const pinnedViews = useRef(new Map<string, EditorView>());          // session
const dismissedSuggestions = useRef(new Set<string>());             // session
const recentFileIds = useRef<string[]>([]);                          // MRU, session
```

One function owns every pair change:

```ts
/** Shows `fileId` and its partner; the only place the layout is decided (D7). */
const showFile = (fileId: string, event: PairEvent) => {
  const project = analysis.flush();
  const pair = findPair(fileId, project, overrides, recentFileIds.current);
  const view = resolveView(pair, split.prefs.preference, pinnedViews.current.get(pairKey(pair)), event);
  openTabsFor(pair);                  // partner joins the tab strip
  setActiveTabId(fileId);
  setDisplay({ pair, view, focusedPane: paneOf(pair, fileId) });
  revealPair(pair, fileId);           // anchor focused, partner with focus: false
};
```

`handleOpenFile`, tab clicks, `openConsoleDiagnostic` and the reveal paths call
`showFile(id, 'open')`. `handleStart`, `handleRunFile` and the new
`handleRunPane(pane)` call `showFile(id, 'run')` and then `checkRun` (§ 4.10)
before `startRun`. Focusing the other pane calls `setActiveTabId(paneFileId)`
only.

The run target joins the top-file state:

```ts
const [topUnit, setTopUnit] = useState<string | null>(null); // D20; null = backend chooses, as today

/** Play in a pane header: that file becomes top, with the pane's unit when the backend needs telling. */
const handleRunPane = (pane: 'tb' | 'rtl') => {
  const target = pane === 'tb' ? display?.pair.tb : display?.pair.rtl;
  if (!target || isSimulating) return;
  setTopFileId(target.fileId);
  setTopUnit(runTargetFor(target, analysis.current)); // null for a one-unit design file
  startRun(target.fileId, runTargetFor(target, analysis.current));
};
```

Start and a tab's Play go through one pure router (D24):

```ts
/** B4: which unit a Start or tab Play runs, and which pane gets focus. */
export function routeRun(
  file: FileAnalysis,
  topUnit: string | null,
): { readonly unitName: string; readonly pane: 'tb' | 'rtl'; readonly runTarget: string | null };
// topUnit still declared in file -> that unit; else first tb unit; else first rtl unit.
// runTarget is null when the file declares a single unit (B7).
```

`runTargetFor` (pure, `editorView.ts`) returns the pane's `unitName` when the
file declares more than one unit or the pane is the TB pane, and `null`
otherwise — so a plain design run sends exactly what it sends today.
Marking a file top from the Explorer, renaming the top unit away, or deleting
the top file clears `topUnit`.

### 6.7 Persistence

| What | Where | Key / field |
|---|---|---|
| TB fraction, split preference | `localStorage`, both builds | `hdlboard.editorSplit.v1` → `{ tbFraction, preference }`, parsed defensively like `parsePaneLayout` |
| Run target | Desktop `Workspace` | New optional field `topUnit?: string`, kept only if `topFileId` is kept. |
| Role and pair overrides | Desktop `Workspace` | New optional field `testbench?: TestbenchOverrides`. `WORKSPACE_VERSION` stays 1: a missing field reads as empty, and an older app ignores it. Validate ids against `files` like `topFileId`. |
| Same, in the browser | Session only | (The browser build stores no project today.) |
| Pins, dismissed chips, MRU, last region | Session only | — |

### 6.8 Observable state for the rest of the IDE

There is no event bus in HDLBoard and none is added (no consumer = dead code).
What other features can rely on:

- **DOM**: `.wb-split[data-editor-view="tb|both|rtl"][data-focused-pane="tb|rtl"]`
  — for CSS and for the e2e scripts.
- **Barrel exports**: `analyzeProject`, `findPair`, `resolveView`,
  `pairKey` and their types, so the waveform panel or the 74xxBoard merge can
  ask "which testbench drives this design?" without touching React.
- **State**: `display` (pair, view, focused pane) lives in `Workbench` like all
  other state; a future component receives it as props.

---

## 7. Test plan and fixtures

### 7.1 Fixtures with known scores

Location: `tests/fixtures/tbdetect/{vhdl,verilog}/`. The golden test
(`tbDetect/fixtures.golden.test.ts`) asserts, per unit, the **rule ids**, the
**score**, whether strong evidence fired, and the **confidence**; per file the
role; per project the pairs. Strong rules are marked ★.

| Fixture | Unit | Rules fired | Raw | Score | Confidence |
|---|---|---|---|---|---|
| `vhdl/counter.vhd` | counter | — | 0 | 0 | low |
| `vhdl/counter_tb.vhd` | counter_tb | portless 25, tb-name 15, drives-dut★ 20, clock-gen★ 25, wait-for★ 30, assert 5, end-sim★ 30, wait-forever★ 20 | 170 | 100 | high |
| `vhdl/alu_with_tb.vhd` | alu | — | 0 | 0 | low |
| | alu_tb | portless 25, tb-name 15, drives-dut★ 20, wait-for★ 30, assert 5, wait-forever★ 20 | 115 | 100 | high |
| `vhdl/sync_reg.vhd` | sync_reg | assert 5, wait-until 10, after 10 | 25 | 25 | low |
| `vhdl/de1_soc_stray.vhd` | DE1_SoC | after 10, board-ports (veto) −50 | −40 | 0 | low |
| `vhdl/check.vhd` | check | portless 25, drives-dut★ 20, wait-until 10 | 55 | 55 | high |
| `vhdl/skeleton_tb.vhd` | skeleton_tb | portless 25, tb-name 15, assert 5 | 45 | 45 | **medium** |
| `vhdl/edge_detect_traps.vhd` | edge_detect | — | 0 | 0 | low |
| `vhdl/fifo_ctrl_guarded.vhd` | fifo_ctrl | sim-only 20, assert 5 | 25 | 25 | low |
| `verilog/counter8.v` | counter8 | initial 5 | 5 | 5 | low |
| `verilog/counter8_tb.v` | counter8_tb | portless 25, tb-name 15, drives-dut★ 20, clock-gen★ 25, delay★ 30, initial 5, display 15, end-sim★ 30 | 165 | 100 | high |
| `verilog/top_param.v` | top | — | 0 | 0 | low |
| `verilog/check.v` | check | portless 25, drives-dut★ 20, initial 5 | 50 | 50 | high |
| `verilog/skeleton_tb.v` | skeleton_tb | portless 25, tb-name 15, initial 5, display 15 | 60 | 60 | **medium** |
| `verilog/handshake_tb.v` | handshake_tb | portless 25, tb-name 15, drives-dut★ 20, clock-gen★ 25, initial 5, event-wait★ 20, display 15 | 125 | 100 | high |
| `verilog/blinker_traps.v` | blinker | — | 0 | 0 | low |
| `verilog/fifo_ctrl_guarded.v` | fifo_ctrl | sim-only 20, display 15 | 35 | 35 | low |
| `verilog/alu_tb.v` | alu | — | 0 | 0 | low |
| | alu_tb | portless 25, tb-name 15, drives-dut★ 20, delay★ 30, initial 5, display 15, end-sim★ 30 | 140 | 100 | high |
| `verilog/de1_soc_stray.v` | DE1_SoC | assign-delay 10, board-ports (veto) −50 | −40 | 0 | low |

Pairing projects (`tbDetect/pairing.test.ts`):

| Id | Files | Anchor | Expected |
|---|---|---|---|
| P-1 | `vhdl/counter.vhd`, `vhdl/counter_tb.vhd` | counter.vhd | counter_tb.vhd (100 + 50 = 150) |
| P-1b | `vhdl/counter.vhd`, legacy `work/tb_counter.vhd` (same content) | counter.vhd | tb_counter.vhd (100 + 50 + 10 = 160) |
| P-2 | `verilog/alu.v`, `verilog/alu_test.v` (instantiates alu), `verilog/alu_tb_old.v` (instantiates alu) | alu.v | alu_test.v (150 vs 100) |
| P-3 | `verilog/alu.v`, `verilog/test_alu.v`, `verilog/alu_tb.v` (both instantiate alu) | alu.v, MRU empty | alu_tb.v (tie → alphabetical) |
| P-3b | as P-3, MRU = [test_alu.v] | alu.v | test_alu.v (tie → MRU) |
| P-4 | `vhdl/counter.vhd`, `verilog/counter_tb.v` | counter.vhd | no TB (languages differ) |
| P-5 | `vhdl/counter_tb.vhd` alone | counter_tb.vhd | RTL side `null`, `missingDut` = `counter`; Automatic view = `both`, RTL empty state "counter is not in this project" (D22) |
| P-6 | `vhdl/alu_with_tb.vhd` | alu_with_tb.vhd | self pair, TB at alu_tb's first region, RTL at line of `entity alu` |
| P-7 | P-2 + pair override alu.v → alu_tb_old.v | alu.v | alu_tb_old.v |
| P-8 | `vhdl/selftest.vhd`: portless, `wait for`, `assert`, instantiates nothing | selftest.vhd | RTL `null`, `missingDut` `null`; Automatic view = `both`, RTL empty state "does not instantiate a design" (D22) |
| P-9 | `vhdl/skeleton_tb.vhd` (medium) | skeleton_tb.vhd | Automatic, open: single TB pane + suggestion chip; Simulate: `both` |

Run-target cases (`runTarget.test.ts`, client; `runTarget` tests in the server):

| Id | Situation | Expected `RUN` |
|---|---|---|
| R-1 | Play in RTL pane, `vhdl/counter.vhd` (one unit) | `RUN counter.vhd`, files = `vhdl/*` — identical to today |
| R-2 | Play in TB pane, `vhdl/alu_with_tb.vhd` | `RUN alu_with_tb.vhd @alu_tb` → GHDL batch run of `alu_tb` |
| R-3 | Play in RTL pane, `verilog/alu_tb.v` | `RUN alu_tb.v @alu` (would otherwise run `alu_tb`) |
| R-4 | Play in TB pane, legacy `work/tb_counter.vhd` | `RUN tb_counter.vhd @counter_tb`, files = `vhdl/*` + `work/tb_counter.vhd` (D21) |
| R-5 | Start after R-2, nothing changed | Same as R-2 (`topUnit` remembered) |
| R-6 | Server, `RUN alu.vhd @nosuch` | Compile fails with "alu.vhd declares no entity nosuch." |
| R-7 | Server, no `@` target, including a file name with a space (`RUN my alu.vhd`) | Today's `findTopEntity` / `chooseTopModule` result, unchanged |
| R-8 | Tab Play on `vhdl/alu_with_tb.vhd`, no `topUnit` | `RUN alu_with_tb.vhd @alu_tb`; TB pane focused, shows Stop (D24) |
| R-9 | Start with top `vhdl/counter_tb.vhd` (one unit) | `RUN counter_tb.vhd` — unchanged; split shows counter.vhd right; TB pane focused |
| R-10 | Tab Play on `vhdl/counter.vhd` with `counter_tb.vhd` in the project | `RUN counter.vhd` — unchanged (B7); split shown; RTL pane focused |

#### Fixture sources

`vhdl/counter.vhd`

```vhdl
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
  port (
    clk   : in  std_logic;
    reset : in  std_logic;
    q     : out unsigned(7 downto 0)
  );
end entity;

architecture rtl of counter is
  signal count : unsigned(7 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if reset = '1' then
        count <= (others => '0');
      else
        count <= count + 1;
      end if;
    end if;
  end process;
  q <= count;
end architecture;
```

`vhdl/counter_tb.vhd` (also, as legacy `work/tb_counter.vhd`, in P-1b and R-4)

```vhdl
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter_tb is
end entity;

architecture sim of counter_tb is
  signal clk   : std_logic := '0';
  signal reset : std_logic := '1';
  signal q     : unsigned(7 downto 0);
begin
  dut : entity work.counter
    port map (clk => clk, reset => reset, q => q);

  clk <= not clk after 10 ns;

  stimulus : process
  begin
    wait for 25 ns;
    reset <= '0';
    wait for 200 ns;
    assert q = 10 report "count should be 10" severity error;
    std.env.stop;
    wait;
  end process;
end architecture;
```

`vhdl/alu_with_tb.vhd`

```vhdl
library ieee;
use ieee.std_logic_1164.all;

entity alu is
  port (
    a, b : in  std_logic;
    op   : in  std_logic;
    y    : out std_logic
  );
end entity;

architecture rtl of alu is
begin
  y <= (a and b) when op = '0' else (a or b);
end architecture;

library ieee;
use ieee.std_logic_1164.all;

entity alu_tb is
end entity;

architecture sim of alu_tb is
  signal a, b, op, y : std_logic := '0';
begin
  dut : entity work.alu port map (a => a, b => b, op => op, y => y);

  process
  begin
    a <= '1'; b <= '1'; op <= '0';
    wait for 10 ns;
    assert y = '1' report "and failed" severity error;
    wait;
  end process;
end architecture;
```

`vhdl/sync_reg.vhd` — synthesizable constructs that must not tip the score

```vhdl
library ieee;
use ieee.std_logic_1164.all;

entity sync_reg is
  generic (WIDTH : positive);
  port (
    clk : in  std_logic;
    d   : in  std_logic_vector(WIDTH - 1 downto 0);
    q   : out std_logic_vector(WIDTH - 1 downto 0)
  );
end entity;

architecture rtl of sync_reg is
begin
  assert WIDTH <= 32 report "WIDTH too large" severity failure;

  process
  begin
    wait until rising_edge(clk);
    q <= d after 1 ns;
  end process;
end architecture;
```

`vhdl/de1_soc_stray.vhd`

```vhdl
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
  LEDR <= SW after 2 ns;
end architecture;
```

`vhdl/check.vhd` — high from one strong rule only (drives-dut), no names or delays

```vhdl
library ieee;
use ieee.std_logic_1164.all;

entity check is
end entity;

architecture sim of check is
  signal clk, done : std_logic := '0';
begin
  dut : entity work.counter_done port map (clk => clk, done => done);

  process
  begin
    wait until done = '1';
  end process;
end architecture;
```

`vhdl/skeleton_tb.vhd` — medium: weak evidence only (a testbench being started)

```vhdl
entity skeleton_tb is
end entity;

architecture sim of skeleton_tb is
begin
  assert false report "stimulus not written yet" severity note;
end architecture;
```

`vhdl/edge_detect_traps.vhd` — comments, strings, block comments, ticks

```vhdl
library ieee;
use ieee.std_logic_1164.all;

-- clk <= not clk after 5 ns;   (old testbench line, kept as a note)
entity edge_detect is
  port (
    clk  : in  std_logic;
    sig  : in  std_logic;
    rise : out std_logic
  );
end entity;

architecture rtl of edge_detect is
  signal last : std_logic := '0';
  constant NOTE : string := "wait for 10 ns";
begin
  /* wait for 10 ns; */
  process (clk)
  begin
    if clk'event and clk = '1' then
      rise <= sig and not last;
      last <= sig;
    end if;
  end process;
end architecture;
```

`vhdl/fifo_ctrl_guarded.vhd`

```vhdl
library ieee;
use ieee.std_logic_1164.all;

entity fifo_ctrl is
  port (
    clk, push, full : in  std_logic;
    overflow        : out std_logic
  );
end entity;

architecture rtl of fifo_ctrl is
begin
  overflow <= push and full;

  -- synthesis translate_off
  process (clk)
  begin
    if rising_edge(clk) then
      assert not (push = '1' and full = '1') report "push while full" severity warning;
    end if;
  end process;
  -- synthesis translate_on
end architecture;
```

`verilog/counter8.v` — `$readmemh` must score 0

```verilog
module counter8 (
    input  wire       clk,
    input  wire       reset,
    output reg  [7:0] q
);
    reg [7:0] init_rom [0:0];

    initial $readmemh("counter_init.hex", init_rom);

    always @(posedge clk)
        if (reset) q <= init_rom[0];
        else       q <= q + 8'd1;
endmodule
```

`verilog/counter8_tb.v`

```verilog
`timescale 1ns / 1ps
module counter8_tb;
    reg        clk = 1'b0;
    reg        reset = 1'b1;
    wire [7:0] q;

    counter8 dut (.clk(clk), .reset(reset), .q(q));

    always #5 clk = ~clk;

    initial begin
        #12 reset = 1'b0;
        #100;
        if (q !== 8'd10) $display("FAIL q=%0d", q);
        else             $display("PASS");
        $finish;
    end
endmodule
```

`verilog/top_param.v` — `#(` parameter lists are not delays

```verilog
module top #(parameter W = 8) (
    input  wire         clk,
    output wire [W-1:0] q
);
    counter #(.W(W)) u_count (.clk(clk), .q(q));
    counter #(4)     u_small (.clk(clk), .q());
endmodule
```

`verilog/check.v` — high from drives-dut alone

```verilog
module check;
    reg  a = 1'b0;
    wire y;

    inverter u_inv (.a(a), .y(y));

    initial begin
        a = 1'b1;
    end
endmodule
```

`verilog/skeleton_tb.v` — medium: weak evidence only

```verilog
module skeleton_tb;
    initial $display("stimulus not written yet");
endmodule
```

`verilog/handshake_tb.v` — event waits inside `initial` (`vlog-event-wait`)

```verilog
module handshake_tb;
    reg  clk = 1'b0, start = 1'b0;
    wire done;

    always #5 clk = ~clk;

    handshake dut (.clk(clk), .start(start), .done(done));

    initial begin
        repeat (3) @(posedge clk);
        start = 1'b1;
        @(posedge done);
        $display("done");
    end
endmodule
```

`verilog/blinker_traps.v` — comments, strings, inactive `ifdef

```verilog
module blinker (
    input  wire clk,
    output reg  led
);
    // #10 $display("old debug"); $finish;
    /* always #5 clk = ~clk; */
    localparam [8*12-1:0] MSG = "#5 $finish";
`ifdef NEVER_DEFINED
    initial $finish;
`endif
    always @(posedge clk) led <= ~led;
endmodule
```

`verilog/fifo_ctrl_guarded.v`

```verilog
module fifo_ctrl (
    input  wire clk,
    input  wire push,
    input  wire full,
    output wire overflow
);
    assign overflow = push & full;
`ifndef SYNTHESIS
    always @(posedge clk)
        if (push && full) $display("push while full at %0t", $time);
`endif
endmodule
```

`verilog/alu_tb.v` — single file named after its testbench; used by R-3

```verilog
module alu (input wire a, input wire b, input wire op, output wire y);
    assign y = op ? (a | b) : (a & b);
endmodule

module alu_tb;
    reg a = 1'b0, b = 1'b0, op = 1'b0;
    wire y;

    alu dut (.a(a), .b(b), .op(op), .y(y));

    initial begin
        a = 1'b1; b = 1'b1;
        #10 $display("y=%b", y);
        $finish;
    end
endmodule
```

`verilog/de1_soc_stray.v`

```verilog
module DE1_SoC (
    input  wire [9:0] SW,
    output wire [9:0] LEDR
);
    assign #2 LEDR = SW;
endmodule
```

Every fixture whose instances resolve inside the fixture set (all except
`check.vhd`, `check.v`, `top_param.v` and `handshake_tb.v`, which deliberately
name units that do not exist) must also compile clean with the bundled GHDL (`-a --std=08`, in
dependency order) and Icarus (`-Wall`), checked once by the existing
compile-every-fixture step, so the detector is tested on real HDL.

### 7.2 Unit tests

| Module | What is tested |
|---|---|
| `blank.test.ts` | Length and newline preservation; every row of § 5.2 both ways (blanked / kept); `clk'event` vs `'1'`; `@(*)` vs `(* attr *)`; nested `` `ifdef ``; `` `define `` then `` `ifdef ``; pragma regions' line spans. |
| `designUnits.test.ts` | Spans, `hasPorts`, `hasBoardPorts`, instances (all three VHDL forms, Verilog with/without `#(…)`), blocks, context clause attachment. |
| `rules.test.ts` | One positive and one negative snippet per rule id and its class; the exclusions (clock-gen vs after/delay; `#(` forms; `assign #2` is `vlog-assign-delay`, not `vlog-delay`; `@(posedge clk)` in `always` is not `vlog-event-wait`). |
| `score.test.ts` | Clamp, once-per-rule, `confidenceOf`: strong → high at any score, weak 39/40, veto beats strong. |
| `fixtures.golden.test.ts` | § 7.1 table. |
| `pairing.test.ts` | P-1…P-9. |
| `editorView.test.ts` | `resolveView` truth table (3 preferences × pinned/unpinned × confidence × event × design side present / `missingDut` / none); `runTargetFor`. |
| `runTarget.test.ts` | R-1…R-5 and R-8…R-10 against `routeRun`, `filesForRun` and the `RUN` header `hdlClient` builds. |
| server `protocol.test.ts`, `portDetect`/`ports` tests | Header with and without an `@` target, and a file name containing a space; R-6, R-7; board/batch mode decided from the named unit. |
| `editorSplit.test.ts` | Bounds, `canSplit` at 404/405 px, every key of § 4.8, storage parse fallbacks. |

### 7.3 End-to-end script

`tests/e2e/split-screen.md`, in the format of the existing e2e scripts: open
P-1 and see TB left / RTL right; type a `wait for` into a fresh file and see
the chip, not a layout change; Simulate the same file and see the split;
narrow the window; keyboard-only pass through switch, divider and region
navigator; desktop restart keeps fraction, preference and overrides.

### 7.4 Performance budget

`tbDetect/performance.test.ts` builds a 5 000-line VHDL and a 5 000-line
Verilog file by repeating fixtures and asserts `analyzeProject` < 50 ms each,
and < 150 ms for the starter project plus all fixtures from a cold cache.
Generous on purpose: a CI box must not flake.

---

## 8. Implementation steps

Each step ends with `npm run typecheck` and `npm test` clean.

| Step | Work | Done when |
|---|---|---|
| **S1** | `blank.ts` | `blank.test.ts` green, including all trap fixtures. |
| **S2** | `designUnits.ts`, `boardPorts.ts` | `designUnits.test.ts` green. |
| **S3** | `rules.ts`, `score.ts`, fixtures + golden test, `testbenchText.ts` explanations | § 7.1 table reproduced exactly. |
| **S4** | `regions.ts`, `pairing.ts`, `analyzeProject.ts` (+ cache), perf test | P-1…P-9 and § 7.4 green. |
| **S5** | `editorView.ts`, `editorSplit.ts` | Truth-table and key tests green. |
| **S6** | Extract `EditorTabStrip` + `EditorSurface` from `CodeEditor`; `useRevealLine` `focus` option. **No behaviour change.** | Existing tests green; gallery and Workbench look identical. |
| **S7** | `SplitEditor`, `useEditorSplit`, `EditorPaneHeader`, `ViewSwitch`, icons, tokens, empty states | Split works from the switch alone (no detection wired yet); § 4.8 and § 4.12 verified by hand. |
| **S8** | Workbench wiring: `useTestbenchAnalysis`, `showFile`, partner tabs, chip, overrides, setting in `SettingsDialog`, workspace field | AC-3, AC-4, AC-9…AC-15, AC-21. |
| **S9a** | Server: `runTarget` in `protocol.ts`, `findTopEntity`, `chooseTopModule`; error for an undeclared unit | R-6, R-7 green; every existing server test unchanged. |
| **S9b** | Client: `hdlClient.run(…, runTarget?)`, `filesForRun` for `work/`, `topUnit` state + workspace field, pane Play, `checkRun`, `RunTestbenchDialog`, Simulation card label | AC-5…AC-8, AC-22…AC-24; R-1…R-10 green. |
| **S10** | Region navigator, Alt+PageUp/PageDown, "Why?" popover; docs (README *Components* + *Layout*, `Design_Description.md` § 9, `changelog.txt`) | AC-16, AC-17; e2e script passes. |

---

## 9. Acceptance criteria

The feature is complete when **all** of the following hold.

**Detection**

- **AC-1** Every fixture in § 7.1 yields exactly the listed rule ids, strong
  flag, score and confidence; every pairing project yields the listed pair.
- **AC-2** Text in comments, strings, attributes and inactive `` `ifdef ``
  branches never produces evidence (trap fixtures score 0).
- **AC-18** § 7.4 budgets hold; no analysis runs per keystroke (verified by a
  test that 20 rapid `onChange` calls produce one analysis).

**Layout**

- **AC-3** With *Automatic*: opening `counter.vhd` in P-1 shows TB
  (`counter_tb.vhd`) left and RTL right, each at its first region/unit;
  opening a file with no testbench shows a single pane.
- **AC-4** Typing never changes the layout. Typing a high-confidence testbench
  into a new file shows the suggestion chip ≈ 500 ms after typing stops.
- **AC-9** In a single-file pair, an edit in either pane appears in the other
  at once; each pane keeps its own scroll and caret; diagnostics show in both;
  the live region speaks once.
- **AC-10** Divider: drag, snap-collapse, double-click reset to 50 %, ←/→ 2 %,
  Shift 10 %, Home/End, Enter collapse/restore; `aria-valuenow` follows; a
  visible focus ring; the fraction survives a reload.
- **AC-11** The view switch is a keyboard-operable radio group; a choice pins
  the view for that pair for the session and detection never overrides it.
- **AC-13** Below 405 px of editor column the split shows one pane, the switch
  toggles TB/RTL, the page never scrolls sideways, and widening restores both.
- **AC-14** Empty states appear as in § 4.6 and every action works
  (*Create testbench* creates `<stem>_tb` in the right folder, opens it in the
  TB pane, paired).
- **AC-15** Closing the partner's tab collapses the split and it stays
  collapsed for that pair until the session ends or the user picks *Both*.
- **AC-21** With *Never*, nothing opens on its own (open or Simulate); the
  switch still works. With *Always*, every pair is split.

**Simulate**

- **AC-5** Pressing Start or any Play arranges the pair before compiling
  starts; medium confidence is enough on this path.
- **AC-6** A run of a one-unit design file (Start, a tab's Play, or the RTL
  pane's Play) sends a `RUN` byte-identical to the feature being off — same
  files, same header, no `@` target (test spies on `getClient().run`).
- **AC-7** Starting a board design that has no testbench shows no dialog.
- **AC-8** Starting a design without board ports that a testbench unit
  instantiates shows `RunTestbenchDialog` listing file › unit; each button does
  what § 4.10 says, including the same-file testbench of a mixed file.
- **AC-22** Play in the TB pane runs the unit shown there, for every case
  R-2…R-5: a mixed file's testbench, a `work/` testbench, and Start afterwards.
  The console shows that testbench's own output (`report` / `$display`).
- **AC-23** Any unit with strong evidence opens the split whatever its design
  side: paired design, missing DUT (P-5) or none (P-8) each show the matching
  RTL pane content. Weak evidence only shows the chip (P-9).
- **AC-24** Start / tab Play route per § 4.10 (R-8…R-10): the running unit's
  pane has focus and shows Stop; a mixed file runs its testbench unit unless
  the RTL pane's Play was used.

**Overrides and persistence**

- **AC-12** Role and pair overrides change detection and pairing immediately,
  are stored in the desktop workspace and restored on restart; in the browser
  they last for the session.

**Explanation and navigation**

- **AC-16** Alt+PageDown/PageUp and the `<` `>` buttons cycle through TB regions
  with wrap-around; the counter and label update.
- **AC-17** "Why?" lists each rule that fired with its line and explanation;
  clicking a row reveals the line.

**Quality**

- **AC-19** Pane headers carry the role tint and accent (D25); badges carry
  text and icon; badge text contrast ≥ 4.5:1; all new
  controls are reachable and named for a screen reader.
- **AC-20** `npm run typecheck` clean; no new runtime dependency; plain CSS
  only; `tbDetect/*`, `editorView.ts`, `editorSplit.ts` import nothing from
  React; no function over 40 lines; README and `Design_Description.md` § 9
  updated.

---

## 10. Out of scope (phase 2)

- Testbench **templates** for *Create testbench* (ports read from the design, a
  clock and a stimulus process).
- Role icons in the **Explorer** tree.
- Waveform panel, coverage, RTL ↔ TB symbol linking.
- `.sv` extension support (rules for SV constructs are already in § 5.4).
- Making the **existing three dividers** keyboard-operable with the same
  handlers as the split divider (cheap once `useEditorSplit` exists).

---

## 11. Open questions

Q1 (`work/` runs) and Q2 (`runTarget`) from 1.0 are decided: D21 and D20.

| # | Question | Default until decided |
|---|---|---|
| Q3 | Accept `.sv` files? | No (`fileKinds.ts` unchanged). |
| Q4 | `index.html` declares `lang="no"` but the UI is English, so screen readers read it with a Norwegian voice. Change to `lang="en"`? | Out of this feature; worth a one-line fix. |
| Q5 | A global shortcut to toggle the split? | None; the view switch is one Tab stop away. |
