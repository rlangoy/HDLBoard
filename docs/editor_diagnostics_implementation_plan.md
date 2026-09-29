# Editor Error Markers — Implementation Plan

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: plan, not built (2026-09-29).** Every simulator message quoted in this
document was produced by running the real tools with the exact flags the backend
uses (GHDL 4.1.0 mcode and Icarus Verilog 12.0 on Ubuntu 24.04), and checked
against the Icarus 13.0 output already recorded in
[`Verilog_implementation_plan.md` Appendix B](Verilog_implementation_plan.md#appendix-b-real-simulator-output).
Every regular expression in § 4.2 was run against all of that output (§ 2.5).
Where something could only be read, not run, the text says so.

**The end state:** a student presses **Start**, the design fails to compile, and
the code pane shows *where*: the offending line is tinted red, its line number
carries a ✕, and the compiler's message is written at the end of the line. The
file with the first error is opened and scrolled to that line. As soon as the
student clicks in the code pane or types in it, that file's markers disappear.
Warnings work the same way in amber. It works the same for VHDL (GHDL) and
Verilog (Icarus Verilog), with **no change to the backend or the wire protocol**.

**How to use this document.** §§ 0–4 say *what* and *why* (read once). § 5 is the
code standard every step must meet. § 6 is the test catalog. **§ 7 is the work
order: small steps in five phases, each with a "Done when" you can check.** Do the
phases in order. Appendix A is the real compiler output; use it verbatim as test
data.

Same conventions as [`Verilog_implementation_plan.md`](Verilog_implementation_plan.md)
and [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md).

## Contents

- [0. Summary and decisions](#0-summary-and-decisions)
- [1. Requirements and non-goals](#1-requirements-and-non-goals)
- [2. What the simulators print (measured)](#2-what-the-simulators-print-measured)
- [3. How IDEs show compiler errors — research](#3-how-ides-show-compiler-errors--research)
- [4. Design](#4-design)
- [5. Code standard (Clean Code)](#5-code-standard-clean-code)
- [6. Testing](#6-testing)
- [7. Implementation steps](#7-implementation-steps)
- [8. Open decisions](#8-open-decisions)
- [Appendix A: real simulator output (test fixtures)](#appendix-a-real-simulator-output-test-fixtures)
- [Appendix B: sources](#appendix-b-sources)

---

## 0. Summary and decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Parse in the frontend**, from the text the browser already receives: `ERROR` frames and `LOG` lines. No backend or protocol change. | The backend forwards compiler output verbatim by design (Verilog plan § 5.5). Every message that carries a location already reaches the browser (§ 2.4). A protocol change would mean editing two independent grammar implementations (`server/src/protocol.ts` and `ghdlClient.ts`) and bumping the version, for no gain. |
| D2 | **One pure parser module, driven by a table of recognizers** (one per message shape), not by a `switch` on the simulator. | Clean Code "prefer polymorphism to if/else". The repository already uses this pattern (`server/src/verilog/fileNames.ts`, its `RULES` list). The message shapes of the two tools never overlap (§ 2.5), so the parser does not need to know which tool ran. |
| D3 | **Mark whole lines.** The tint, the gutter glyph and the inline message all apply to the whole line. Underlining GHDL's exact column is an optional later step (§ 7, phase 5). | Icarus reports no column at all (§ 2.2). Whole-line marking is consistent across both languages. |
| D4 | **Clear a file's markers when the user clicks in or edits that file's code pane.** Starting a new run clears every marker. Nothing else clears them. | This is the requirement (R4). It also avoids the hardest problem in IDE diagnostics, stale positions after edits (§ 3, B6): once the text changes, the markers are gone, so they never point at the wrong line. |
| D5 | **Resolve file names against a snapshot of the files taken at Start**, and drop anything that does not resolve. | The compiler names files exactly as the browser sent them (§ 2.4). The generated wrapper (`hdl_board_tb.vhdl`, `hdl_board_tb.v`) and the timescale file (`_hdlboard_ts.v`) are not project files, so they must never be marked (§ 2.4). |
| D6 | **After a failed compile, open and scroll to the first error.** Runtime messages mark lines but never move the view. | Beginners need to be led to the problem (§ 3, B7). Runtime assertions can arrive every clock cycle; jumping on each one would make the editor unusable. |
| D7 | **Keep `Workbench.tsx` from growing.** New state lives in a `useDiagnostics` hook and pure modules; `Workbench` only wires it (about 25 new lines). | The clean-code review found `Workbench()` is already 494 lines (see § 5). |

---

## 1. Requirements and non-goals

### 1.1 Requirements

| Id | Requirement |
|---|---|
| R1 | Recognise error locations in GHDL output: analysis (`ghdl -a`), elaboration (`ghdl -e`) and runtime (`ghdl -r`: failing `assert`, index/range errors). |
| R2 | Recognise error locations in Icarus Verilog output: compile (`iverilog`, both the `-tstub` and the full compile) and runtime (`vvp`: `$error`, `$fatal`, runtime `ERROR:` lines). |
| R3 | Mark each reported line in the code pane: **errors red**, warnings amber. The mark must not rely on colour alone (§ 3, B8). |
| R4 | When the user **clicks** anywhere in the code pane (text or line numbers) or **writes** in it (typing, paste, cut, delete), the markers of the file shown in that pane disappear. |
| R5 | Markers of other files stay until the user clicks or types in those files, or presses Start again. |
| R6 | A message about a file that is not in the project (the generated testbench, the timescale file) never produces a marker; it stays in the console as today. |
| R7 | The console keeps showing every message exactly as it does now; markers are an addition, not a replacement. |
| R8 | Works in the browser build and the Windows desktop build (same frontend). |

### 1.2 Non-goals

- No live linting while typing. Diagnostics come only from a run.
- No change to the backend, the wire protocol, or what the console prints.
- No "quick fixes", no error codes, no Problems panel (§ 8 lists them as later options).
- No markers for `report ... severity note`, `$display` or `$finish` output. Those are information, not problems.

---

## 2. What the simulators print (measured)

All output below is verbatim; Appendix A has the full captures. The backend runs
both tools **with the session directory as `cwd` and every file named by its bare
name** (`ghdlEngine.ts` `analyzeFile`, `verilog/process.ts` "Every file name is
relative"). That is why every location names the file exactly as the Files panel
shows it.

### 2.1 GHDL (VHDL)

| Case | What it looks like | Where it reaches the browser |
|---|---|---|
| Analysis error | `syntax.vhdl:13:15:error: ';' expected at end of signal assignment` | `ERROR` frame, stage `analyze` (the body is the whole of stderr, several files joined by `\n`) |
| Its source echo ("caret diagnostics", on by default) | two lines after each message: the source line, then spaces and `^` under the column | same frame — **must be ignored** |
| Continuation at the same place | `syntax.vhdl:13:15:error: (found: 'end')` — the message starts with `(` | same frame — **attach to the previous message** (§ 4.3) |
| Warning next to an error | `typeerr.vhdl:15:25:warning: value constraints don't match target ones [-Wruntime-error]` | same frame |
| Elaboration warning | `comp.vhdl:9:5:warning: instance "u0" of component "missing_thing" is not bound [-Wbinding]` followed by `comp.vhdl:6:14:warning: (in default configuration of comp(rtl))` | only when elaboration also fails |
| Elaboration error without a place | `/usr/bin/ghdl-mcode:error: cannot find entity or configuration nosuch` (Windows: the `.exe` path) | `ERROR` frame — no location, **not marked** |
| Runtime report / assertion | `tb.vhdl:8:9:@0ms:(assertion error): values differ` — levels `note`, `warning`, `error`, `failure`; `report "x"` prints `(report note)` | **`LOG` lines, one per line** (GHDL writes these to *stdout*; `session.ts` forwards stdout as `LOG`, ghdl plan § 5.6) |
| Runtime check failure | `ghdl:error: index (5) out of bounds (0 to 3) at bound.vhdl:9` — line, no column | `LOG` line (stdout) |
| Run summary | `ghdl:error: assertion failed`, `ghdl:error: simulation failed` | `LOG` line — no location, not marked |
| Error in the generated wrapper | `hdl_board_tb.vhdl:55:15:error: actual constraints don't match formal ones` (a port width that does not fit the board) | `ERROR` stage `internal`, text starts `Internal testbench build error:` — **file not in project, not marked** (R6) |

Format: `file:line:column:severity: message`. Line and column are 1-based.
Severities: `error`, `warning`, `note` (and `fatal`, which was not produced in
testing but is handled as an error). GHDL documents the caret echo as
`-fcaret-diagnostics` (on unless `-fno-caret-diagnostics`); the backend passes no
diagnostics flags, so the echo is always there. GHDL analysis **warnings on a
successful analysis are not forwarded** (`analyzeFile` returns `undefined` for exit
code 0), so a VHDL warning is only ever seen next to an error. § 8 #3 covers this.

### 2.2 Icarus Verilog (`iverilog`)

| Case | What it looks like | Where it reaches the browser |
|---|---|---|
| Syntax error | `syntax.v:6: syntax error` — **no `error:` word** — sometimes followed by `I give up.`. **The line is where Icarus *noticed* the problem, i.e. the next token**: a missing `;` at the end of `DE1_SoC.v` line 19 is reported as `DE1_SoC.v:23: syntax error`, the next line of code after a blank line and two comments (A.7). Icarus often adds a second message at the statement itself: `DE1_SoC.v:19: error: Syntax error in left side of continuous assignment.` | `ERROR`, stage `analyze` |
| Error | `undeclared.v:5: error: Unable to bind wire/reg/memory \`SWX' in \`undeclared'` (often several per line) | `ERROR`, `analyze` or `elaborate` |
| Unsupported construct | `sorry.v:5: error: 'disable fork' requires SystemVerilog.` (Icarus also prints `file:line: sorry: …` for other constructs; handled as an error) | `ERROR` |
| Note under an error | `regassign.v:3:      : LEDR is declared here as wire.` — empty severity, padded with spaces | same frame — **attach to the previous message** |
| Error inside an included header | `./defs.vh:2: syntax error` — **`./` prefix** because the backend compiles with `-I.` | same frame — strip `./` |
| Missing include | `miss.v:2: Include file nope.vh not found` — **no `error:` word**, and **the line is one past the `` `include ``** (measured: an include on line 3 is reported as line 4, also when it is the last line of the file) | same frame — **subtract 1** |
| Warning on a successful compile | `warn.v:6: warning: implicit definition of wire 'nothere'.` (only with `-Wall`, which the full compile uses) | **`LOG` lines** before the run starts (`compileVerilog` returns them as `messages`) |
| Summary / context lines | `5 error(s) during elaboration.`, `Elaboration failed`, `I give up.`, `*** These modules were missing:`, `error: Unable to find the root module "miss" in the Verilog source.` | no file location — not marked |

Format: `file:line: severity: message`. **No column, ever.** The same formats
appear in the Icarus 13.0 captures recorded in the Verilog plan (Appendix B there:
`warn.v:5:        : Padding 4 high bits of the port.`,
`miss.v:2: Include file nope.vh not found`).

### 2.3 Icarus Verilog runtime (`vvp`)

| Case | What it looks like | Where |
|---|---|---|
| `$error` | `ERROR: tb.v:6: values differ` then `       Time: 0  Scope: tb` | `LOG` lines (stdout) |
| `$warning` | `WARNING: tb.v:5: careful: 3` then a `Time:` line | `LOG` |
| `$fatal` | `FATAL: tb.v:9: fatal stop` then a `Time:` line | `LOG` |
| Runtime system-task error | `ERROR: tb2.v:8: $readmemh: Unable to open nofile.hex for reading.` | `LOG` |
| `$finish` / `$stop` | `tb2.v:4: $finish called at 0 (1ps)` | `LOG` — information, **not marked** |
| `$display` | whatever the design prints | `LOG` — not marked |

### 2.4 Consequences for the design

1. **The text is line-oriented everywhere.** An `ERROR` body holds many lines; a `LOG` frame holds one. The parser works line by line, with one line of memory (the previous diagnostic, for notes).
2. **File names are the project's own names**, except `./` in front of Icarus include paths and the generated files (`hdl_board_tb.vhdl`, `hdl_board_tb.v`, `_hdlboard_ts.v`). Those are dropped because they do not resolve (D5).
3. **Line numbers refer to the text sent at Start.** If the student edits a file while it compiles, that file's positions are stale and must be dropped (§ 4.4, rule 3).
4. **Reported lines are not always the mistake's line.** GHDL reports the position right after the last good token, which is on the faulty line (`DE1_SoC.vhdl:27:15` for the missing `;` on line 27). Icarus reports a syntax error on the *next token's* line. The plan shows what the compiler says (IDEs do not second-guess compilers), attaches a hint to Icarus's bare `syntax error` (§ 4.2), and reveals the *lowest* error line of the file (§ 4.4) so the student lands on the statement-level message.
5. **Windows:** `vvp` ends lines with `\r\n` (see `lineSplitter` in `server/src/runtime.ts`), so strip a trailing `\r`. Paths in messages are relative on every platform, so drive letters never appear in a location.

### 2.5 The recognizers were checked against all captures

A prototype of §§ 4.2–4.3 was run over every line of Appendix A. It produced exactly
these markers and nothing else. Every caret line, summary line, `$display` line,
`report note` and `$finish` line was rejected.

```
error   syntax.vhdl:13:15      ';' expected at end of signal assignment   (+ detail "(found: 'end')")
error   undeclared.vhdl:13:13  no declaration for "swx"
error   undeclared.vhdl:14:16  can't match character literal '2' with type STD_ULOGIC
error   typeerr.vhdl:14:13     can't match "count" with type array type "STD_ULOGIC_VECTOR"
warning typeerr.vhdl:15:25     value constraints don't match target ones [-Wruntime-error]
error   space name.vhdl:1:28   missing ";" at end of entity
error   DE1_SoC.vhdl:27:15     ';' expected at end of signal assignment   (+ detail "(found: an identifier)")   (A.7)
warning comp.vhdl:9:5          instance "u0" of component "missing_thing" is not bound [-Wbinding]   (+ detail)
error   bound.vhdl:9           index (5) out of bounds (0 to 3)
warning tb.vhdl:7:9            warning level
error   tb.vhdl:8:9            values differ
error   tb.vhdl:9:9            fatal stop
error   hdl_board_tb.vhdl:55:15 …                                          → dropped: not a project file
error   syntax.v:6             syntax error                              (+ hint detail)
error   undeclared.v:5 (×2), undeclared.v:6 (×3)
error   regassign.v:5          LEDR is not a valid l-value in regassign.   (+ detail "LEDR is declared here as wire.")
warning inc.v:3                macro WIDTHX undefined (and assumed null) at this point.
error   defs.vh:2              syntax error                              ("./" stripped, + hint detail)
error   sp ace.v:1             syntax error                              (+ hint detail)
error   sp ace.v:1             Syntax error in continuous assignment
error   sorry.v:5              'disable fork' requires SystemVerilog.
error   unk.v:2                Unknown module type: missing_mod
error   miss.v:1               Include file nope.vh not found            (reported as line 2; −1 applied)
warning warn.v:6               implicit definition of wire 'nothere'.
error   DE1_SoC.v:23           syntax error                              (+ hint detail)   (A.7)
error   DE1_SoC.v:19           Syntax error in left side of continuous assignment.        (A.7)
warning tb.v:5                 careful: 3
error   tb.v:6                 values differ
error   tb.v:9                 fatal stop
error   tb2.v:8                $readmemh: Unable to open nofile.hex for reading.
```

**Version coverage.** Run here: GHDL 4.1.0 (mcode) and Icarus 12.0. Recorded
earlier in this repository: Icarus 13.0, same formats. **Not run: GHDL 5.0.1 and
6.0.0**, the versions the Windows app and Docker image ship. GHDL's
`file:line:col:severity:` format is documented and long-standing, but step 0.1
re-captures Appendix A on GHDL 5.0.1 or 6.0.0 before the tests are frozen.

---

## 3. How IDEs show compiler errors — research

What established editors and guidelines do, and what this plan takes from each.
Sources are in Appendix B.

| # | Practice | Seen in | Applied here |
|---|---|---|---|
| B1 | **A diagnostic is structured data**: location (file + range), severity, message, source, related information. The UI renders from that data, never from raw text. | Language Server Protocol `Diagnostic` (severity: Error 1, Warning 2, Information 3, Hint 4; `relatedInformation` for "declared here" notes); CodeMirror `Diagnostic` (`from`, `to`, `severity`, `message`, `source`) | § 4.1 types: `Diagnostic` with `details` for related notes (Icarus "declared here", GHDL `(found: …)`). Two severities are kept: `error`, `warning`. |
| B2 | **Turn tool output into diagnostics with per-format regular expressions** mapping capture groups to file / line / column / severity / message, with file paths resolved relative to the project. Multi-line messages use a sequence of patterns. | VS Code *problem matchers* (the gcc example `^(.*):(\d+):(\d+):\s+(warning\|error):\s+(.*)$`; `fileLocation: relative`; multi-line `pattern` arrays) | § 4.2: one named regex per message shape; § 4.4: names resolved against the project snapshot; § 4.3: one line of memory for continuation notes. |
| B3 | **Several redundant cues at the problem**: a gutter marker, a highlight in the text, a message on hover. | CodeMirror `lintGutter` (marker per line with hover tooltip) and underline decorations; VS Code squiggles + glyph margin | Gutter ✕ / ! glyph and coloured edge, line tint, `title` tooltip on the line number. |
| B4 | **Show the message inline, at the end of the offending line**, and tint the whole line by severity (red / yellow / blue). This removes the hover step, which beginners often do not know about. | *Error Lens* (VS Code extension, very widely used) | Inline message after the line's text (§ 4.6), truncated; whole-line tint. |
| B5 | **Severity is visible and ordered**: errors first, warnings second; one colour per severity used consistently. | LSP severities; Error Lens colours | Red = error, amber = warning, using the app's existing danger/amber hues (§ 4.6). A line with both shows as error. |
| B6 | **Diagnostics go stale when the text changes.** Editors either remap positions through each edit (CodeMirror `changes.mapPos`) or replace the whole set on the next report (LSP `publishDiagnostics` replaces the previous set; an empty array clears it). | CodeMirror lint, LSP | Replace-on-run (Start clears all) plus clear-on-interaction per file (R4). With no remapping, a marker can never point at a moved line. |
| B7 | **Navigate to problems**: jump to next/previous (F8 / Shift+F8), click an entry in a problem list or the build output to open the file at the line. | VS Code `editor.action.marker.next` (F8), CodeMirror `nextDiagnostic` (F8) | Phase 3: after a failed compile, open the file with the first error and scroll to it. Phase 4 (recommended): console lines with a location become links. F8 is § 8 #1. |
| B8 | **Never signal an error by colour alone**; pair colour with an icon and/or text. **Identify the error in text** and make it available to assistive technology. | WCAG 2.1 SC 1.4.1 *Use of Color* (Level A); SC 3.3.1 *Error Identification* | Glyph (✕ / !) + inline text + tooltip; a visually hidden `role="status"` summary per file, linked to the textarea with `aria-describedby` (§ 4.8). |
| B9 | **Respect the user's attention**: do not move the view or steal focus for background or repeated events. | Common editor behaviour: problems are listed and marked, and the view moves only when the user asks (F8, a click) | Reveal once per failed compile; never on runtime `LOG` diagnostics (D6). |
| B10 | **Bound what is shown** so a flood cannot freeze the UI. | This repository's own backend caps `LOG` lines at 200/s (`outputLimiter.ts`) for the same reason | At most 5 messages per line and 200 marked lines per file (§ 4.5). |

**Deliberate deviation from B6.** Mainstream IDEs keep a diagnostic until the
next report, remapping it through edits. HDLBoard clears a file's markers on the
first click or keystroke (R4). This fits the product: students fix one thing and
re-run, and there is no remapping code that could go wrong. The message is not
lost, because the console still has it.

---

## 4. Design

### 4.1 Data flow and types

```
 GhdlClient handlers (Workbench.getClient)
   onError(stage, text) ──┐
   onLog(text) ───────────┤
                          ▼
             useDiagnostics().record(text, currentFiles)          (hook, state)
                          │
          parseDiagnostics(text)            → Diagnostic[]         (pure: diagnostics.ts)
          locateDiagnostics(d, snapshot, currentFiles)
                                            → LocatedDiagnostic[]  (pure: diagnosticLocation.ts)
          addToFiles(byFile, located)       → DiagnosticsByFile    (pure: diagnosticStore.ts)
                          │
                          ▼
   CodeEditor  ← diagnostics={byFile}, reveal={RevealRequest}, onDismissDiagnostics(fileId)
     • line tint + inline message (HighlightedLine)
     • gutter glyph + tooltip (EditorGutter)
     • tab dot, status text for screen readers
     • pointerdown in body / onChange → dismiss the active file
```

Types, in `src/components/workbench/diagnostics.ts` (pure, exported):

```ts
export type DiagnosticSeverity = 'error' | 'warning';

/** One problem as the simulator reported it, before it is matched to a project file. */
export interface Diagnostic {
  /** The file name as printed, with a leading "./" removed. */
  readonly fileName: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based; GHDL only. Unused by the first version of the UI (D3) but kept, as LSP does. */
  readonly column?: number;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** Related notes printed right after it: Icarus "declared here", GHDL "(found: 'end')". */
  readonly details: readonly string[];
}
```

In `src/components/workbench/diagnosticLocation.ts` (pure):

```ts
/** The project as it was sent at Start — what the line numbers refer to. */
export interface RunSnapshot {
  readonly files: readonly Pick<VhdlFile, 'id' | 'name' | 'folder' | 'content'>[];
  /** The folder the run compiled from (`sourceFolderFor(topFile)`), preferred when two files share a name. */
  readonly preferredFolder: VhdlFile['folder'];
}

/** A diagnostic matched to a project file. */
export interface LocatedDiagnostic extends Omit<Diagnostic, 'fileName'> {
  readonly fileId: string;
}
```

In `src/components/workbench/diagnosticStore.ts` (pure):

```ts
/** One message on a line: a Diagnostic without its location. */
export interface LineMessage {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly details: readonly string[];
}

/** Everything reported on one line; `severity` is the worst of its messages. */
export interface LineDiagnostic {
  readonly line: number;
  readonly severity: DiagnosticSeverity;
  readonly messages: readonly LineMessage[];
}

/** Per file id, lines ascending. A file with nothing reported has no key. */
export type DiagnosticsByFile = Readonly<Record<string, readonly LineDiagnostic[]>>;

export const NO_DIAGNOSTICS: DiagnosticsByFile = {};
```

In `src/components/workbench/useDiagnostics.ts` / `CodeEditor.tsx`:

```ts
/** Ask the editor to show a line: `id` changes on every request, so the same line can be revealed twice. */
export interface RevealRequest {
  readonly fileId: string;
  readonly line: number;
  readonly id: number;
}
```

### 4.2 The recognizers (exact)

A **recognizer** turns one line of text into a result or declines it. They are
tried **in this order**; the first that matches wins. Before matching, strip one
trailing `\r`. Every regex is anchored (`^…$`) and uses named groups.

| Order | Name | Regex (JavaScript) | Severity from the captured level | Example |
|---|---|---|---|---|
| 1 | `ghdlCompile` | `/^(?<file>.+?):(?<line>\d+):(?<column>\d+):(?<level>error\|warning\|fatal\|note):\s*(?<message>.*)$/` | `error`, `fatal` → `error`; `warning` → `warning`; `note` → **declined** | `syntax.vhdl:13:15:error: ';' expected at end of signal assignment` |
| 2 | `ghdlReport` | `/^(?<file>.+?):(?<line>\d+):(?<column>\d+):@[^:]*:\((?:assertion\|report) (?<level>note\|warning\|error\|failure)\):\s*(?<message>.*)$/` | `error`, `failure` → `error`; `warning` → `warning`; `note` → **declined** | `tb.vhdl:8:9:@0ms:(assertion error): values differ` |
| 3 | `ghdlRuntimeError` | `/^(?:.*[\\/])?ghdl[^\\/:]*:error: (?<message>.+) at (?<file>[^:]+):(?<line>\d+)$/` | always `error` | `ghdl:error: index (5) out of bounds (0 to 3) at bound.vhdl:9` |
| 4 | `vvpRuntime` | `/^(?<level>ERROR\|WARNING\|FATAL): (?<file>.+?):(?<line>\d+): (?<message>.*)$/` | `ERROR`, `FATAL` → `error`; `WARNING` → `warning` | `ERROR: tb.v:6: values differ` |
| 5 | `icarusNote` | `/^(?<file>.+?):(?<line>\d+):\s+: (?<message>.*)$/` | **a note** (§ 4.3), never a diagnostic of its own | `regassign.v:3:      : LEDR is declared here as wire.` |
| 6 | `icarusCompile` | `/^(?<file>.+?):(?<line>\d+): (?<level>error\|warning\|sorry): (?<message>.*)$/` | `error`, `sorry` → `error`; `warning` → `warning` | `undeclared.v:5: error: Unable to bind …` |
| 7 | `icarusSyntax` | `/^(?<file>.+?):(?<line>\d+): (?<message>syntax error)$/` | always `error`; **adds the detail** `ICARUS_SYNTAX_HINT` | `syntax.v:6: syntax error` |
| 8 | `icarusMissingInclude` | `/^(?<file>.+?):(?<line>\d+): (?<message>Include file .+ not found)$/` | always `error`; **line − 1** (`INCLUDE_LINE_OFFSET = -1`) | `miss.v:2: Include file nope.vh not found` |

(In the table `\|` is a markdown escape; in code it is a plain `|`.)

Rules that go with the table:

- **Order matters.** Recognizer 1 needs a column (`:\d+:\d+:`), so it can never match Icarus's `file:line: error:`. Recognizer 2 needs `@`. Recognizer 5 must run before 6–8.
- **"Declined" is not "no match".** A declined line (a GHDL `note`, a `report note`) stops the search and produces nothing. Otherwise a later, looser pattern might pick it up.
- The file group: remove one leading `./` (Icarus `-I.` include paths). Do not change case or anything else.
- `line` and `column` are parsed with `Number(...)`. A line of `0` or less (after the include offset) is discarded.
- `ICARUS_SYNTAX_HINT = 'Icarus reports the line where it noticed the problem. If this line looks right, check the end of the previous line of code (a missing \';\' is the usual cause).'` Its *why* comment should quote the `DE1_SoC.v` 19/23 measurement (A.7).
- **No recognizer for the lines that must be ignored.** Caret echo lines, summaries (`I give up.`, `N error(s) during elaboration.`), `$display` text, `$finish called at …` and located-less `error: …` lines are ignored because nothing matches them. Do **not** add a catch-all `file:line:` pattern: `tb2.v:4: $finish called at 0 (1ps)` would then be marked.

Structure (Clean Code "prefer polymorphism"; mirrors `fileNames.ts` `RULES`):

```ts
type LineResult =
  | { readonly kind: 'diagnostic'; readonly diagnostic: Diagnostic } // details: [] or [ICARUS_SYNTAX_HINT]
  /** GHDL compile message that starts with "(" — § 4.3 rule 2. Only recognizer 1 returns this. */
  | { readonly kind: 'continuation'; readonly diagnostic: Diagnostic }
  | { readonly kind: 'note'; readonly message: string }
  | { readonly kind: 'declined' }
  | { readonly kind: 'none' };

interface Recognizer {
  readonly pattern: RegExp;
  /** Builds the result from the named groups of a match. */
  readonly interpret: (groups: Readonly<Record<string, string>>) => LineResult;
}

const RECOGNIZERS: readonly Recognizer[] = [ /* the eight, in table order */ ];

export function recognizeLine(text: string): LineResult;      // tries RECOGNIZERS in order
export function parseDiagnostics(text: string): Diagnostic[]; // splits on \n, applies § 4.3
```

Severity maps are data, not branches:
`const GHDL_LEVEL: Readonly<Record<string, DiagnosticSeverity | undefined>> = { error: 'error', fatal: 'error', warning: 'warning' };`
A level missing from the map (for example `note`) is declined.

### 4.3 Notes and continuations

`parseDiagnostics` walks the lines once and keeps the last diagnostic it produced
(`previous`):

1. `kind: 'note'` (Icarus recognizer 5) → append its `message` to `previous.details`. With no `previous`, drop it.
2. `kind: 'continuation'` — recognizer 1 returns this instead of `diagnostic` when the message **starts with `(`** (`(found: 'end')`, `(in default configuration of comp(rtl))`). Append the message to `previous.details` if there is a `previous` in the **same file**; otherwise treat it as a `diagnostic` (T-12). Only recognizer 1 does this: a runtime `report "(debug) …"` (recognizer 2) is the student's own text and is never a continuation.
3. Any other diagnostic → finish `previous` and start a new one.
4. `declined` / `none` → nothing. **`previous` is kept**: caret lines sit between an error and its `(found …)` continuation (Appendix A.1). Resetting `previous` would break rule 2.

`parseDiagnostics` is given one `LOG` line or one `ERROR` body at a time. A note
never spans two calls: Icarus notes arrive in the same `ERROR` body as their
error, and `vvp`'s `Time: … Scope: …` lines are not needed.

### 4.4 Locating: from file name to project file

`locateDiagnostics(diagnostics, snapshot, currentFiles): LocatedDiagnostic[]` —
pure. For each diagnostic, in order:

1. **Resolve the name** (`resolveFileId(fileName, snapshot)`):
   a. files in the snapshot whose `name === fileName`;
   b. if none, files whose `name.toLowerCase() === fileName.toLowerCase()` (Windows file systems ignore case, so `` `include "DEFS.vh" `` finds `defs.vh`);
   c. none → **drop** (this is what removes `hdl_board_tb.*` and `_hdlboard_ts.v`, R6);
   d. several → take the one in `snapshot.preferredFolder`, else the first.
2. **Check the line exists**: `1 <= line <= content.split('\n').length` of the snapshot file, else drop.
3. **Check the file was not changed or deleted since Start**: the file with that id in `currentFiles` must exist and have the **same `content`** as the snapshot. Otherwise drop, because the student edited it while it compiled and the line numbers are stale.
4. Keep `line`, `column`, `severity`, `message`, `details`; replace `fileName` with `fileId`.

`firstRevealTarget(located): LocatedDiagnostic | undefined`: take the file of
the first `error` in the list, and return that file's error with the **lowest
line number**. For the `DE1_SoC.v` case that is line 19 (the statement), not
line 23 (where Icarus noticed it). It returns `undefined` if there are only
warnings, so warnings never move the view (B9).

### 4.5 Storing and the marker lifecycle

`diagnosticStore.ts` (pure, every function returns a new object and never mutates):

- `addToFiles(byFile, located): DiagnosticsByFile`
  - group by `fileId`; within a file, one `LineDiagnostic` per `line`, kept in ascending line order;
  - a message equal to one already on that line (same `severity` and `message`) is not added again. Runtime assertions repeat every cycle, and repeats would otherwise flood the line;
  - a line's `severity` is `error` if any of its messages is an error, else `warning`;
  - caps, as named constants with the reason: `MAX_MESSAGES_PER_LINE = 5` (extra messages are dropped) and `MAX_MARKED_LINES_PER_FILE = 200` (lines beyond it are dropped). **Encapsulate these boundary conditions in one function each** (Clean Code): `withinMessageLimit`, `withinLineLimit`.
- `withoutFile(byFile, fileId): DiagnosticsByFile`. Returns **the same object** when the file has no entry, so React does not re-render for nothing.
- `countSeverities(lines): { errors: number; warnings: number }` counts messages.
- `describeLine(lineDiagnostic): string` builds the tooltip text: one message per line, `error: …` / `warning: …`, each detail on its own line indented by two spaces.
- `inlineText(lineDiagnostic): string` builds the text at the end of the line: the first message of the line's severity, truncated to `INLINE_MESSAGE_MAX_CHARS = 120` with `…`, plus ` (+N more)` when there are more messages.
- `summarize(fileName, lines): string` builds the screen-reader summary: `''` when empty, else e.g. `syntax.vhdl: 2 errors, 1 warning. First on line 13: ';' expected at end of signal assignment`. Use singular and plural correctly.

**Lifecycle — the complete list of what changes markers:**

| Event | Effect | Where |
|---|---|---|
| **Start** pressed (`handleStart`) | all markers cleared; a new `RunSnapshot` taken | `useDiagnostics().startRun` |
| `ERROR` frame (any stage) | parse, locate, add; if stage is `analyze` or `elaborate` → reveal `firstRevealTarget` | `getClient` `onError` |
| `LOG` frame | parse, locate, add; **never** reveal | `getClient` `onLog` |
| **pointerdown** anywhere in `.wb-editor__body` (text or gutter) | the active file's markers removed | `CodeEditor` → `onDismissDiagnostics(activeId)` |
| **any edit** of a file (typing, paste, cut, drop onto the textarea is already turned into an import) | that file's markers removed | `Workbench.handleContentChange` |
| file deleted | its markers removed | `Workbench.handleDeleteFile` |
| file renamed | markers kept (keyed by id) | nothing to do |
| console **Clear**, tab switch, tab close, Stop | **no effect** | — |

Keyboard navigation with the arrow keys is not "writing" (R4), so it does not
clear markers. Only a change of content does.

### 4.6 Rendering in the code pane

The editor is a transparent `<textarea>` over a highlighted `<pre>`, with a
separate gutter (`CodeEditor.tsx`). Markers are drawn **only in the `<pre>` and
the gutter**. The textarea is untouched, so typing, selection and the caret behave
exactly as before. Nothing may change a line's height, or the `<pre>` stops lining
up with the textarea.

**Colour tokens** — add to the `.wb` block in `Workbench.css`, next to the
existing `--wb-danger` tokens. Every text colour meets WCAG AA (4.5:1) on the
background it is drawn on; the ratios were computed for these exact values, and
the code text (`#1e293b`) stays at 12.5:1 on the red tint:

```css
  --wb-diag-error: #dc2626;                    /* = --wb-danger-dark; gutter number, glyph, edge: 4.6:1 on the gutter */
  --wb-diag-error-bg: rgba(239, 68, 68, 0.12); /* line tint (--wb-danger at 12 %) */
  --wb-diag-error-text: #b91c1c;               /* inline message: 5.5:1 on the tint */
  --wb-diag-warning: #b45309;                  /* 4.8:1 on the gutter (#d97706 would be only 3.0:1) */
  --wb-diag-warning-bg: rgba(245, 158, 11, 0.14);
  --wb-diag-warning-text: #92400e;             /* inline message: 6.4:1 on the tint */
```

**Line tint** (`HighlightedLine` gets a `diagnostic?: LineDiagnostic` prop and
adds `is-error` / `is-warning` to `.wb-editor__line`). In `CodeEditor.css`:

1. Add `--wb-code-pad-x: 16px;` to the `.wb-editor` variable block, and use it in the existing padding of `.wb-editor__highlight, .wb-editor__textarea` (`padding: var(--wb-code-pad-top) var(--wb-code-pad-x) 12px;`). This is the same value, now named, so the next rule can reach the padding.
2. ```css
   .wb-editor__line.is-error,
   .wb-editor__line.is-warning {
     /* Tint the full visible width, padding included, without moving the text. */
     margin-inline: calc(-1 * var(--wb-code-pad-x));
     padding-inline: var(--wb-code-pad-x);
     min-width: 100%;
     width: max-content;
   }
   .wb-editor__line.is-error { background: var(--wb-diag-error-bg); }
   .wb-editor__line.is-warning { background: var(--wb-diag-warning-bg); }
   ```

**Inline message** (B4): after the line's tokens, inside the same
`.wb-editor__line`, render
`<span className="wb-editor__diag-inline is-error">{inlineText(diagnostic)}</span>`:

```css
.wb-editor__diag-inline { margin-left: 3ch; font-style: italic; }
.wb-editor__diag-inline.is-error { color: var(--wb-diag-error-text); }
.wb-editor__diag-inline.is-warning { color: var(--wb-diag-warning-text); }
```

An empty line renders `' '` today (so it keeps its height); keep that and put the
span after it. The span sits past the end of the real text, so it cannot cover
code, and the caret never reaches it.

**Gutter** — extract the gutter into an `EditorGutter` component (in
`CodeEditor.tsx`; it shrinks `CodeEditor`, which the review flagged at 124 lines).
For a marked line:

- class `is-error` / `is-warning` on `.wb-editor__gutter-line`;
- `title={describeLine(diagnostic)}`, the hover tooltip (B3). The gutter is not covered by the textarea, so it receives the hover;
- CSS:

```css
.wb-editor__gutter-line { position: relative; }
.wb-editor__gutter-line.is-error,
.wb-editor__gutter-line.is-warning { font-weight: 700; cursor: help; }
.wb-editor__gutter-line.is-error { color: var(--wb-diag-error); box-shadow: inset -3px 0 0 var(--wb-diag-error); }
.wb-editor__gutter-line.is-warning { color: var(--wb-diag-warning); box-shadow: inset -3px 0 0 var(--wb-diag-warning); }
.wb-editor__gutter-line.is-error::before,
.wb-editor__gutter-line.is-warning::before {
  position: absolute;
  left: 3px;
  font-size: 10px;
}
.wb-editor__gutter-line.is-error::before { content: '✕'; }
.wb-editor__gutter-line.is-warning::before { content: '!'; }
```

(The edge sits on the gutter's right side rather than in the text, where it would
overlap the first character.)

**Tab indicator.** A tab whose file has at least one error gets `has-errors`;
one with only warnings gets `has-warnings`:

```css
.wb-editor__tab.has-errors .wb-editor__tab-name::after,
.wb-editor__tab.has-warnings .wb-editor__tab-name::after {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 6px;
  border-radius: 50%;
  vertical-align: middle;
}
.wb-editor__tab.has-errors .wb-editor__tab-name::after { background: var(--wb-diag-error); }
.wb-editor__tab.has-warnings .wb-editor__tab-name::after { background: var(--wb-diag-warning); }
```

and inside the tab a visually hidden text `, 2 errors` (B8).

### 4.7 Revealing the first error

`Workbench` holds `reveal: RevealRequest | null`. `revealFirstError(located)` —
a `useCallback` with no changing dependencies, because it runs inside the
GhdlClient handlers, which are created once (see the stale-closure note on
`swRef`):

1. `target = firstRevealTarget(located)`; stop if `undefined`;
2. open the file's tab and make it active (the body of `handleOpenFile`: `setOpenTabs(prev => prev.includes(id) ? prev : [...prev, id]); setActiveTabId(id);`);
3. `setReveal({ fileId: target.fileId, line: target.line, id: ++revealSeq.current })`.

`CodeEditor` handles it in a small hook `useRevealLine(textareaRef, activeTab, reveal)` (own file):

- runs when `reveal?.id` changes **and** `reveal.fileId === activeTab?.id` (the tab may become active one render later; the effect then runs again);
- line height from the element, not a duplicated constant: `parseFloat(getComputedStyle(textarea).lineHeight)`;
- `textarea.scrollTop = Math.max(0, (line - 1) * lineHeight - textarea.clientHeight / 2)`. This fires the textarea's `scroll` event, and the existing `handleScroll` moves the `<pre>` and gutter with it;
- caret at the start of the line: `const at = offsetOfLine(content, line); textarea.focus({ preventScroll: true }); textarea.setSelectionRange(at, at);`. `offsetOfLine` is pure (in `diagnosticStore.ts` or its own module): the sum of the lengths of the previous lines plus one per newline;
- remembers the last handled `id` in a ref, so a re-render does not reveal again.

Programmatic focus is **not** a click, so it does not clear the markers. The
first keystroke after it does (R4). That is intended: the student lands on the
error and starts fixing it.

### 4.8 Accessibility

- Colour is never alone: glyph, inline text and tooltip (WCAG 1.4.1).
- Add a generic visually hidden class to `Workbench.css` (the same rules as the existing `.wb-help__sr`), named `.wb-sr-only`.
- In `CodeEditor`, when a file is open: `<p id={statusId} className="wb-sr-only" role="status" aria-live="polite">{summarize(active.name, activeLines)}</p>`, with `statusId` from `useId()`. Give the textarea `aria-describedby={statusId}`, so a screen reader announces the problems when they appear and when the textarea gets focus (WCAG 3.3.1).
- The tab's hidden `, N errors` text (§ 4.6).
- The gutter stays `aria-hidden` (line numbers are noise to a screen reader); the status text carries the information.

### 4.9 Console links (phase 4, recommended)

A console line that names a marked place becomes a link to it (B7):

- `useDiagnostics` exposes `locateText(line, currentFiles): LocatedDiagnostic | undefined`. It is the first result of `locateDiagnostics(parseDiagnostics(line), snapshot, currentFiles)`. `Workbench` passes `ConsoleOutput` the closure `(line) => diagnostics.locateText(line, filesRef.current)`;
- `ConsoleOutput` gets two optional props: `locate?: (line: string) => { fileId: string; line: number } | undefined` and `onOpenLocation?: (target) => void`;
- when rendering `line.text`, split it on `\n`. For each part that `locate` resolves, render `<button type="button" className="wb-console__link" onClick={() => onOpenLocation(target)}>{part}</button>`; render other parts as text, keeping the newlines (the body is `white-space: pre-wrap` today);
- `onOpenLocation` is `revealLocation` in `Workbench`: steps 2–3 of § 4.7 for that location;
- CSS: `.wb-console__link { all: unset; cursor: pointer; text-decoration: underline dotted; } .wb-console__link:hover { text-decoration-style: solid; } .wb-console__link:focus-visible { outline: 2px solid #93c5fd; }`.

Because `locateText` checks that the file is unchanged, a line for an edited
file stops being a link, which is correct, since its line number is stale.

### 4.10 Module layout

```
src/components/workbench/
  diagnostics.ts            pure — Diagnostic types, RECOGNIZERS, recognizeLine, parseDiagnostics
  diagnostics.test.ts
  diagnosticLocation.ts     pure — RunSnapshot, LocatedDiagnostic, resolveFileId, locateDiagnostics, firstRevealTarget
  diagnosticLocation.test.ts
  diagnosticStore.ts        pure — LineDiagnostic, DiagnosticsByFile, addToFiles, withoutFile, countSeverities,
                                   describeLine, inlineText, summarize, offsetOfLine
  diagnosticStore.test.ts
  diagnostics.fixtures.ts   test data — the Appendix A captures as exported string constants
  useDiagnostics.ts         React hook — state + snapshot ref; the only stateful piece
  useRevealLine.ts          React hook — scroll + caret for a RevealRequest
  CodeEditor.tsx            + EditorGutter, marker classes, inline message, status text, dismiss handler
  CodeEditor.css            + marker styles
  Workbench.tsx             wiring only (~25 lines)
  Workbench.css             + colour tokens, .wb-sr-only
  ConsoleOutput.tsx/.css    phase 4 only
```

Pure modules import nothing from React and nothing from `window`/`document`
(rule 4 of the Verilog plan § 6.1).

`useDiagnostics(): DiagnosticsApi`:

```ts
export interface DiagnosticsApi {
  readonly byFile: DiagnosticsByFile;
  /** Clears everything and remembers what this run compiles. */
  startRun(snapshot: RunSnapshot): void;
  /** Parses simulator text, keeps what locates, and returns it (for reveal). */
  record(text: string, currentFiles: RunSnapshot['files']): readonly LocatedDiagnostic[];
  dismissFile(fileId: string): void;
  /** Phase 4. */
  locateText(line: string, currentFiles: RunSnapshot['files']): LocatedDiagnostic | undefined;
}
```

`startRun`, `record`, `dismissFile` and `locateText` must be **stable**
(`useCallback` with `[]`): they are called from the GhdlClient handlers, which are
created once. They read the snapshot from a `useRef` and change state with the
functional form `setByFile(prev => …)`. `record` computes `located` **outside**
the state updater (from its arguments and the snapshot ref), then calls
`setByFile(prev => addToFiles(prev, located))` and returns `located`.

---

## 5. Code standard (Clean Code)

The standard is Robert C. Martin's *Clean Code* as summarised in
[wojteklu's Clean Code summary](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29),
applied as this repository already does (Verilog plan § 6, whose checklist also
applies). The table maps each rule of the summary to a concrete requirement for
this work.

| Summary section → rule | Requirement in this plan |
|---|---|
| General → *Keep it simple* | Whole-line markers (D3), clear-on-interaction instead of position remapping (D4), no protocol change (D1). |
| General → *Boy scout rule* | Extract `EditorGutter` while touching the gutter; name `--wb-code-pad-x`; move `filesRef` above `getClient` (§ 7 step 3.3). Do not refactor anything else. |
| General → *Always find root cause* | A marker on the wrong line is fixed in the parser or locator, never patched in the UI. |
| Design → *Keep configurable data at high levels* | All limits are named constants at the top of their module (`MAX_MESSAGES_PER_LINE`, `MAX_MARKED_LINES_PER_FILE`, `INLINE_MESSAGE_MAX_CHARS`); all colours are CSS tokens on `.wb`. |
| Design → *Prefer polymorphism to if/else or switch* | `RECOGNIZERS` table (§ 4.2); severity maps are `Record`s, not `switch`es. |
| Design → *Use dependency injection* | Pure functions receive the snapshot and current files as arguments; nothing reads module-level state. |
| Design → *Law of Demeter* | `CodeEditor` receives `DiagnosticsByFile` and callbacks. It never sees the snapshot, the parser or the client. |
| Understandability → *Be consistent* | Same naming, SPDX header, test style (`describe`/`test`, ids in names) as `consoleLines.test.ts`, `fileKinds.test.ts`. |
| Understandability → *Use explanatory variables* | e.g. `const isContinuation = message.startsWith('(')`, `const fileChangedSinceStart = current?.content !== snapshotFile.content`. |
| Understandability → *Encapsulate boundary conditions* | Line range check in one function (`isLineInFile`); the caps in `withinMessageLimit` / `withinLineLimit`. |
| Understandability → *Prefer dedicated value objects to primitive type* | `Diagnostic`, `LocatedDiagnostic`, `LineDiagnostic`, `RevealRequest`, `RunSnapshot` — never tuples or `[string, number]`. |
| Understandability → *Avoid negative conditionals* | Write `if (isLineInFile(…))`, not `if (!isLineOutsideFile(…))`. |
| Names → *descriptive, unambiguous, searchable; no encodings; no magic numbers* | Names as in § 4 (`recognizeLine`, `locateDiagnostics`, `firstRevealTarget`, `withoutFile`). No `d`, `ld`, `tmp`. Every number except 0 and 1 is a named constant. |
| Functions → *small, do one thing, few arguments, no side effects, no flag arguments* | ≤ 20 lines aimed, 40 hard cap; ≤ 3 parameters; pure modules have no side effects; no `boolean` parameters (e.g. no `record(text, shouldReveal)` — the caller decides to reveal). |
| Comments → *explain intent, clarify, warn; no redundancy, no commented-out code* | Each regex gets a one-line comment naming the tool and quoting an example line from Appendix A; the "declined vs none" rule and the "keep `previous` across caret lines" rule get *why* comments. |
| Source structure → *vertical density, dependent functions close, downward order* | Public function first, its helpers directly below it, in call order. |
| Objects & data structures → *hide internal structure; small; one thing* | `useDiagnostics` exposes four methods and one read-only value; the snapshot stays private in a ref. |
| Tests → *one assert per test, readable, fast, independent, repeatable* | § 6: one `expect` per test, `test.each` tables for the recognizers, no loops or conditionals in test bodies, no DOM, no timers. |
| Code smells → *rigidity, fragility, needless repetition, opacity* | The parser is used for markers and for console links (one implementation). A new message shape is one new entry in `RECOGNIZERS` plus one test row. |

**Checklist for every step's diff** (Verilog plan § 6.4, adapted):

- [ ] Every function does one thing and fits on a screen; none takes a boolean flag or more than three parameters.
- [ ] Every name says what it is without a comment.
- [ ] Pure logic is in a pure module; the hooks and components contain no parsing.
- [ ] No magic numbers or strings; limits and colours are named.
- [ ] Comments say *why*; SPDX header on every new file; no dead code.
- [ ] Tests were written first, seen failing, and have one assertion each.
- [ ] `npm run typecheck` clean; `npm test` green at the root and in `server/` (the server is unchanged, so it must stay green).

**Measuring it.** Run the repository's own limits over the new files, the same
way the review of 2026-09-29 did. From the repository root, with `server/`'s
dependencies installed (`cd server && npm ci`), check that this reports nothing:

```bash
cat > eslint.diagnostics.tmp.mjs <<'EOF'
import tseslint from './server/node_modules/typescript-eslint/dist/index.js';
export default tseslint.config({
  files: ['src/components/workbench/diagnostic*.ts', 'src/components/workbench/use*.ts'],
  languageOptions: { parser: tseslint.parser },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
    'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
    'max-params': ['error', 3], complexity: ['error', 8], 'max-depth': ['error', 3],
    '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-non-null-assertion': 'error',
    'no-magic-numbers': ['warn', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, enforceConst: true }],
  },
}, { files: ['**/*.test.ts', '**/*.fixtures.ts'], rules: { 'max-lines-per-function': 'off', 'no-magic-numbers': 'off' } });
EOF
server/node_modules/.bin/eslint --no-config-lookup --no-error-on-unmatched-pattern -c eslint.diagnostics.tmp.mjs \
  'src/components/workbench/diagnostic*.ts' 'src/components/workbench/use*.ts'
rm eslint.diagnostics.tmp.mjs
```

(The config sits in the repository root only for the run, so that its relative
import resolves; do not commit it.)

---

## 6. Testing

Frontend unit tests use vitest in the `node` environment (`vitest.config.ts`
includes `src/**/*.test.ts`), so **only the pure modules are unit-tested**. The
hooks and components are checked by the browser runbook (§ 6.4).

**Fixtures.** `diagnostics.fixtures.ts` exports each block of Appendix A as a
`const` string, copied **exactly**: keep leading spaces, and keep lines in their
order. Example:

```ts
/** GHDL 4.1.0, `ghdl -a --std=08 syntax.vhdl` (Appendix A.1). */
export const GHDL_SYNTAX_ERROR = [
  "syntax.vhdl:13:15:error: ';' expected at end of signal assignment",
  '    LEDR <= SW',
  '              ^',
  "syntax.vhdl:13:15:error: (found: 'end')",
].join('\n');
```

### 6.1 `diagnostics.test.ts` — recognizing lines

`test.each` over rows `[id, input line, expected LineResult]`, one `expect(recognizeLine(input)).toEqual(expected)` per row:

| Id | Input | Expected |
|---|---|---|
| P-1 | `syntax.vhdl:13:15:error: ';' expected at end of signal assignment` | diagnostic, error, `syntax.vhdl`, 13, col 15 |
| P-2 | `typeerr.vhdl:15:25:warning: value constraints don't match target ones [-Wruntime-error]` | diagnostic, warning, col 25 |
| P-3 | `space name.vhdl:1:28:error: missing ";" at end of entity` | fileName `space name.vhdl` |
| P-4 | `tb.vhdl:8:9:@0ms:(assertion error): values differ` | diagnostic, error, 8, col 9, message `values differ` |
| P-5 | `tb.vhdl:9:9:@0ms:(assertion failure): fatal stop` | error |
| P-6 | `tb.vhdl:7:9:@0ms:(assertion warning): warning level` | warning |
| P-7 | `tb.vhdl:6:9:@0ms:(report note): hello from tb` | declined |
| P-8 | `ghdl:error: index (5) out of bounds (0 to 3) at bound.vhdl:9` | diagnostic, error, `bound.vhdl`, 9, no column |
| P-9 | `C:\Program Files\HDLBoard\resources\ghdl\bin\ghdl.exe:error: index (5) out of bounds (0 to 3) at bound.vhdl:9` | same as P-8 |
| P-10 | `ghdl:error: simulation failed` | none |
| P-11 | `/usr/bin/ghdl-mcode:error: cannot find entity or configuration nosuch` | none |
| P-12 | `syntax.v:6: syntax error` | diagnostic, error, `syntax.v`, 6, message `syntax error`, details `[ICARUS_SYNTAX_HINT]` |
| P-13 | `undeclared.v:5: error: Unable to bind wire/reg/memory \`SWX' in \`undeclared'` | error, 5 |
| P-14 | `warn.v:6: warning: implicit definition of wire 'nothere'.` | warning, 6 |
| P-15 | `x.v:3: sorry: constant selects in always_* processes are not currently supported (all bits will be included).` | error |
| P-16 | `regassign.v:3:      : LEDR is declared here as wire.` | note, `LEDR is declared here as wire.` |
| P-17 | `./defs.vh:2: syntax error` | fileName `defs.vh` |
| P-18 | `miss.v:2: Include file nope.vh not found` | error, **line 1**, message `Include file nope.vh not found` |
| P-19 | `ERROR: tb.v:6: values differ` | error, 6 |
| P-20 | `WARNING: tb.v:5: careful: 3` | warning |
| P-21 | `FATAL: tb.v:9: fatal stop` | error |
| P-22 | `tb2.v:4: $finish called at 0 (1ps)` | none |
| P-23 | `I give up.` | none |
| P-24 | `5 error(s) during elaboration.` | none |
| P-25 | `              ^` | none |
| P-26 | `    LEDR <= SW` | none |
| P-27 | `error: Unable to find the root module "miss" in the Verilog source.` | none |
| P-28 | `       Time: 0  Scope: tb` | none |
| P-29 | `hello from tb` | none |
| P-30 | `syntax.vhdl:13:15:error: ';' expected at end of signal assignment\r` | same as P-1 (CR stripped) |
| P-31 | `x.vhdl:0:1:error: y` | none (line 0 discarded) |
| P-32 | `comp.vhdl:9:5:note: something` | declined |
| P-33 | `m.v:1: Include file nope.vh not found` | none (line 0 after the offset) |
| P-34 | `DE1_SoC.v:19: error: Syntax error in left side of continuous assignment.` | error, 19 |
| P-35 | `syntax.vhdl:13:15:error: (found: 'end')` | continuation |
| P-36 | `tb.vhdl:6:9:@0ms:(assertion error): (debug) x` | diagnostic, message `(debug) x` (not a continuation) |

(P-15: the `sorry:` level was not reproduced with Icarus 12.0 here, where `disable fork` came
back as `error:`; the row only tests that the level is recognized.)

### 6.2 `diagnostics.test.ts` — whole texts

One `expect` each; use the fixture constants:

| Id | Input | Expected |
|---|---|---|
| T-1 | `GHDL_SYNTAX_ERROR` | exactly one diagnostic |
| T-2 | `GHDL_SYNTAX_ERROR` | its `details` equal `["(found: 'end')"]` (continuation across caret lines, § 4.3 rule 4) |
| T-3 | the undeclared VHDL capture | two diagnostics, lines 13 and 14 |
| T-4 | the elaboration capture (A.2) | one warning with details `['(in default configuration of comp(rtl))']` |
| T-5 | the `regassign` Icarus capture | one error with details `['LEDR is declared here as wire.']` |
| T-6 | the `undeclared.v` capture | five diagnostics (duplicates are merged later, by the store) |
| T-7 | the `inc.v` capture | two diagnostics: warning `inc.v:3`, error `defs.vh:2` |
| T-8 | the full `vvp` capture (A.6) | four diagnostics (tb.v 5, 6, 9 and tb2.v 8) |
| T-9 | the GHDL report capture (A.3) | three diagnostics (note excluded) |
| T-10 | `''` | `[]` |
| T-11 | a note with no diagnostic before it | `[]` |
| T-12 | `"a.vhdl:1:1:error: (x)"` alone | one diagnostic with message `(x)` (a leading `(` without a previous diagnostic is kept) |
| T-13 | the `DE1_SoC.v` capture (A.7) | two diagnostics, lines 23 and 19, in that order |
| T-14 | the `DE1_SoC.vhdl` capture (A.7) | one diagnostic, line 27, details `['(found: an identifier)']` |

### 6.3 `diagnosticLocation.test.ts` and `diagnosticStore.test.ts`

Build small snapshots inline (two or three files with short `content`).

| Id | Case | Expected |
|---|---|---|
| L-1 | name matches exactly | located with that file's id |
| L-2 | only a case-insensitive match (`DEFS.vh` vs `defs.vh`) | located |
| L-3 | two files named `top.vhdl` in `vhdl` and `work`, `preferredFolder: 'vhdl'` | the `vhdl` one |
| L-4 | `hdl_board_tb.vhdl` | dropped |
| L-5 | `_hdlboard_ts.v` | dropped |
| L-6 | line greater than the file's line count | dropped |
| L-7 | file content changed since the snapshot | dropped |
| L-8 | file deleted since the snapshot | dropped |
| L-9 | `firstRevealTarget` of [warning, error, error] | the first error |
| L-10 | `firstRevealTarget` of warnings only | `undefined` |
| L-11 | `firstRevealTarget` of the `DE1_SoC.v` capture (A.7: line 23 then line 19) | line 19 |
| S-1 | two messages on the same line | one `LineDiagnostic` with two messages |
| S-2 | the same message twice | stored once |
| S-3 | warning then error on one line | line severity `error` |
| S-4 | lines added out of order (9, 3) | stored ascending (3, 9) |
| S-5 | `MAX_MESSAGES_PER_LINE + 1` messages | `MAX_MESSAGES_PER_LINE` kept |
| S-6 | `MAX_MARKED_LINES_PER_FILE + 1` lines | `MAX_MARKED_LINES_PER_FILE` kept |
| S-7 | `withoutFile` removes only the given file | other file untouched |
| S-8 | `withoutFile` for a file with no entry | returns the **same** object (`toBe`) |
| S-9 | `addToFiles` does not mutate its input | input deep-equal to a copy taken before |
| S-10 | `countSeverities` | `{ errors: 2, warnings: 1 }` for a fixture |
| S-11 | `inlineText` with 3 messages | first message + ` (+2 more)` |
| S-12 | `inlineText` of a 200-char message | 120 chars ending in `…` |
| S-13 | `describeLine` with a detail | `error: …\n  <detail>` |
| S-14 | `summarize` with none | `''` |
| S-15 | `summarize` with 1 error | singular `1 error` |
| S-16 | `offsetOfLine('a\nbb\nccc', 3)` | `5` |
| S-17 | `offsetOfLine(text, 1)` | `0` |

### 6.4 Browser runbook (acceptance)

Add a section to a new file `tests/e2e/editor-diagnostics.md`, in the style of
`tests/e2e/verilog-browser.md` (same prerequisites: Vite dev server plus backend
with GHDL and Icarus). DOM hooks: `.wb-editor__line.is-error`,
`.wb-editor__gutter-line.is-error[title]`, `.wb-editor__diag-inline`,
`.wb-editor__tab.has-errors`, `[role=status].wb-sr-only`.

| Id | Case | Expected |
|---|---|---|
| E-D1 | In `DE1_SoC.vhdl` delete the `;` of `LEDR <= SW;` (line 27), Start | console as before; that line tinted red; gutter ✕ with the GHDL message in its tooltip; inline message; caret on that line; tab dot; status text names the error |
| E-D2 | then type one character anywhere in the file | all markers of the file gone |
| E-D3 | recreate E-D1, then **click** in the text (no typing) | markers gone |
| E-D4 | recreate E-D1, then click a **line number** | markers gone |
| E-D5 | error in a file whose tab is closed | the tab opens, becomes active, scrolled to the line |
| E-D6 | Verilog: in `DE1_SoC.v` remove the `;` of `assign LEDR = SW;` (line 19) | red on line 19 (`Syntax error in left side of continuous assignment.`) **and** on line 23 (`syntax error`, tooltip shows the hint); caret on line 19 |
| E-D7 | Verilog: assign to a `wire` from `always` (A.5 `regassign`) | red on the assign line; tooltip includes `LEDR is declared here as wire.`; the declaration line is **not** marked |
| E-D8 | Verilog: implicit wire (A.5 `warn.v`) | amber on that line, run **still starts**, view not moved |
| E-D9 | VHDL portless testbench with `assert false report "x" severity error;` | red on the assert line when it fires; view not moved |
| E-D10 | `LEDR` declared `(7 downto 0)` (A.4 wrapper error) | console shows the internal error; **no** marker anywhere |
| E-D11 | press Start again after E-D1 without fixing | old markers cleared, then the same line marked again |
| E-D12 | start a compile, type in the file before it finishes | no markers appear in that file |
| E-D13 | console **Clear** after E-D1 | markers stay |
| E-D14 | (phase 4) click the error line in the console | file opens at the line; markers unchanged |

---

## 7. Implementation steps

Each step says what to change and when it is done. Write the step's tests first
and see them fail. One commit per phase, titled `Diagnostics <phase>: <title>`,
ending with the repository's attribution line. Never commit with a red test.

### Phase 0 — Confirm the input

| Step | Do | Done when |
|---|---|---|
| 0.1 | On a machine with **GHDL 5.0.1 or 6.0.0** (the shipped versions) and Icarus 13.0, re-run the captures of Appendix A with the commands shown there. | Every line differs from Appendix A only in the program path. If a format differs, update the recognizers **before** phase 1 and note it in this document. |
| 0.2 | Read `src/components/workbench/CodeEditor.tsx`, `Workbench.tsx` (`getClient`, `handleStart`, `handleContentChange`, `handleOpenFile`, `handleDeleteFile`), `ConsoleOutput.tsx`. | You can point at where each row of the § 4.5 lifecycle table will be wired. |

### Phase 1 — Pure parsing (no UI)

| Step | Do | Done when |
|---|---|---|
| 1.1 | Create `diagnostics.fixtures.ts` from Appendix A (SPDX header; one exported `const` per case, with a comment naming the tool, version and command). Split the combined blocks A.1 and A.5 at each file's first line, so each case is its own constant (e.g. `ICARUS_REGASSIGN` holds the three `regassign` lines). | Compiles; every line of Appendix A is in exactly one constant. |
| 1.2 | Create `diagnostics.ts` with the § 4.1 `Diagnostic` types and the § 4.2 `LineResult`, `Recognizer`, `RECOGNIZERS`, `recognizeLine`. | P-1…P-36 pass. |
| 1.3 | Add `parseDiagnostics` with § 4.3. | T-1…T-14 pass. |
| 1.4 | Create `diagnosticLocation.ts`: `RunSnapshot`, `LocatedDiagnostic`, `resolveFileId`, `isLineInFile`, `locateDiagnostics`, `firstRevealTarget` (§ 4.4). | L-1…L-11 pass. |
| 1.5 | Create `diagnosticStore.ts`: § 4.5 functions and constants, plus `offsetOfLine`. | S-1…S-17 pass; `npm run typecheck` clean; § 5 lint command reports nothing. |

### Phase 2 — State and rendering

| Step | Do | Done when |
|---|---|---|
| 2.1 | Create `useDiagnostics.ts` (§ 4.10). | Typecheck clean. |
| 2.2 | Add the colour tokens and `.wb-sr-only` to `Workbench.css` (§ 4.6, § 4.8). | — |
| 2.3 | `CodeEditor`: new props `diagnostics: DiagnosticsByFile` and `onDismissDiagnostics(fileId: string)`. Build `const linesByNumber = useMemo(() => new Map(activeLines.map(d => [d.line, d])), [activeLines])`. Pass `diagnostic={linesByNumber.get(i + 1)}` to `HighlightedLine`, which renders the classes and the inline span (§ 4.6). | Markers render when a hard-coded test value is passed (remove it afterwards). |
| 2.4 | Extract `EditorGutter` (props: `lines: string[]`, `linesByNumber`, `gutterRef`); add the marker classes and `title` (§ 4.6). | Same rendering as before when there are no diagnostics. |
| 2.5 | Tab classes and hidden count text (§ 4.6); status paragraph and `aria-describedby` (§ 4.8). | — |
| 2.6 | On `.wb-editor__body` add `onPointerDown={() => { if (active && activeLines.length > 0) onDismissDiagnostics(active.id); }}`. | Clicking text or a line number clears the active file only. |
| 2.7 | CSS of § 4.6 in `CodeEditor.css`, including `--wb-code-pad-x`. | Screenshot: a tinted line lines up exactly with the textarea text (type on that line; the caret stays on the characters). |

### Phase 3 — Wiring in `Workbench`

| Step | Do | Done when |
|---|---|---|
| 3.1 | `const diagnostics = useDiagnostics();` Pass `diagnostics={diagnostics.byFile}` and `onDismissDiagnostics={diagnostics.dismissFile}` to `CodeEditor`. | Typecheck clean. |
| 3.2 | `handleStart`: after the existing `const topFile = files.find((f) => f.id === topFileId);` and before `getClient().run(...)`, call `diagnostics.startRun({ files, preferredFolder: sourceFolderFor(topFile) })` (`sourceFolderFor` is in `fileKinds.ts`; it is the same folder `GhdlClient.run` sends). | E-D11. |
| 3.3 | Move `filesRef` (with its `filesRef.current = files` line) above `getClient`, then in `getClient` add: `onLog: (text) => { appendLog(text); diagnostics.record(text, filesRef.current); }` and, in `onError`, after `appendLog`: `const located = diagnostics.record(text, filesRef.current); if (REVEALING_STAGES.includes(stage)) revealFirstError(located);` with `const REVEALING_STAGES: readonly string[] = ['analyze', 'elaborate'];` at module level. Add `diagnostics.record` and `revealFirstError` to `getClient`'s dependency list. | E-D1, E-D6, E-D8, E-D9, E-D10. |
| 3.4 | `handleContentChange`: add `diagnostics.dismissFile(id)`. `handleDeleteFile`: same. | E-D2, E-D12. |
| 3.5 | `revealFirstError` and `reveal` state (§ 4.7); `useRevealLine`; pass `reveal` to `CodeEditor`. | E-D1 caret, E-D5. |
| 3.6 | Run the full runbook § 6.4 (E-D1…E-D13). | All pass; record the results and date in `tests/e2e/editor-diagnostics.md`. |

### Phase 4 — Console links (recommended)

| Step | Do | Done when |
|---|---|---|
| 4.1 | `locateText` in `useDiagnostics`; `locate` / `onOpenLocation` props on `ConsoleOutput`; `revealLocation` in `Workbench` (§ 4.9). | E-D14. |
| 4.2 | Update `src/components/workbench/README.md`: a short "Error markers" section (what is parsed, the lifecycle table of § 4.5, where the code is). | Section exists. |

### Phase 5 — Optional refinements (only if asked)

- 5.1 Underline the token at GHDL's column (`column` is already parsed): a `<span class="wb-editor__diag-token">` around the word starting at that column inside `HighlightedLine`, with `text-decoration: underline wavy var(--wb-diag-error)`.
- 5.2 F8 / Shift+F8 to jump to the next or previous marked line in the active file (B7).
- 5.3 Badge in the Files panel for files with markers.
- 5.4 Backend: forward GHDL analysis warnings of a *successful* analysis as `LOG` lines (§ 2.1, § 8 #3).

---

## 8. Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | Add F8 navigation now? | Later (phase 5.2). A student usually has one or two errors, and the reveal plus console links cover it. |
| 2 | Should warnings be marked at all, or only errors? | Mark them in amber. They are real problems (an implicit wire is usually a typo), and the colour keeps them distinct. |
| 3 | GHDL warnings on successful analysis are discarded by the backend (`analyzeFile`). Forward them? | Yes, as a small backend change (phase 5.4). It is the only case where VHDL and Verilog behave differently. |
| 4 | Should clicking the *tab strip* also clear markers? | No. The tab strip is navigation, not "the code pane"; switching tabs to read another file's errors must not erase them. |
| 5 | Should markers survive a page reload in the desktop app? | No. Diagnostics describe one run; the workspace store (`desktop.ts`) should not hold them. |
| 6 | The branch `feature/resizable-dividers` also changes `Workbench.tsx` and `Workbench.css`. | If it is merged first, nothing in this plan changes: the functions named here are the same on both branches. |

---

## Appendix A: real simulator output (test fixtures)

Captured on 2026-09-29 with GHDL 4.1.0 (mcode) and Icarus Verilog 12.0 (Ubuntu
24.04), each tool run the way the backend runs it: `cwd` = the directory holding
the files, bare file names, `ghdl -a --std=08 <file>`, `ghdl -e --std=08 <unit>`,
`ghdl -r --std=08 <unit>`, and `iverilog -Wall -Wno-timescale -I. -s <top> -o
sim.vvp _hdlboard_ts.v <files>`, then `vvp -n -i sim.vvp`. Output is verbatim,
stdout and stderr interleaved in arrival order. The source files are shown
before each capture where the line numbers matter.

### A.1 GHDL analysis (`ghdl -a`)

`syntax.vhdl` line 13 is `    LEDR <= SW` (missing `;`); `undeclared.vhdl` line
13 is `    LEDR <= SWX;` and line 14 `    LEDR(0) <= '2';`; `typeerr.vhdl` line 14
is `    LEDR <= count;` (integer to a vector) and line 15
`    LEDR(3 downto 0) <= SW;`; `space name.vhdl` is a single line
`entity spaced is end entity`.

```
syntax.vhdl:13:15:error: ';' expected at end of signal assignment
    LEDR <= SW
              ^
syntax.vhdl:13:15:error: (found: 'end')
undeclared.vhdl:13:13:error: no declaration for "swx"
    LEDR <= SWX;
            ^
undeclared.vhdl:14:16:error: can't match character literal '2' with type STD_ULOGIC
    LEDR(0) <= '2';
               ^
typeerr.vhdl:14:13:error: can't match "count" with type array type "STD_ULOGIC_VECTOR"
    LEDR <= count;
            ^
typeerr.vhdl:15:25:warning: value constraints don't match target ones [-Wruntime-error]
    LEDR(3 downto 0) <= SW;
                        ^
space name.vhdl:1:28:error: missing ";" at end of entity
entity spaced is end entity
                           ^
```

### A.2 GHDL elaboration (`ghdl -e`)

`comp.vhdl` instantiates a component with no matching entity (line 9); the
second command names a unit that does not exist.

```
comp.vhdl:9:5:warning: instance "u0" of component "missing_thing" is not bound [-Wbinding]
    u0 : missing_thing port map ( a => SW(0) );
    ^
comp.vhdl:6:14:warning: (in default configuration of comp(rtl))
/usr/bin/ghdl-mcode:error: cannot find entity or configuration nosuch
```

### A.3 GHDL runtime (`ghdl -r`) — reports and assertions (stdout)

```vhdl
-- tb.vhdl, lines 6-9 inside a process
        report "hello from tb";
        assert false report "warning level" severity warning;
        assert 1 = 2 report "values differ" severity error;
        assert false report "fatal stop" severity failure;
```

```
tb.vhdl:6:9:@0ms:(report note): hello from tb
tb.vhdl:7:9:@0ms:(assertion warning): warning level
tb.vhdl:8:9:@0ms:(assertion error): values differ
tb.vhdl:9:9:@0ms:(assertion failure): fatal stop
ghdl:error: assertion failed
ghdl:error: simulation failed
```

Runtime check failure (`bound.vhdl` line 9: `a(i) := 1;` with `i = 5` on a
`0 to 3` array):

```
ghdl:error: index (5) out of bounds (0 to 3) at bound.vhdl:9
ghdl:error: simulation failed
```

### A.4 GHDL — the generated board wrapper does not fit the student's entity

Entity `narrow` declares `LEDR : out std_logic_vector(7 downto 0)`; the wrapper
is `server/src/tbTemplate.ts`'s real output. In the app this text arrives in an
`ERROR` frame of stage `internal`, after `Internal testbench build error:`.

```
hdl_board_tb.vhdl:55:15:error: actual constraints don't match formal ones
      ledr => ledr_sig
              ^
```

### A.5 Icarus Verilog compile (`iverilog`)

In order: `syntax.v` (line 6 lacks `;`), `undeclared.v` (lines 5–6 use
undeclared names), `regassign.v` (line 5 assigns a `wire` from `always`; line 3
declares it), `inc.v` (line 3 uses an undefined macro; `defs.vh` line 2 lacks
`;`), `sp ace.v` (a file name with a space: `module spc(input a); assign b = ;
endmodule`), `sorry.v` (line 5 uses `disable fork`), `unk.v` (line 2
instantiates a module that does not exist), `miss.v` (line 1 includes a missing
header; Icarus reports it on line 2), `warn.v` (a successful compile with one
warning). Each file was compiled on its own; the outputs follow one another.

```
syntax.v:6: syntax error
I give up.
undeclared.v:5: error: Unable to bind wire/reg/memory `SWX' in `undeclared'
undeclared.v:5: error: Unable to elaborate r-value: SWX
undeclared.v:6: error: Unable to bind wire/reg/memory `foo' in `undeclared'
undeclared.v:6: error: Unable to bind wire/reg/memory `bar' in `undeclared'
undeclared.v:6: error: Unable to elaborate r-value: (foo)&(bar)
5 error(s) during elaboration.
regassign.v:5: error: LEDR is not a valid l-value in regassign.
regassign.v:3:      : LEDR is declared here as wire.
Elaboration failed
inc.v:3: warning: macro WIDTHX undefined (and assumed null) at this point.
./defs.vh:2: syntax error
I give up.
sp ace.v:1: syntax error
sp ace.v:1: error: Syntax error in continuous assignment
sorry.v:5: error: 'disable fork' requires SystemVerilog.
1 error(s) during elaboration.
unk.v:2: error: Unknown module type: missing_mod
2 error(s) during elaboration.
*** These modules were missing:
        missing_mod referenced 1 times.
***
miss.v:2: Include file nope.vh not found
error: Unable to find the root module "miss" in the Verilog source.
     : Perhaps ``-s miss'' is incorrect?
1 error(s) during elaboration.
warn.v:6: warning: implicit definition of wire 'nothere'.
```

### A.6 Icarus Verilog runtime (`vvp -n -i sim.vvp`, stdout)

```verilog
// tb.v, lines 4-9
        $display("hello from tb");
        $warning("careful: %0d", 3);
        $error("values differ");
        r = 4'bxxxx;
        if (r !== 4'b0) $display("r is %b", r);
        $fatal(1, "fatal stop");
// tb2.v: line 4 $finish; line 8 $readmemh("nofile.hex", mem);
```

```
hello from tb
WARNING: tb.v:5: careful: 3
         Time: 0  Scope: tb
ERROR: tb.v:6: values differ
       Time: 0  Scope: tb
r is xxxx
FATAL: tb.v:9: fatal stop
       Time: 0  Scope: tb
start
tb2.v:4: $finish called at 0 (1ps)
ERROR: tb2.v:8: $readmemh: Unable to open nofile.hex for reading.
```

### A.7 A missing `;` in the starter designs

`tests/fixtures/verilog/DE1_SoC.v` with the `;` of line 19 (`assign LEDR = SW;`)
removed. Lines 20–22 are a blank line and two comments; line 23 is the next
statement:

```
DE1_SoC.v:23: syntax error
DE1_SoC.v:19: error: Syntax error in left side of continuous assignment.
```

`tests/fixtures/vhdl/DE1_SoC.vhdl` with the `;` of line 27 (`LEDR <= SW;`)
removed:

```
DE1_SoC.vhdl:27:15:error: ';' expected at end of signal assignment
    LEDR <= SW
              ^
DE1_SoC.vhdl:27:15:error: (found: an identifier)
```

Missing include on a later line (`inc3.v`, the `` `include "nope.vh"`` on line
3):

```
inc3.v:4: Include file nope.vh not found
inc3.v:3: syntax error
```

---

## Appendix B: sources

- Clean Code summary (the code standard of § 5): <https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29>
- Language Server Protocol 3.17, `Diagnostic`, `DiagnosticSeverity`, `DiagnosticRelatedInformation`: <https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/types/diagnostic.md>
- VS Code tasks and problem matchers (gcc pattern, `fileLocation`, multi-line patterns): <https://github.com/microsoft/vscode-docs/blob/main/docs/debugtest/tasks.md>
- CodeMirror 6 lint (`Diagnostic`, `lintGutter`, `nextDiagnostic` on F8, position mapping through changes): <https://github.com/codemirror/lint/blob/main/src/lint.ts>
- VS Code "Go to Next Problem" (`editor.action.marker.next`, F8): <https://github.com/microsoft/vscode/issues/105795>
- Error Lens (inline messages, whole-line tint by severity): <https://github.com/usernamehw/vscode-error-lens>
- WCAG 2.1 SC 1.4.1 Use of Color: <https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html>
- WCAG 2.1 SC 3.3.1 Error Identification: <https://www.w3.org/WAI/WCAG21/Understanding/error-identification.html>
- GHDL, Invoking GHDL — diagnostics control (`-fcaret-diagnostics`, `-fdiagnostics-show-option`): <https://github.com/ghdl/ghdl/blob/master/doc/using/InvokingGHDL.rst>
- Icarus Verilog "syntax error / I give up." format (bug reports): <https://sourceforge.net/p/iverilog/bugs/335/>
- This repository: `docs/Verilog_implementation_plan.md` § 5.5 and Appendix B (Icarus 13.0 output), `docs/ghdl_implementation_plan.md` § 6 (wire protocol), `server/src/engines/ghdlEngine.ts`, `server/src/verilog/process.ts`, `server/src/session.ts`.
