# Editor Diagnostics — Research: advice for Icarus Verilog messages

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: research, not a plan yet (2026-09-30).** This is the "measure first" step that
[`editor_diagnostics_improvement_plan.md`](editor_diagnostics_improvement_plan.md) § 4.12
asks for before any Verilog advice is designed. Every message below was produced by running
the real tools with the backend's exact flags on the starter `tests/fixtures/verilog/blinkTest.v`,
one mistake at a time:

- **Icarus Verilog 13.0** (Ubuntu package `iverilog 13.0-2`, the version the Windows app and
  the Docker image ship), and **Icarus 12.0** (Ubuntu 24.04) for comparison;
- `iverilog -Wno-timescale -I. -s blinkTest -tstub -o ports.stub _hdlboard_ts.v blinkTest.v`
  (the port-dump step, which is where every compile error is first reported), then, when that
  passes, `iverilog -Wall -Wno-timescale -I. -s blinkTest -o sim.vvp …` (the full compile);
- **Verilator 5.020** `--lint-only -Wall` on six of the cases, as a comparison of what a
  second tool would add (§ 5).

Appendix A has the complete Icarus 13.0 output.

## Contents

- [1. Summary](#1-summary)
- [2. What Icarus prints (measured)](#2-what-icarus-prints-measured)
- [3. How the GHDL rules carry over](#3-how-the-ghdl-rules-carry-over)
- [4. Expected result on the corpus](#4-expected-result-on-the-corpus)
- [5. Alternatives considered](#5-alternatives-considered)
- [6. Recommendation and next steps](#6-recommendation-and-next-steps)
- [7. Open decisions](#7-open-decisions)
- [Appendix A: Icarus 13.0 output](#appendix-a-icarus-130-output)

---

## 1. Summary

| # | Finding | Consequence |
|---|---|---|
| F1 | Icarus **never prints a column**, and its syntax errors are the bare `file:line: syntax error`. | No underline at a known token. Advice must work at line level: scan the reported line and the previous code line. |
| F2 | A misspelled keyword at the start of a statement (`alwyas`, `rge`, `localparm`, `assgin`) is read as a **module instance**, and Icarus says `error: Invalid module instantiation`. | This is Icarus's equivalent of GHDL's misleading words: the student never wrote an instance. A keyword suggestion fixes it (Rule B at line level). |
| F3 | The reported line is often **one code line late**: `begn` on 31 → reported on 32; `edn` on 37 → 38; missing `;` on 22 → 26 (after comments); missing `;` on 41 → 45. | Rule D carries over unchanged ("previous code line looks unfinished"), and Rule B must also look at the previous code line. |
| F4 | A misspelled **port or wire on the left of `assign`** (`assign LEDRR = …`) is **not an error**: Icarus creates an implicit wire, the compile succeeds, and only the `-Wall` compile warns `implicit definition of wire 'LEDRR'`. The LEDs simply stay dark. | The most dangerous beginner mistake in the corpus. Two fixes, § 3 Rule G: suggest the declared name on that warning, and/or compile with `` `default_nettype none `` (measured: it turns this into `error: Net LEDRR is not defined in this context.`). |
| F5 | Undeclared names give `Unable to bind wire/reg/memory `conter' in `blinkTest'`, which names the word exactly. | Rule C carries over directly ("did you mean `counter`?"). |
| F6 | Icarus 13.0 gives **misleading advice itself**: assigning a `reg` with `assign` says `This is allowed when SystemVerilog is enabled.` | A beginner-facing rewrite ("`led_state` is a `reg`: drive it in an `always` block, or declare it as `wire`"). |
| F7 | Cascades are shorter than GHDL's (at most 7 lines), and their follow-on messages have fixed words: `Invalid module instantiation`, `Invalid module item.`, `Syntax in assignment statement l-value.`, `I give up.`, and a bogus `blinkTest.v:1: …` line. | Rule F carries over with a Verilog lost-place list. |
| F8 | Icarus 12.0 and 13.0 print **identical text for 30 of 33 cases**; they differ in three cascades and in the wording of the two `reg`/`wire` misuse errors (Appendix A.3). | Recognise by stable fragments, and keep both versions in the golden corpus, as the markers plan already does. |
| F9 | Verilator gives columns but reports the **same late lines** (`32:9` for `begn`, `26:5` for the missing `;`) and similar `syntax error, unexpected …` words. | Not worth a second bundled tool for this; § 5. |

**Recommendation:** yes, the same approach works for Verilog, with line-level rules. It should
reuse `diagnosticAdvice.ts`'s structure: the rule table, the edit distance, the store, the wording
module and the hint marker. It needs a Verilog word list, a Verilog `declaredNames`, and one new
rule (G, implicit wires). It needs no backend change, except the optional `default_nettype`
decision of § 7.

---

## 2. What Icarus prints (measured)

### 2.1 The corpus

33 files: 13 misspelled keywords, 8 missing or wrong punctuation or `begin`/`end`, 4 undeclared
names, 2 `reg`/`wire` misuses, `elseif`/`endif`, and 2 files with two mistakes.
"Reported" is the line of the first message Icarus prints. "Late" means later than the mistake.

| Id | Mistake (line) | Reported | What Icarus says first | Assessment |
|---|---|---|---|---|
| module-typo | `modul` (6) | 6 | `syntax error` / `I give up.` | line right, words empty |
| input-typo | `inptu` (8) | 8 | `syntax error` + `1: Errors in port declarations.` | line right; bogus line 1 |
| output-typo | `ouput` (10) | 10 | same | same |
| wire-typo | `wrie` (8) | 8 | same | same |
| reg-typo | `rge` (29) | 29 | `syntax error` + `Invalid module instantiation` | **words wrong** (F2) |
| localparam-typo | `localparm` (22) | 22 | same | **words wrong** |
| always-typo | `alwyas` (31) | 31 | same, + 4 cascade lines | **words wrong**, cascade |
| assign-typo | `assgin` (41) | 41 | same | **words wrong** |
| posedge-typo | `posedeg` (31) | 31 | `Malformed event control expression.` | words vague |
| begin-typo | `begn` (31) | **32** | `syntax error`, + 6 cascade lines | **late**, cascade |
| end-typo | `edn` (37) | **38** | `syntax error`, `41: Syntax in assignment statement l-value.`, `51: syntax error` | **late**, cascade |
| else-typo | `esle` (35) | 35 | `syntax error`, + 3 cascade | line right |
| endmodule-typo | `endmodul` (51) | **52** | `syntax error` / `I give up.` | late (past the last line of code) |
| endmodule-missing | none (51) | **52** | same | late |
| end-missing | `end` of `always` (38) | **51** | `syntax error` / `I give up.` | **13 lines late** |
| begin-missing | `begin` (31) | **38** | `syntax error`, `41: Invalid module item.` | 7 lines late |
| semicolon-assign | `;` (41) | 45 **and** 41 | `45: syntax error`, `41: Syntax error in left side of continuous assignment.` | 41 is right (the markers plan already reveals the lowest line) |
| semicolon-nonblocking | `;` (33) | **34** | `syntax error`, `Syntax in assignment statement l-value.` | late by one |
| semicolon-decl | `;` (29) | **31** | `syntax error`, `1: error: Syntax error in variable list.`, + 5 | late, bogus line 1, cascade |
| semicolon-localparam | `;` (22) | **26** | `syntax error`, `Invalid module item.` | late (comments between) |
| paren-missing | `)` (31) | 31 | `Malformed event control expression.`, + 6 | line right |
| assign-reversed | `=<` (33) | 33 | `syntax error`, `Malformed statement` | line right, words vague |
| compare-assign | `=` for `==` (32) | 32 | `syntax error`, `Malformed conditional expression.` | line right, words vague |
| undeclared-counter | `conter` (36) | 36 | `Unable to bind wire/reg/memory `conter'` | right, no suggestion |
| undeclared-led | `led_stat` (34) | 34 | same shape | right, no suggestion |
| undeclared-clock | `CLOCK_50Hz` (31) | 31 | same, + `Failed to evaluate event expression` | right, no suggestion |
| undeclared-port | `LEDRR` on the left of `assign` (41) | — | **compiles**; full compile warns `implicit definition of wire 'LEDRR'` | **silent bug** (F4) |
| assign-to-reg | `assign led_state` (41) | 41 | `Variable 'led_state' cannot be driven by a continuous assignment/module.` + note `This is allowed when SystemVerilog is enabled.` | **advice wrong for a beginner** (F6) |
| wire-in-always | `led_state` declared `wire` (29) | 34 | `'led_state' is not a valid l-value …` + note `declared here as a wire` (29) | right, and names the declaration |
| elseif | `elseif` (35) | 35 | `syntax error`, + 3 | line right, words empty |
| endif | `endif` (37) | **38** | `syntax error`, + 2 | late |
| two-mistakes | `alwyas` (31) + missing `;` (41) | 31 … 45 | both reported (the second as `45: Invalid module item.`) | second mistake visible, but with a misleading message |
| two-semantic | `conter` (36) + `LEDRR` (41) | 36 | only `conter`: the port dump stops at the first elaboration error, and `LEDRR` is never reported | second mistake invisible until the first is fixed |

### 2.2 In short

- **Line right, words empty or wrong: 16.** A misspelled keyword is nearly always on the reported line.
- **Line late: 12.** 9 are "one code line late" (comments do not count). 3 are far: a missing
  `end` (13 lines), a missing `begin` (7 lines), and anything that runs into `endmodule`.
- **Right as printed: 4** (the `Unable to bind` family names the word, `wire-in-always` names the declaration).
- **Silent: 1** (implicit wire, F4).

### 2.3 Icarus 12.0 versus 13.0

Identical for 30 of 33 cases. The differences (Appendix A.3): the `paren-missing` cascade,
and the wording of `assign-to-reg` and `wire-in-always`. Icarus 12.0 says
`reg led_state; cannot be driven by primitives or continuous assignment.` and
`led_state is not a valid l-value in blinkTest.` Rules must key on stable fragments
(`cannot be driven`, `not a valid l-value`), not whole sentences.

---

## 3. How the GHDL rules carry over

The GHDL rules keep their letters. What changes is the input: a line, not a column.

| Rule | GHDL (built) | Icarus (proposed) | Measured cases it serves |
|---|---|---|---|
| A — underline | the token at GHDL's column | **none by default.** Underline only when another rule names a word (B, C, G) | — |
| B — misspelled keyword | tokens within 3 of the caret | every identifier on the **reported line, then the previous code line**, left to right, with the same exclusions: not a keyword, not a system/library name, not declared anywhere in the project, ≥ 4 letters, same first letter, OSA distance ≤ 1 (≤ 2 from 6 letters), exactly one nearest keyword | module, input, output, wire, reg, localparam, always, assign, posedge, begin (late by one), else, endmodule (late by one); `rge` needs the 3-letter exception of Rule C |
| C — undeclared name | `no declaration for "x"` | `Unable to bind wire/reg/memory `x'` and `Net x is not defined in this context.`: nearest name declared in the same file, then keywords | undeclared-counter, -led, -clock |
| D — cause on the previous line | caret at the first word of the line | the reported line's **first code token is a statement start** (`assign`, `always`, `if`, `else`, `end`, `reg`, `wire`, `localparam`, `endmodule`, an identifier followed by `<=`/`=`), and the previous code line does not end in `;`, `begin`, `end`, `)` of an `if`/`always` header, or `,` | semicolon-nonblocking, -localparam, -assign (45 → 41, which Icarus also reports), -decl |
| E — joined keywords | `endif`, `endcase`, … as the first word of a line | Verilog's table: `endif` → `end`, `elseif`/`elsif` → `else if`, `endalways` → `end`, `endbegin` → `end`, `end module` → `endmodule` (the opposite direction) | elseif, endif |
| F — follow-on muting | same-line and lost-place messages after a syntax error | same, with the Verilog lost-place list: `I give up.`, `Invalid module instantiation` and `Invalid module item.` after a syntax error, `Syntax in assignment statement l-value.` on a later line, and **any message on line 1** (`Errors in port declarations.`, `Syntax error in variable list.`), which is never where the mistake is | always-typo (6 → 2), begin-typo (7 → 2), semicolon-decl (7 → 2) |
| **G — implicit wire (new)** | — | on the `-Wall` warning `implicit definition of wire 'x'`: if `x` is within edit distance of a declared name, headline *`LEDRR` is not declared — did you mean `LEDR`? Verilog made a new, unconnected wire.* | undeclared-port (F4) |
| **H — beginner rewrite of Icarus's own advice (new)** | — | `cannot be driven by a continuous assignment` → *`led_state` is a `reg`: drive it inside an `always` block, or declare it as `wire`.* | assign-to-reg (F6) |

Three points need care, from the measurements:

1. **Rule B without a caret is a whole-line scan**, which is what caught `signed` in the GHDL
   review (§ 2.7 there). The window is small in Verilog because statements are short, but the
   exclusions must be complete: Verilog system names (`$display`, `$clog2`, …) are excluded by
   the `$`, and the corpus identifiers (`CLOCK_500Hz`, `counter`, `led_state`, `SW`, `LEDR`, …)
   are declared. A Verilog version of the § 6.2 guard lists (every identifier of the Verilog
   starters, 100 typical names declared in another file) must pass before the rule ships.
2. **Late reports vary**, and nothing in the text says when Icarus is late. Rule B looks at the
   previous code line only if the reported line has no candidate. Rule D fires only when its
   structural test passes. Neither moves the marker. They add a hint on the other line, as for GHDL.
3. **The far cases (missing `end`, missing `begin`, anything at `endmodule`) are not solvable by
   these rules.** A begin/end balance count per `always` block would find the missing `end`
   (13 lines late). It is a small pure function but a new kind of rule, so it is kept for a later phase (§ 6).

---

## 4. Expected result on the corpus

What the rules of § 3 would show, derived by hand from Appendix A (to be confirmed by a golden
test, as for GHDL).

| Result | Cases | Count |
|---|---|---|
| Headline naming the real mistake | module, input, output, wire, reg\*, localparam, always, assign, posedge, begin, else, endmodule-typo, semicolon-nonblocking, semicolon-localparam, semicolon-decl, undeclared-counter, -led, -clock, undeclared-port (G), assign-to-reg (H), elseif, endif | 22 |
| Right as printed | semicolon-assign (line 41 already says it), wire-in-always | 2 |
| Still vague | end-typo (`edn`: 3 letters, first letter kept, but the reported line 38 is `end` and 37 is `edn` → Rule B on the previous line catches it if 3-letter words are allowed for `end`), paren-missing, assign-reversed, compare-assign, endmodule-missing, end-missing, begin-missing | 7 |

\* `rge` → `reg` needs 3-letter candidates, as Rule C allows; `edn` → `end` likewise. Whether
Rule B should take 3-letter words for Verilog (short keywords `reg`, `end`, `wire`) is § 7 #2.

Operator mistakes (`=<`, `=` for `==`) keep Icarus's words (`Malformed statement`,
`Malformed conditional expression`). They are line-accurate, and the plan's phase 6
"operator typos" would cover both languages.

---

## 5. Alternatives considered

| Alternative | Measured / found | Verdict |
|---|---|---|
| **Verilator `--lint-only`** as a second opinion | Gives a column and the unexpected token (`31:12: syntax error, unexpected '@', expecting IDENTIFIER` for `alwyas`), but the **same late lines** (`32:9` for `begn`, `26:5` and `45:5` for missing `;`) and the same kind of parser words. It needs a C++ toolchain on Windows and a second process per Start. | Declined: the column would help Rule A, but not enough to justify a second bundled tool. |
| **slang** / **Surelog** (SystemVerilog front ends with excellent diagnostics) | Not measured; not packaged on Ubuntu 24.04. Would be a new dependency on every platform. | Out of scope; revisit if Verilog becomes the main course language. |
| **Icarus flags** | Icarus has no column or caret option. `-Wall` is already used for the full compile; the `-tstub` step runs without it, which is why `implicit definition` never appears when another error stops the stub (two-semantic). | Keep; see `default_nettype` below. |
| **`` `default_nettype none ``** in the generated `_hdlboard_ts.v` | Turns the silent LEDRR bug into `error: Net LEDRR is not defined in this context.`, caught at the stub step. But it also makes every legitimate implicit net an error, and every student file after it inherits it. | Promising: § 7 #1. Needs a check that the starter designs, `tb_counter8.v` and the generated board wrapper compile with it. |
| **Parsing `vvp` runtime messages** for advice | `$error`/`$fatal` lines are the student's own text (as GHDL reports). | No advice, as for GHDL (§ 4.12 there). |

---

## 6. Recommendation and next steps

Do it as a separate plan, `editor_diagnostics_verilog_plan.md`, in the same vertical slices:

0. **Corpus:** extend `tools/ghdl-typo-corpus.mjs` (or add `tools/iverilog-typo-corpus.mjs`)
   with the 33 mutations of § 2.1, running the backend's two `iverilog` steps, and generate
   `diagnostics.verilog.corpus.ts` for Icarus 13.0 and 12.0 separately (they differ, § 2.3).
1. **Helpers:** `verilogWords.ts` (IEEE 1364-2005 keywords; SystemVerilog-only words never
   suggested, like PSL for VHDL), `declaredNamesVerilog` (ports, `wire`/`reg`/`integer`/`localparam`/`parameter`
   names, module and instance names, `genvar`). `osaDistance` and the store are reused.
2. **Rules B, C, G, H** at line level, with the Verilog § 6.2 guards; golden rows for § 4.
3. **Rules D, E** with the hint marker (unchanged UI).
4. **Rule F** with the Verilog lost-place list, including line-1 messages.
5. Later, if asked: the begin/end balance rule for the far cases, and `default_nettype`.

`diagnosticAdvice.ts` would pick its rule table by file extension (`.v`/`.vh` → Verilog rules),
which keeps the parser's "shape only" principle: the parser still does not know which tool ran,
and the advice layer already knows the language of each file from the snapshot.

---

## 7. Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | Add `` `default_nettype none `` to `_hdlboard_ts.v`? | Measure the starters and the wrapper first. If they pass, yes: a silent typo in a port name is worse than any message. Otherwise Rule G alone. |
| 2 | Allow 3-letter words in Verilog Rule B (`rge` → `reg`, `edn` → `end`)? | Yes, for the reserved words of 3 letters only, and only when the word is not declared: Verilog's core keywords are short. The guard lists must include 3-letter student names (`clk`, `rst`, `cnt`, `sum`, `led`). |
| 3 | Rule B on the previous code line too? | Yes, but only when the reported line has no candidate (begin-typo, end-typo, endif). |
| 4 | Remove Icarus's `This is allowed when SystemVerilog is enabled.` note from the tooltip? | No: keep the compiler's words (D1 of the improvement plan), and put Rule H's headline first. |

---

## Appendix A: Icarus 13.0 output

### A.1 Commands

```
iverilog -Wno-timescale -I. -s blinkTest -tstub -o ports.stub _hdlboard_ts.v blinkTest.v
iverilog -Wall -Wno-timescale -I. -s blinkTest -o sim.vvp _hdlboard_ts.v blinkTest.v   (only when the first passes)
```

`_hdlboard_ts.v` is `` `timescale 1ns/1ps ``, as the backend writes it. The mutated line is
given after each id.

### A.2 Output (stdout and stderr, in order)

```
### module-typo  6: module → modul
blinkTest.v:6: syntax error
I give up.
### input-typo  8: input → inptu
blinkTest.v:8: syntax error
blinkTest.v:1: Errors in port declarations.
### output-typo  10: output → ouput
blinkTest.v:10: syntax error
blinkTest.v:1: Errors in port declarations.
### wire-typo  8: wire → wrie
blinkTest.v:8: syntax error
blinkTest.v:1: Errors in port declarations.
### reg-typo  29: reg → rge
blinkTest.v:29: syntax error
blinkTest.v:29: error: Invalid module instantiation
### localparam-typo  22: localparam → localparm
blinkTest.v:22: syntax error
blinkTest.v:22: error: Invalid module instantiation
### always-typo  31: always → alwyas
blinkTest.v:31: syntax error
blinkTest.v:31: error: Invalid module instantiation
blinkTest.v:34: error: Invalid module instantiation
blinkTest.v:36: error: Invalid module item.
blinkTest.v:37: syntax error
blinkTest.v:41: error: Invalid module item.
### posedge-typo  31: posedge → posedeg
blinkTest.v:31: syntax error
blinkTest.v:31: error: Malformed event control expression.
blinkTest.v:31: error: Invalid event control.
### begin-typo  31: begin → begn
blinkTest.v:32: syntax error
blinkTest.v:33: Syntax in assignment statement l-value.
blinkTest.v:34: syntax error
blinkTest.v:34: error: Invalid module instantiation
blinkTest.v:36: error: Invalid module item.
blinkTest.v:37: syntax error
blinkTest.v:41: error: Invalid module item.
### end-typo  37: end → edn
blinkTest.v:38: syntax error
blinkTest.v:41: Syntax in assignment statement l-value.
blinkTest.v:51: syntax error
I give up.
### else-typo  35: else → esle
blinkTest.v:35: syntax error
blinkTest.v:36: Syntax in assignment statement l-value.
blinkTest.v:38: syntax error
blinkTest.v:41: error: Invalid module item.
### assign-typo  41: assign → assgin
blinkTest.v:41: syntax error
blinkTest.v:41: error: Invalid module instantiation
### endmodule-typo  51: endmodule → endmodul
blinkTest.v:52: syntax error
I give up.
### endmodule-missing  51: endmodule removed
blinkTest.v:52: syntax error
I give up.
### end-missing  38: the always block's `end` removed
blinkTest.v:51: syntax error
I give up.
### begin-missing  31: ` begin` removed
blinkTest.v:38: syntax error
blinkTest.v:41: error: Invalid module item.
### semicolon-assign  41: `;` removed
blinkTest.v:45: syntax error
blinkTest.v:41: error: Syntax error in left side of continuous assignment.
### semicolon-nonblocking  33: `;` removed
blinkTest.v:34: syntax error
blinkTest.v:34: Syntax in assignment statement l-value.
### semicolon-decl  29: `;` removed
blinkTest.v:31: syntax error
blinkTest.v:1: error: Syntax error in variable list.
blinkTest.v:34: syntax error
blinkTest.v:34: error: Invalid module instantiation
blinkTest.v:36: error: Invalid module item.
blinkTest.v:37: syntax error
blinkTest.v:41: error: Invalid module item.
### semicolon-localparam  22: `;` removed
blinkTest.v:26: syntax error
blinkTest.v:26: error: Invalid module item.
### paren-missing  31: `)` removed
blinkTest.v:31: syntax error
blinkTest.v:31: error: Malformed event control expression.
blinkTest.v:31: error: Invalid event control.
blinkTest.v:36: syntax error
blinkTest.v:36: error: Invalid module instantiation
blinkTest.v:35: error: generate else is missing matching if.
blinkTest.v:41: error: Invalid module item.
### assign-reversed  33: <= → =<
blinkTest.v:33: syntax error
blinkTest.v:33: error: Malformed statement
### compare-assign  32: == → =
blinkTest.v:32: syntax error
blinkTest.v:32: error: Malformed conditional expression.
### undeclared-counter  36: counter → conter
blinkTest.v:36: error: Unable to bind wire/reg/memory `conter' in `blinkTest'
1 error(s) during elaboration.
### undeclared-led  34: led_state → led_stat
blinkTest.v:34: error: Unable to bind wire/reg/memory `led_stat' in `blinkTest'
1 error(s) during elaboration.
### undeclared-port  41: assign LEDR → assign LEDRR   (the stub step passes; this is the full compile)
blinkTest.v:41: warning: implicit definition of wire 'LEDRR'.
### undeclared-clock  31: CLOCK_500Hz → CLOCK_50Hz
blinkTest.v:31: error: Unable to bind wire/reg/memory `CLOCK_50Hz' in `blinkTest'
blinkTest.v:31: error: Failed to evaluate event expression 'posedge CLOCK_50Hz'.
2 error(s) during elaboration.
### assign-to-reg  41: assign LEDR → assign led_state
blinkTest.v:41: error: Variable 'led_state' cannot be driven by a continuous assignment/module.
blinkTest.v:41:      : This is allowed when SystemVerilog is enabled.
1 error(s) during elaboration.
### wire-in-always  29: reg led_state → wire led_state
blinkTest.v:34: error: 'led_state' is not a valid l-value for a procedural assignment.
blinkTest.v:29:      : 'led_state' is declared here as a wire.
1 error(s) during elaboration.
### elseif  35: end else begin → end elseif begin
blinkTest.v:35: syntax error
blinkTest.v:36: Syntax in assignment statement l-value.
blinkTest.v:38: syntax error
blinkTest.v:41: error: Invalid module item.
### endif  37: end → endif
blinkTest.v:38: syntax error
blinkTest.v:41: Syntax in assignment statement l-value.
blinkTest.v:51: syntax error
I give up.
### two-mistakes  31: always → alwyas; 41: `;` removed
blinkTest.v:31: syntax error
blinkTest.v:31: error: Invalid module instantiation
blinkTest.v:34: error: Invalid module instantiation
blinkTest.v:36: error: Invalid module item.
blinkTest.v:37: syntax error
blinkTest.v:45: error: Invalid module item.
### two-semantic  36: counter → conter; 41: LEDR → LEDRR
blinkTest.v:36: error: Unable to bind wire/reg/memory `conter' in `blinkTest'
1 error(s) during elaboration.
```

With `` `default_nettype none `` added to `_hdlboard_ts.v`, undeclared-port becomes (stub step, exit 1):

```
blinkTest.v:41: error: Net LEDRR is not defined in this context.
1 error(s) during elaboration.
```

### A.3 Where Icarus 12.0 differs

```
paren-missing (12.0):   blinkTest.v:35: syntax error
                        blinkTest.v:36: error: Invalid module item.
                        blinkTest.v:37: syntax error
assign-to-reg (12.0):   blinkTest.v:41: error: reg led_state; cannot be driven by primitives or continuous assignment.
wire-in-always (12.0):  blinkTest.v:34: error: led_state is not a valid l-value in blinkTest.
                        blinkTest.v:29:      : led_state is declared here as wire.
```

(The three paren-missing lines replace the 4th–6th lines of the 13.0 capture; the other lines are the same.)
