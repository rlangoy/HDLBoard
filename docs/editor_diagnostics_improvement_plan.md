# Editor Diagnostics — Improvement Plan: advice where GHDL's words mislead

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: plan, not built. Revision 2 (2026-09-30), after review.** It builds on the
error markers of [`editor_diagnostics_implementation_plan.md`](editor_diagnostics_implementation_plan.md)
(phases 1–4, merged into `main` in 1.2.0), and calls that document *the markers plan*.
Every GHDL message in this document was produced by running the real tools the
product ships: **GHDL 5.0.1** (the Windows app's bundled `ghdl.exe`) and **GHDL 6.0.0**
(the Docker image), with the backend's flags (`ghdl -a --std=08 <file>`). The two
printed identical text for every case (§ 2.1). Nothing here was run on Icarus
Verilog; § 4.12 says what that means.

**Revision 2** worked through a written review of revision 1 (a revised copy of this
plan; not kept in the repository, § 10 records every point). Each point was **measured before it was accepted or declined**: 7 more GHDL runs with
two mistakes in one file (§ 2.5), a check of every muting rule against all 29
captures (§ 2.6), and a check of which names sit close to a keyword (§ 2.7). § 10
lists each point and its outcome. The main changes:

- **Rule F (follow-on errors) is replaced.** Revision 1 muted every error after the
  first syntax error. That hides a second, independent mistake in 4 of the 4 measured
  files that have one, and so does the review's proposed "≤ 30-line recovery region".
  The new rule mutes only errors on an already-marked line and messages GHDL prints
  while it has lost its place. It mutes no independent mistake and still cuts a
  20-error cascade to 3 (§ 4.8).
- **Rule B (keyword suggestions) is tightened** against false positives that were
  found by measurement, not by the review's proposed gate. That gate would have
  blocked 5 of the 10 correct suggestions, including the reported `rttange` case
  (§ 10, V2).
- **Rules D and E get structural checks**, but not the review's 8-line limit (a
  measured `endif` sits 14 lines from its error).
- **Every phase ships something visible**; muting comes last.

**The problem, in one example.** A student mistypes `range` on line 33 of the
starter `blinkTest.vhdl`:

```vhdl
    signal counter   : integer rttange 0 to TOGGLE_COUNT - 1 := 0;
```

GHDL prints:

```
blinkTest.vhdl:33:39:error: missing ";" at end of object declaration
    signal counter   : integer rttange 0 to TOGGLE_COUNT - 1 := 0;
                                      ^
```

HDLBoard marks line 33 and writes *missing ";" at end of object declaration* after
it. The student looks for a `;`, and the line already has one. GHDL's **words** are
wrong for the student's mistake. Its **caret** is not: it points right after
`rttange`, the word that should have been `range`. The markers plan parses that
column and then throws it away (`diagnostics.ts`: "Unused by the first version of
the UI but kept, as LSP does").

**The end state:** the same run marks line 33 as now, but underlines `rttange`,
and the message after the line reads:

> `rttange` is not a VHDL keyword — did you mean `range`?

GHDL's own sentence is still one hover away, in the tooltip, and unchanged in the
console. Of the 22 single mistakes measured in § 2, **19 get a message that names
the real mistake**. The other 3 already had one and keep it (§ 5). In the measured
files with two mistakes, **both stay visible**.

**How to use this document.** §§ 0–3 say *what* and *why*. § 4 is the design, § 5
the expected result for every measured case (the acceptance test), § 6 the tests,
**§ 7 the work order**. § 10 is the review log. Appendix A has the measured GHDL
output, verbatim, for use as test data. Same conventions as the markers plan.

## Contents

- [0. Summary and decisions](#0-summary-and-decisions)
- [1. Why GHDL's words mislead](#1-why-ghdls-words-mislead)
- [2. What GHDL prints (measured)](#2-what-ghdl-prints-measured)
- [3. Research: how to advise a beginner](#3-research-how-to-advise-a-beginner)
- [4. Design](#4-design)
- [5. Expected result on the corpus](#5-expected-result-on-the-corpus)
- [6. Testing](#6-testing)
- [7. Implementation steps](#7-implementation-steps)
- [8. Decisions](#8-decisions)
- [9. Risks](#9-risks)
- [10. Review log](#10-review-log)
- [Appendix A: measured GHDL output](#appendix-a-measured-ghdl-output)
- [Appendix B: sources](#appendix-b-sources)

---

## 0. Summary and decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Add advice; never replace the compiler.** Advice becomes the headline of a marker. GHDL's message stays in the tooltip, prefixed `GHDL:`, and in the console, unchanged. | When a rule guesses wrong, the student still has the original. Specific help works; hiding the tool's words is not needed for that (§ 3). |
| D2 | **Advice is computed in the browser, from the source text GHDL saw.** A new pure module, `diagnosticAdvice.ts`, runs after `locateDiagnostics`. | The run snapshot (`RunSnapshot`) already holds exactly the files that were compiled. No backend or protocol change, the same as the markers plan. |
| D3 | **Always underline the word at GHDL's column. Add a headline only when a rule is confident.** | In all 22 cases the column points at, or directly after, a token on the reported line, and in 16 that token is the mistake. An underline alone is never wrong enough to mislead. |
| D4 | **Suggest a keyword only for a word near GHDL's caret** (within 3 tokens) that is not a keyword, not a library name, not declared **anywhere in the project**, has at least 4 letters, starts with the same letter as the keyword, and is within 1 edit of exactly one keyword (2 for words of 6 or more letters). | Catches all 10 keyword typos measured. Each exclusion removes a measured false positive (§ 2.7). |
| D5 | **"Did you mean" for `no declaration for "x"`** among names declared **in the same file**, library names, and keywords. | Five measured cases. Same-file keeps suggestions to names likely in scope; a name from another file is simply not suggested. |
| D6 | **Cross-line advice (Rules D, E) needs a structural check**: the previous code line must look unfinished (D), and the joined keyword must stand where a statement starts (E). **No fixed line limit.** | Without the check, D can blame a complete line. A limit would miss measured cases (`endif` 14 lines away, § 2.5). |
| D7 | **Mute only errors that cannot be independent**: a later error on a line that already has one, a message GHDL prints only while it has lost its place, and `was not analysed`. Everything else stays fully visible. | Measured on 29 captures: mutes no independent mistake, and still cuts cascades from 11–20 errors to 1–3 (§ 2.6). |
| D8 | **VHDL only in this plan.** Icarus prints no column and was not measured here. § 4.12 sketches the Verilog follow-up. | A plan should not describe output nobody has captured (markers plan convention). |
| D9 | **Wording follows § 4.9**: plain words, the student's own identifiers, one short sentence, a question only when it is a suggestion. | Readability is the factor that most affects whether beginners use a message (§ 3). |
| D10 | **Build in vertical slices**: underline + suggestions end to end first, then cross-line advice, then muting. | Each phase is usable on its own; the rule that hides things comes last, behind its tests. |

**This revises one decision of the markers plan.** Its § 2.4 item 4 says "The plan
shows what the compiler says (IDEs do not second-guess compilers)". That is still
true for the compiler's text, which stays (D1). What changes is that HDLBoard now
also says what the compiler *means* where the measured output shows it reliably can.

---

## 1. Why GHDL's words mislead

GHDL's parser is a recursive-descent parser that reports the first token it cannot
fit into the rule it is in. The message names the token it **expected**. For a
misspelled keyword that token is not what the student left out.

In the example, VHDL allows a *resolution function name* before a type name
(`subtype_indication ::= [resolution_indication] type_mark [constraint]`), so
`integer rttange` is read as "resolution function `integer`, type `rttange`". A
declaration may end right there, so when the parser then meets `0`, it reports what
would have been legal at that point: `;`. The column it prints is the position just
after the last token it accepted, which is the end of `rttange`.

Two conventions follow from the measurements. Both matter for § 4:

| Message shape | Where GHDL's column points | Measured in |
|---|---|---|
| `missing ";" at end of …`, `';' expected at end of …` | **Just after** the last accepted token | range-typo (`33:39`, after `rttange`), semicolon-missing (`33:64`, after `0`) |
| `'X' is expected here`, `… is expected instead of …`, `object class keyword …`, `missing entity, architecture, …`, `no declaration for …` | **On** the offending token | then-typo (`40:37` on `than`), signal-typo (`34:5` on `signl`), all `no declaration` cases |

So the advice rules look at **the token at the column and the tokens around it**
(§ 4.3, § 4.4).

---

## 2. What GHDL prints (measured)

The corpus is the starter `tests/fixtures/vhdl/blinkTest.vhdl` with **one** mistake
at a time: 22 mistakes of the kinds beginners make, namely misspelled keywords, a
missing word or `;`, a wrong operator, and a misspelled name. Each variant was
analysed with `ghdl -a --std=08` by both GHDL 5.0.1 and 6.0.0. §§ 2.5–2.7 add the
review measurements. Appendix A has the output; § 7 phase 0 commits the runner so it
can be repeated.

### 2.1 Versions

GHDL 5.0.1 and 6.0.0 printed **identical text for all 22 cases**. The only difference
is that the Windows build ends lines with `\r\n`, which `recognizeLine` already strips.
This also covers the markers plan's open step 0.1 (re-capture on GHDL 5.0.1/6.0.0)
for these message shapes.

### 2.2 The corpus

"First error" is the one with the lowest (line, column), which is also the one the
markers plan reveals. GHDL does not always print it first (process-typo prints
`39:5` before `38:24`). "Error lines" counts every `…:error:` line GHDL printed,
including `(found: …)` continuations, which the parser attaches to the message before
them.

| Id | The mistake (line) | Error lines | First error (line:col) and message | Where the caret is |
|---|---|---|---|---|
| range-typo | `range` → `rttange` (33) | 1 | `33:39` missing ";" at end of object declaration | just after the typo; **words wrong** |
| range-underscore | `range` → `ra_nge` (33) | 1 | `33:38` missing ";" at end of object declaration | just after the typo; **words wrong** |
| range-swap | `range` → `rnage` (33) | 1 | `33:37` missing ";" at end of object declaration | just after the typo; **words wrong** |
| downto-typo | `downto` → `dwonto` (13) | 14 | `13:44` incorrect constraint for a subtype indication | on `9`, before the typo; **words wrong** |
| signal-typo | `signal` → `signl` (34) | 1 | `34:5` object class keyword such as 'variable' is expected | on the typo; **words wrong** |
| process-typo | `process` → `proces` (38) | 21 | `38:24` ';' expected at end of signal assignment (found: 'begin') | end of the typo's line; **words wrong** |
| begin-typo | `begin` → `begn` (39) | 13 | `39:5` object class keyword such as 'variable' is expected | on the typo; **words wrong** |
| then-typo | `then` → `than` (40) | 4 | `40:37` 'then' is expected here (found: an identifier) | on the typo; words right |
| then-missing | `then` left out (40) | 2 | `41:13` 'then' is expected here (found: 'if') | **next line** |
| endif-joined | `end if` → `endif` (46) | 3 | `48:8` missing ";" at end of statement | **2 lines later**; words wrong |
| architecture-typo | `architecture` → `architecure` (25) | 11 | `25:1` missing entity, architecture, package or configuration | on the typo; words vague |
| entity-typo | `entity` → `entitiy` (10) | 11 | `10:1` missing entity, architecture, package or configuration | on the typo; words vague |
| is-missing | `is` left out (25) | 1 | `31:5` 'is' is expected instead of 'constant' | **6 lines later** (comments between) |
| mode-typo | `in` → `inn` (12) | 2 | `12:23` no declaration for "inn" | on the typo; no suggestion |
| others-typo | `others` → `other` (51) | 1 | `51:14` no declaration for "other" | on the typo; no suggestion |
| semicolon-missing | `;` left out at the end (33) | 1 | `33:64` missing ";" at end of object declaration | end of the line; **right** |
| semicolon-missing-assign | `;` left out at the end (42) | 2 | `43:17` unit name expected, found signal "led_state" | **next line**; words wrong |
| assign-reversed | `<=` → `=<` (42) | 1 | `42:27` "<=" or ":=" expected instead of '=' | on the operator; **right** |
| const-assign | `:=` → `=` (31) | 1 | `31:37` = should be := for initial value | on the operator; **right** |
| type-typo | `std_logic` → `std_logc` (34) | 3 | `34:24` no declaration for "std_logc" | on the typo; no suggestion |
| function-typo | `rising_edge` → `rising_egde` (40) | 1 | `40:12` no declaration for "rising_egde" | on the typo; no suggestion |
| signal-name-typo | `counter` → `couter` (45) | 1 | `45:28` no declaration for "couter" | on the typo; no suggestion |

In short:

- **Caret on or next to the mistake, words wrong or vague: 10** (range ×3,
  dwonto, signl, proces, begn, architecure, entitiy; plus than, whose words are right).
- **Caret on a later line: 4** (then-missing, is-missing, endif-joined,
  semicolon-missing-assign).
- **`no declaration` without a suggestion: 5.**
- **Right as printed: 3** (semicolon-missing, assign-reversed, const-assign).
- **Follow-on errors:** 5 cases print 11–21 error lines for one mistake (§ 2.3).

### 2.3 Follow-on errors

After a syntax error the parser resynchronises by guessing, and every wrong guess
is another error. process-typo prints 21 error lines from one missing `s`, including
*a generate statement must have a label* and *'generate' is expected instead of
'then'*. The markers plan marks all of them (up to 200 lines per file), so the
student sees a column of red lines down the file. Only the first is worth reading.
A file can also hold **a second, independent mistake**, which must stay visible
(§ 2.5).

### 2.4 How GHDL counts columns (measured)

The editor needs a character index into the line. GHDL's column is not one:

| Line starts with | Typo at character | GHDL column (after the typo) | Rule |
|---|---|---|---|
| 4 spaces | 30 | 37 | 30 + 7 characters: plain count |
| 1 tab | 27 | 41 | the tab counts as 8 columns |
| 2 tabs | 28 | 49 | each tab advances to the next multiple of 8 |
| 2 spaces + tab | 29 | 41 | the tab fills up to column 9 |
| `…"ø"…` earlier on the line | (ASCII: 65) | 66 | `ø` is 2 bytes in UTF-8: GHDL counts **bytes** |

So: **tabs advance to the next multiple of 8, and every other character counts as
its UTF-8 byte length.** § 4.2 turns that into code. (The browser sends files as
UTF-8, and GHDL reads them as Latin-1 bytes.)

### 2.5 Two mistakes in one file (measured for the review)

Seven more files, each with two mistakes in `blinkTest.vhdl` (Appendix A.14):

| File | What GHDL reports |
|---|---|
| `rttange` (33) + `=<` (42) | **both**, as two separate errors (`33:39`, `42:27`) |
| `signl` (34) + `then` left out (40) | **both** (`34:5`, `41:13`) |
| `then` left out (40) + `;` left out (51) | **both** (`41:13`, `51:34`) |
| `dwonto` (13) + `than` (40) | the 14-error cascade of `dwonto` (lines 13–23), **then the `than` error** (`40:37`) |
| `proces` (38) + `;` left out (51) | the cascade of `proces`; the second mistake is **lost inside it** (reported as `51:5` *missing entity, …*) |
| `signl` (34) + `couter` (45) | **only `signl`**: after a syntax error GHDL does no semantic analysis |
| `couter` (45) + `other` (51) | both (two semantic errors) |
| `endif` (46) with 12 more statements before `end process` | the error lands on line **60**, 14 lines below the `endif` |

Three findings:

1. **Independent syntax errors are reported separately and are real.** A rule that
   mutes everything after the first syntax error hides them.
2. **A syntax error and a semantic error never appear together**, so "what to do with
   semantic errors after a syntax error" does not arise.
3. **The distance between a cause and GHDL's report is not bounded by a few lines.**

### 2.6 Muting rules, checked on all 29 captures

Three rules were run over the 22 corpus files and the 7 files of § 2.5, with the
parser's own grouping (a `(found: …)` line belongs to the error before it) and
errors sorted by (line, column):

| Rule | Errors left visible | Files where an **independent** mistake was muted |
|---|---|---|
| Revision 1: mute every error after a first syntax error | 34 | **4 of 5** |
| The review: mute later syntax errors within 30 lines of the previous one | 35 | **4 of 5** |
| **Revision 2 (§ 4.8)**: mute only errors on an already-marked line, lost-place messages, and `was not analysed` | 50 | **0** |

The files with an independent mistake that GHDL reports are the first four of
§ 2.5, plus `couter` + `other`. On the corpus, revision 2 leaves
downto-typo with 3 visible errors of 14, process-typo with 3 of 20, begin-typo with
3 of 12, and architecture-typo and entity-typo with 1 of 11. The errors that stay
visible in a cascade are GHDL guesses that are not recognisably lost-place messages
(for example *'<=' is expected instead of 'begin'*). Showing a few of those is the
price of never hiding a real one.

### 2.7 Names that sit close to a keyword (measured for the review)

Rule B's distance test was run against the full VHDL-2008 reserved-word list for the
library names beginners use and 90 typical student identifiers (`clk`, `reset`,
`input`, `dout`, `busy`, …):

| Would be "corrected" | To | Excluded by |
|---|---|---|
| `signed` (library) | `signal` | library names are never candidates |
| `string` (library) | `strong` (PSL) | library names; PSL words are never targets |
| `clock` | `block` | same first letter; declared in the project |
| `dout`, `cout`, `outp` | `out` | same first letter; declared in the project |
| `switch` | `with` | same first letter; declared in the project |
| `input`, `inputs` | `inout` | declared in the project |
| `busy` | `bus` | declared in the project |
| `mode` | `mod`, `vmode` | declared in the project |
| `port_a`, `port_b` | `port` | declared in the project |

**Declared anywhere in the project** matters: a port name used in a `port map` is
declared in the *other* entity's file. All 10 real keyword typos in the corpus keep
their first letter, so that test costs nothing on the measured data.

A measured example of the `signed` trap: `signal acc : signed(7 dwonto 0);` gives
`34:62 incorrect constraint for a subtype indication`. Revision 1 scanned the line
left to right and would have met `signed` before `dwonto`.

---

## 3. Research: how to advise a beginner

| # | Finding | Source | Applied as |
|---|---|---|---|
| R1 | Error messages have been studied for over 50 years. The standard messages are widely found unhelpful to novices, and **the reported location or message often does not match the actual cause**. | Becker et al., ITiCSE Working Group report (2019); Kohn, SIGCSE 2019 (Python) | The whole plan; § 2 measures how often it happens for GHDL |
| R2 | **Specific help works, generic help does not.** Decaf analysed each student's code and customised the message: about 200 students and about 50,000 errors showed fewer errors overall, fewer per student, and fewer repeats. Adding generic explanations with examples showed **no significant effect**. | Becker, SIGCSE 2016; Denny, Luxton-Reilly, Carpenter, ITiCSE 2014 | D2, D4, D5: advice names the student's own word and the fix, and only when a rule matches the code |
| R3 | **Readability** (plain vocabulary, no jargon, short sentences) is what makes novices able to use a message. | Denny, Prather, Becker et al., CHI 2021 | § 4.9 wording; GHDL's *object declaration*, *subtype indication* and *primary* are the jargon to avoid |
| R4 | **Suggest the likely fix for a misspelling**: Python 3.14 underlines `whille` and says *"Did you mean 'while'?"*; GCC offers spelling suggestions for misspelled names. | Python 3.14 *What's New*; GCC patches (D. Malcolm, 2016) | D4, D5 |
| R5 | **Point at the code, and keep "what is wrong" apart from "how to fix it"**: rustc labels a primary span and puts the fix in a separate `help`. | rustc dev guide, *Errors and lints* | D3 (underline), § 4.9 (headline, then help) |
| R6 | **The compiler as an assistant**: say what you see in the student's code, in plain language. | Czaplicki, *Compiler Errors for Humans* (Elm, 2015) | § 4.9 tone |
| R7 | **Show the cascade for what it is**: a beginner reads every error as a separate mistake. But muting must not hide a real one (§ 2.5). | Becker et al. 2019 (cascading errors); § 2.6 | D7 |

**Deliberate choice against R5's "no questions" rule.** rustc's guide says a
suggestion should not be phrased as a question ("did you mean"). Python and GCC do
phrase it as a question, and they are the tools beginners meet. A question also
signals that it is a guess, which D1 wants the student to know. HDLBoard uses
*did you mean `x`?*.

---

## 4. Design

### 4.1 Data flow and types

```
 parseDiagnostics(text)                      (unchanged)
   → locateDiagnostics(…, snapshot, current)  (unchanged)
   → adviseDiagnostics(located, snapshot)     ← NEW, pure (diagnosticAdvice.ts)
   → addToFiles(…)                            (stores the advice with the message)
   → CodeEditor: underline + headline + tooltip
```

```ts
/** A range in one line of the snapshot: 0-based character offsets, end exclusive. */
interface Span { readonly start: number; readonly end: number }

/** What HDLBoard adds to a compiler message. */
interface Advice {
  /** One sentence shown after the line in place of the compiler's text (§ 4.9). Absent: underline only. */
  readonly headline?: string;
  /** The word to underline on this line. */
  readonly span?: Span;
  /** Another line the advice is about (Rule D: the previous code line; Rule E: the `endif`). */
  readonly relatedLine?: number;
  /** Set on muted follow-on errors (Rule F): the line of the first error. */
  readonly followOnOf?: number;
}

/** LocatedDiagnostic gains one optional field; everything else is as before. */
interface AdvisedDiagnostic extends LocatedDiagnostic { readonly advice?: Advice }
```

`LineMessage` (in `diagnosticStore.ts`) gains the same optional `advice`. **The
dedup key stays `severity` + `message`** (the compiler's text). So the rule of the
markers plan § 4.5.1 is untouched, and a message with advice deduplicates exactly as
before.

### 4.2 From GHDL's column to a character index

```ts
/** GHDL columns: a tab advances to the next multiple of 8; any other character counts its UTF-8 bytes (§ 2.4). */
export function ghdlColumnToIndex(line: string, column: number): number
```

The function walks the line, keeping GHDL's column (tab: `col = floor((col-1)/8)*8 + 9`;
other: `col += utf8Length(ch)`), and returns the index of the first character whose
column is `>= column`. If the column is past the end, it returns `line.length`. A
column inside a multi-byte character rounds to that character. Only GHDL diagnostics
have a column, so Icarus markers never reach this function.

### 4.3 Rule A — underline the word GHDL points at

For every error with a column, find the **anchor token**:

1. tokenize the line (`tokenizeVhdlLine`, the highlighter's own tokenizer, so the
   underline matches what is drawn);
2. the anchor is the non-whitespace token that contains the index, else the one
   that ends **exactly at** the index (the "just after" convention of § 1), else
   none.

The anchor is the default `span`. When a later rule names a different word
(dwonto, proces), its span wins. **Rule A alone never adds a headline** (D3). An
underline on a token that is not the mistake still shows where GHDL stopped, and
cannot mislead.

### 4.4 Rule B — a misspelled keyword

**When:** the error is a *syntax error* (§ 4.8).

**Where it looks:** the non-whitespace tokens within **3 tokens** on either side of
the anchor, on the reported line, nearest first. On a tie, the one after the anchor
comes first. **Not the whole line**: that is what caught `signed` in § 2.7. Measured:
`dwonto` is 1 token after its anchor `9`, and `proces` 3 tokens before its anchor `)`.

**A word is a candidate when all hold:**

- it is an identifier and **not a VHDL-2008 reserved word** (the full list, IEEE
  1076-2008 § 15.10, in `vhdlWords.ts`; **not** the highlighter's `KEYWORDS`, which
  lacks `range` and includes `rising_edge`);
- it is **not a library name** (`LIBRARY_NAMES`, § 4.5);
- it is **not declared in any snapshot file** (§ 4.5's patterns, run over the whole
  project; § 2.7 says why project-wide);
- it has at least 4 letters;
- it **starts with the same letter** as the keyword;
- its *optimal string alignment* distance to the keyword (Levenshtein plus swapping
  two neighbouring letters, the most common typing slip: `rnage`, `dwonto`), compared
  case-insensitively, is ≤ 1, or ≤ 2 if the word has 6 or more letters;
- **exactly one** keyword is nearest. A tie gives no advice.

**Suggestion targets** are the reserved words **minus the PSL-only ones** (`assume`,
`cover`, `fairness`, `property`, `sequence`, `strong`, `vmode`, `vprop`, `vunit`,
`restrict`, …). They are reserved, so they are never candidates, but a beginner
meant `process` more often than `property`.

**Advice:** headline *`rttange` is not a VHDL keyword — did you mean `range`?*;
span on the word. No candidate: underline only (Rule A).

### 4.5 Rule C — "did you mean" for an undeclared name

**When:** the message is `no declaration for "x"`.

**Candidates**, compared case-insensitively with the same distance thresholds and
first-letter test, except that words of 3 letters are allowed at distance 1
(`inn` → `in`):

1. **names declared in the same file**. These are collected by patterns over the
   tokens, outside comments and strings: the name after `signal`, `constant`,
   `variable`, `entity`, `architecture`, `component`, `type`, `subtype`, `function`,
   `procedure`, `package`, `alias`, `file`; the names before `:` in a `port (…)` or
   `generic (…)` list; and labels (`name :` before `process`, `entity`, `block`,
   `for`, `if`);
2. **library names** a beginner uses (`LIBRARY_NAMES` in `vhdlWords.ts`):
   `std_logic`, `std_ulogic`, `std_logic_vector`, `std_ulogic_vector`, `unsigned`,
   `signed`, `integer`, `natural`, `positive`, `boolean`, `bit`, `bit_vector`,
   `character`, `string`, `time`, `real`, `rising_edge`, `falling_edge`,
   `to_integer`, `to_unsigned`, `to_signed`, `resize`, `shift_left`, `shift_right`,
   `ieee`, `std_logic_1164`, `numeric_std`, `work`, `now`;
3. **reserved words** (`inn` → `in`, `other` → `others`).

The nearest candidate wins, with ties broken by the order above. A tie within one
group gives no advice. **Same file only** for suggestions (D5): a name declared in
another project file is not suggested, which only costs a suggestion. (Rule B's
*exclusion* is project-wide; the two lists serve opposite purposes.)

**Advice:** *`couter` is not declared — did you mean `counter`?*; span on the word.

### 4.6 Rule D — the cause is on the previous line

**When:** the error is a syntax error (§ 4.8), GHDL's column is the **first non-blank
character** of its line, and Rules E, B and C gave no advice.

**The previous code line** is the nearest line above that is not blank and not only
a comment (is-missing skips lines 26–30). There is **no line limit**: comments
between the two lines do not change what GHDL reports (§ 2.5).

**Structural check (it must pass, or there is no advice):** the previous code line,
with any trailing comment removed, looks unfinished. That means it does not end in
`;`, and does not end in something that legitimately continues on the next line
(`(`, `,`, `is`, `begin`, `then`, `else`, `generate`, `loop`, `=>`, an operator).
Measured: line 40 `if rising_edge(CLOCK_500Hz)`, line 25
`architecture rtl of blinkTest` and line 42 `counter   <= 0` all pass. A line ending
in `;` fails, so a typo at the start of the next line is never blamed on it.

| GHDL's message contains | Headline |
|---|---|
| `'X' is expected` (X a keyword or symbol) | *Probably a missing `X` at the end of line N.* |
| `';' expected`, `missing ";"`, `unit name expected` | *Probably a missing `;` at the end of line N.* |
| anything else | *GHDL noticed this at the start of the line — check the end of line N.* |

`relatedLine = N`, with a hint marker on line N (§ 4.10).

### 4.7 Rule E — keywords written as one word

**When:** a syntax error, and a token in this table appears **as the first token of a
line** (the structural check: that is where a statement or `end` starts). The search
goes from the error line upward to the start of its design unit (the nearest line
that starts with `architecture`, `entity`, `package` or `configuration`), nearest
first. **There is no fixed line limit**: the measured `endif` is 14 lines above its
error (§ 2.5).

| Written | VHDL wants |
|---|---|
| `endif`, `endcase`, `endloop`, `endprocess`, `endentity`, `endarchitecture`, `endcomponent`, `endgenerate`, `endfunction`, `endprocedure`, `endpackage`, `endrecord`, `endblock` | `end if`, `end case`, … (two words) |
| `elseif`, `elif` | `elsif` |

Claiming the nearest one is safe even when there are several: every joined keyword is
a mistake the student has to fix anyway.

**Advice:** *`endif` (line 46) must be two words in VHDL: `end if`.* with
`relatedLine = 46`. It is checked before Rule B, because the table is certain where
distance is a guess.

### 4.8 Rule F — follow-on errors, and what counts as a syntax error

**Syntax errors** are recognised by GHDL's message wording. This list comes from the
corpus and is tested against Appendix A:

```
/ expected\b/  /^missing /  /^unexpected token /  /is expected/  /^object class keyword/
/must be followed by/  /must have a label/  /^incorrect constraint/  /^misspelling/
```

`unit name expected, found …` matches ` expected\b` and is treated as a syntax error:
it is what GHDL says for a missing `;` before an assignment (§ 2.2). Everything else
is semantic (`no declaration for`, `can't match`, `no function declarations for`,
`was not analysed`, …).

**Follow-on errors.** Sort a file's errors by (line, column). The first is the
**primary**. A later error is muted when the primary is a syntax error and it is:

1. **on a line that already has an earlier error** (then-typo's `40:41`,
   process-typo's second `39:5`), or
2. **a lost-place message**, one GHDL prints only while it is skipping ahead to find
   its place again:

   ```
   /^missing entity, architecture, package or configuration$/
   /in a concurrent statement list$/
   /^a generate statement must have a label$/
   /^'generate' is expected instead of /
   /^missing ";" at end of (architecture|entity|generate statement body)$/
   /^"end" must be followed by /
   ```

A message `entity "x" was not analysed` is muted whatever the primary is (mode-typo).
**Nothing else is muted**, so an independent mistake is never hidden (§ 2.6).

The lost-place list is kept short on purpose. *misspelling, "x" expected* and
*'end' is expected instead of …* also appear inside cascades, but they are also what
a student's own mistake produces (`end architecture rtll;`), so they stay visible.

**Advice on a muted error:** *Probably caused by the error on line N — fix that one
first and run again.* It is rendered muted (§ 4.10).

### 4.9 Wording

| Principle | In practice |
|---|---|
| Name the student's own word, in code font | *`rttange` is not a VHDL keyword* — never *an identifier* |
| One sentence, under the 120-character inline limit | the headline; details go to the tooltip |
| No compiler vocabulary | not *object declaration*, *subtype indication*, *primary*, *unit name* |
| A question only for a guess | *did you mean `range`?*; certain advice (Rule E) is a statement |
| "Probably" when the rule infers a cause | Rules D and F |
| The compiler's own words are kept | tooltip: headline, blank line, `GHDL: missing ";" at end of object declaration`, then its details |

The tooltip for the example:

```
error: `rttange` is not a VHDL keyword — did you mean `range`?

GHDL: missing ";" at end of object declaration
```

The screen-reader summary (`summarize`) uses the headline. The console is unchanged.

### 4.10 Rendering

`HighlightedLine` in `CodeEditor.tsx` gets the line's spans and wraps the characters
in `[start, end)` in `<span class="wb-editor__diag-span is-error">`, splitting a
highlighter token where needed and keeping its colour class. The style is
`text-decoration: underline wavy`, which **does not change glyph metrics**, so the
transparent textarea stays aligned with the `<pre>` (the overlay technique of the
editor).

- **Muted follow-on lines** use `is-followon`: the same glyph and tooltip, a muted
  colour, and no inline text.
- **A line named by Rule D or E** (`relatedLine`) gets a **hint marker**: a tint and
  an edge, with no ✕ glyph, and no inline text. It is a third marker style next to
  error and warning.
- The inline text is `advice.headline` when there is one, else the message as today.

**Reveal:** for Rules D and E, the view reveals the named line when it is within 10
lines of GHDL's line (both stay in view); otherwise it reveals GHDL's line, as today.

### 4.11 Module layout

| Module | Contents | Pure |
|---|---|---|
| `vhdlWords.ts` | `RESERVED_WORDS` (IEEE 1076-2008 § 15.10), `PSL_WORDS`, `LIBRARY_NAMES`, `JOINED_KEYWORDS` | yes |
| `editDistance.ts` | `osaDistance(a, b, max)` with an early exit above `max` | yes |
| `ghdlColumn.ts` | `ghdlColumnToIndex` (§ 4.2) | yes |
| `declaredNames.ts` | `declaredNames(source)` for one file; Rule B unions it over the snapshot | yes |
| `diagnosticAdvice.ts` | `adviseDiagnostics(located, snapshot)`: classify and mute (F), then E, B, C, D, and A for the span | yes |
| `diagnosticStore.ts`, `diagnosticText.ts`, `CodeEditor.tsx`, `useDiagnostics.ts` | carry `advice`; wording; underline, muted and hint styles; call `adviseDiagnostics` | as today |

`diagnostics.ts` and `diagnosticLocation.ts` do not change. The parser still
recognises lines by shape alone (the markers plan's D2), and advice is a separate step.

### 4.12 What this plan does not cover

- **Icarus Verilog.** It prints no column, and its words (`syntax error`) are generic,
  not misleading. Rules B, C and E carry over at line level (misspelled `modul`,
  `alwyas`, `endmodle`; undeclared names), with Verilog's keywords. **Measure first**:
  a phase-0-style corpus on `blinkTest.v` with Icarus 13.0, as in § 2.
- **Runtime messages** (`LOG`: assertions, reports) get no advice.
- **Operator typos** beyond what GHDL already says well (`=<` is measured and already
  fine) and **`else if`** for `elsif`, which is legal VHDL that fails later at the
  missing `end if`. Phase 5, if asked.
- **VHDL scope and `use` clauses.** Declared names are found by pattern, not
  resolved; that is why suggestions stay in the same file (Rule C) and exclusions
  cover the whole project (Rule B).

---

## 5. Expected result on the corpus

This table is the acceptance test (§ 6.1). "Headline" is what the line shows.
"Muted" counts parsed errors (a `(found: …)` line is part of the error before it)
muted by § 4.8; "visible" is what is left.

| Id | Marked line | Underlined | Headline | Rule | Muted / visible |
|---|---|---|---|---|---|
| range-typo | 33 | `rttange` | `rttange` is not a VHDL keyword — did you mean `range`? | B | 0 / 1 |
| range-underscore | 33 | `ra_nge` | `ra_nge` is not a VHDL keyword — did you mean `range`? | B | 0 / 1 |
| range-swap | 33 | `rnage` | `rnage` is not a VHDL keyword — did you mean `range`? | B | 0 / 1 |
| downto-typo | 13 | `dwonto` | `dwonto` is not a VHDL keyword — did you mean `downto`? | B (1 token after the anchor) | 11 / 3 |
| signal-typo | 34 | `signl` | `signl` is not a VHDL keyword — did you mean `signal`? | B | 0 / 1 |
| process-typo | 38 | `proces` | `proces` is not a VHDL keyword — did you mean `process`? | B (3 tokens before the anchor) | 17 / 3 |
| begin-typo | 39 | `begn` | `begn` is not a VHDL keyword — did you mean `begin`? | B | 9 / 3 |
| then-typo | 40 | `than` | `than` is not a VHDL keyword — did you mean `then`? | B | 1 / 2 |
| then-missing | 41 (hint 40) | `if` | Probably a missing `then` at the end of line 40. | D | 0 / 1 |
| endif-joined | 48 (hint 46) | `end` | `endif` (line 46) must be two words in VHDL: `end if`. | E | 2 / 1 |
| architecture-typo | 25 | `architecure` | `architecure` is not a VHDL keyword — did you mean `architecture`? | B | 10 / 1 |
| entity-typo | 10 | `entitiy` | `entitiy` is not a VHDL keyword — did you mean `entity`? | B | 10 / 1 |
| is-missing | 31 (hint 25) | `constant` | Probably a missing `is` at the end of line 25. | D | 0 / 1 |
| mode-typo | 12 | `inn` | `inn` is not declared — did you mean `in`? | C | 1 (`was not analysed`) / 1 |
| others-typo | 51 | `other` | `other` is not declared — did you mean `others`? | C | 0 / 1 |
| semicolon-missing | 33 | `0` | *(GHDL's text, unchanged)* | A | 0 / 1 |
| semicolon-missing-assign | 43 (hint 42) | `led_state` | Probably a missing `;` at the end of line 42. | D | 1 / 1 |
| assign-reversed | 42 | `=<` | *(GHDL's text, unchanged)* | A | 0 / 1 |
| const-assign | 31 | `=` | *(GHDL's text, unchanged)* | A | 0 / 1 |
| type-typo | 34 | `std_logc` | `std_logc` is not declared — did you mean `std_logic`? | C | 0 / 3 (semantic: nothing muted) |
| function-typo | 40 | `rising_egde` | `rising_egde` is not declared — did you mean `rising_edge`? | C | 0 / 1 |
| signal-name-typo | 45 | `couter` | `couter` is not declared — did you mean `counter`? | C | 0 / 1 |

**19 of 22 get a headline naming the real mistake, and the other 3 keep GHDL's
correct one. 62 of 93 errors are muted and 31 stay visible.** For the § 2.5 files:

| File | Expected |
|---|---|
| `rttange` + `=<` | both visible; line 33 gets the Rule B headline, line 42 GHDL's text |
| `signl` + `then` left out | both visible; line 34 Rule B, line 41 Rule D (hint 40) |
| `then` left out + `;` left out | both visible; line 41 Rule D (hint 40), line 51 GHDL's text |
| `dwonto` + `than` | `dwonto` (line 13) and `than` (line 40) both visible with Rule B headlines; 12 of 17 errors muted; the other visible ones are cascade guesses on lines 14, 15 and 41 |
| `proces` + `;` left out | `proces` (Rule B); the lost second mistake is muted with the cascade (GHDL did not report it) |
| `endif` 14 lines above | line 60 marked, Rule E names line 46 |
| `signed(7 dwonto 0)` | `dwonto` suggested, **not** `signed` |

Two notes for the implementer:

- *type-typo*: its 2 later errors (`no function declarations for operator "not"`,
  `can't match "led_state"`) are consequences of the misspelled type, but they are
  semantic, so D7 keeps them. That is acceptable: the first error is revealed and
  correct.
- *downto-typo*: the first error by position (`13:44`) is not the first GHDL prints
  (`13:52`). Rule F must sort, not trust GHDL's order.

---

## 6. Testing

### 6.1 Golden corpus test (`diagnosticAdvice.golden.test.ts`)

The captures of Appendix A (the 22 corpus files, A.1–A.12, and the 7 files of
§ 2.5, A.14) plus their mutated sources become `diagnostics.corpus.ts`, generated
from **complete** captures (phase 0). For each one the test runs
`parse → locate → advise → addToFiles` and compares against § 5: marked line, span
text, headline, related line, muted and visible counts. **This test is the definition
of done for each rule's phase.**

### 6.2 False-positive guards

| Test | Expectation |
|---|---|
| Every identifier in every starter file (`files.ts`: VHDL and the names in `tests/fixtures/vhdl`) | Rule B gives no advice for any of them, including `rtl` (1 edit from `rol`, but only 3 letters) |
| The 90 identifiers of § 2.7, declared in a second project file and used near a syntax error in the first | no Rule B advice |
| `signed(7 dwonto 0)` (A.14) | Rule B suggests `downto`, never `signal` |
| A declared signal near a keyword on a syntax-error line | no Rule B advice for it |
| Two equally near keywords | no advice (tie) |
| `no declaration for "x"` where nothing is near | no advice; GHDL's text shown |
| A syntax error at the start of a line whose previous code line ends in `;` | no Rule D advice |
| `end architecture rtll;` after an earlier, independent syntax error | the *misspelling* error stays visible |
| Every file of § 2.5 with an independent mistake | that mistake stays visible |

### 6.3 Unit tests

- `ghdlColumnToIndex`: the five rows of § 2.4, a column past the end of the line,
  and a column inside a 3-byte character (`—`).
- `osaDistance`: swap (`rnage`/`range` = 1), insertion, deletion, the early exit,
  case-insensitivity.
- `declaredNames`: each pattern of § 4.5 on a small file; names inside comments and
  strings are ignored.
- `diagnosticText`: headline in `inlineText` and `summarize`; the tooltip layout of
  § 4.9; unchanged output when there is no advice (every existing test must pass
  untouched).

### 6.4 Browser runbook (with the real backend)

Driven through the Claude-in-Chrome extension, against **both** backends: the desktop
build (GHDL 5.0.1) and the Docker stack (GHDL 6.0.0).

1. The reported case: `rttange` on line 33 of `blinkTest.vhdl` → underline and the
   § 5 headline; hovering the line number shows `GHDL: missing ";" …`.
2. `rttange` + `=<`: both lines marked in full.
3. process-typo: line 38 revealed with the advice; the cascade muted except the two
   lines § 2.6 names.
4. is-missing: line 31 marked, line 25 hinted, both in view.
5. A tab-indented copy of case 1: the underline is still exactly on `rttange`.
6. Fix the typo and press Start: all advice and markers clear, as today.

---

## 7. Implementation steps

Each phase ends with something a student can see (D10). Muting comes last.

### Phase 0 — Commit the corpus

- 0.1 Add `tools/ghdl-typo-corpus.mjs`, the runner used for § 2: it applies each
  mutation of § 2.2 and § 2.5 to `blinkTest.vhdl`, runs `ghdl -a --std=08` with a
  given GHDL (and in the Docker image), and writes complete captures.
- 0.2 Generate `src/components/workbench/diagnostics.corpus.ts` from it.
- **Done when:** re-running the tool reproduces Appendix A byte for byte (after
  `\r\n` → `\n`) on GHDL 5.0.1 and 6.0.0.

### Phase 1 — Pure helpers

- 1.1 `vhdlWords.ts`, `editDistance.ts`, `ghdlColumn.ts`, `declaredNames.ts` with the
  § 6.3 tests.
- **Done when:** `npm test` passes.

### Phase 2 — Underline and suggestions, end to end

- 2.1 `diagnosticAdvice.ts` with Rules A, B and C, and the syntax classification of
  § 4.8 (without muting).
- 2.2 `advice` on `LineMessage`; the § 4.9 wording in `diagnosticText.ts`; spans in
  `CodeEditor.tsx`; `useDiagnostics.ts` calls `adviseDiagnostics`.
- 2.3 The golden rows of § 5 for Rules A–C, and the § 6.2 guards for B and C.
- **Done when:** those tests pass, every existing diagnostics test passes unchanged,
  and runbook steps 1, 2, 5 and 6 pass on both backends.

### Phase 3 — Cross-line advice

- 3.1 Rule E, then Rule D, each with its structural check and its § 6.2 guard.
- 3.2 The hint marker style and the reveal rule of § 4.10.
- **Done when:** the D and E rows of § 5 pass, and runbook step 4 passes.

### Phase 4 — Follow-on muting

- 4.1 Rule F (§ 4.8) and the `is-followon` style.
- **Done when:** § 5's muted and visible counts and every § 2.5 row hold, including
  "the independent mistake stays visible", and runbook step 3 passes.

### Phase 5 — Documentation

- 5.1 Update the markers plan (§ 2.4 item 4 points here),
  `src/components/workbench/README.md`, and `docs/changelog.txt`.

### Phase 6 — Optional, only if asked

- Verilog (§ 4.12): measure an Icarus corpus first.
- Operator typos and `else if`.

**Size.** Phases 1–2 are the bulk: about 400–600 lines of pure TypeScript plus tests,
and one contained change to `HighlightedLine`. Phases 3–4 are small rules on the same
data. Everything reuses the existing pipeline, so no step depends on the backend.

---

## 8. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Follow-on lines: muted with a glyph and tooltip, or hidden entirely? | **Muted.** Hiding would make the gutter disagree with the console. |
| 2 | Rules D and E name another line: also mark that line? | **Yes**, with a hint marker without a glyph (§ 4.10). |
| 3 | Reveal target for Rules D and E | **The named line** when it is within 10 lines of GHDL's; else GHDL's. |
| 4 | Suggestion wording | ***did you mean `x`?*** (§ 3). |
| 5 | Norwegian wording for the course? | Out of scope; `diagnosticText.ts` keeps every string in one place. |
| 6 | Where declared names are looked up | **Suggestions (Rule C): same file. Exclusions (Rule B): whole project.** |
| 7 | How much of a cascade is muted | **Only what cannot be independent** (§ 4.8); a few cascade lines may stay visible. |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A wrong suggestion sends the student the wrong way | D1 (GHDL's text always one hover away), D4's exclusions and tie rule, measured collisions (§ 2.7), the § 6.2 guards |
| A real second mistake is hidden | § 4.8 mutes only same-line and lost-place errors; § 2.6 measured 0 hidden; the § 2.5 files are phase 4's gate |
| A future GHDL changes a message's wording | Rules match wording only to classify and to mute. A changed lost-place message stops being muted (safe direction); the corpus test fails loudly |
| Column mapping drifts (tabs, UTF-8) | Measured in § 2.4 and unit-tested; a span that does not land on a token is dropped, never drawn in the wrong place |
| Underline misaligns the textarea overlay | `text-decoration` only; no padding, border or font change (§ 4.10); runbook step 5 |
| Advice on a stale file | Cannot happen: `locateDiagnostics` already drops a file edited during the compile, and advice reads the same snapshot |

---

## 10. Review log

Each point of the written review, what was measured, and the outcome.

| # | Review point | Outcome | Evidence |
|---|---|---|---|
| V1 | Muting everything after the first syntax error hides a second, independent mistake | **Accepted, and it was a real flaw** in revision 1 | § 2.5: GHDL reports independent syntax errors separately; revision 1 hid them in 4 of 5 files |
| V2 | Rule B only with "contextual evidence": GHDL's message names a keyword, or a local syntactic pattern expects one | **Declined as a gate**; the concern is addressed by measured exclusions instead (D4) | GHDL's message names a keyword in only 5 of the 10 correct suggestions (not for `rttange`, `ra_nge`, `rnage`, `dwonto`, `proces`). The local-pattern alternative is not specified, and would be a partial VHDL parser. The review's own § 5 still lists the `range` cases under Rule B, which its gate would block |
| V3 | Whole-line scans need the same gate; use a window around the column | **Window accepted** (3 tokens, nearest first) | § 2.7: `signed(7 dwonto 0)` — the left-to-right scan picked `signed` → `signal` |
| V4 | Underline only when evidence is weak | **Accepted** as D3 | — |
| V5 | Rule B excludes names declared in the same file | **Changed to the whole project, plus library names** | § 2.7: `signed`, `string`, and port names used in a `port map` are declared elsewhere |
| V6 | Rule C suggests same-file names only | **Accepted** | A missed suggestion is the safe failure |
| V7 | Rules D and E search at most 8 lines | **Declined** | § 2.5: an `endif` 14 lines from its error; comments put `is` any distance from its report. D uses the previous *code* line; E stops at the design unit |
| V8 | Rules D and E need structural checks | **Accepted** (§ 4.6, § 4.7) | Without it, D blames a complete line when a keyword typo at the start of a line is not caught by Rule B |
| V9 | Restricted muting: a recovery region of ≤ 30 lines, or until a semantic error or unit boundary | **Goal accepted, mechanism declined**; replaced by § 4.8 | § 2.6: the 30-line region hides the independent mistake in 4 of 5 files, like revision 1. "Until a semantic error" never triggers (§ 2.5 finding 2) |
| V10 | Expand the corpus: independent mistakes, other constructs, negative examples, complete captures | **Accepted**; 7 files already measured (§ 2.5), more in § 6.2 | Found V1 and V3 |
| V11 | Implementation order: underline and suggestions first, cross-line advice next, muting last | **Accepted**, but rendering in every phase, not only at the end | The review put store, wording and rendering in its last phase, so nothing would be visible until then, contrary to its own D10 |
| V12 | Add `/primary expected/` to the syntax patterns | **Declined** | Not in any capture; GHDL's *unexpected token … in a primary* is already matched |
| V13 | § 5 follow-on counts replaced by "restricted cascade" | **Declined**; exact counts under the new rule | An acceptance table needs numbers |
| V14 | Appendix A reduced to "see the original measurements" | **Declined**; kept in full and extended (A.14) | It is the test data |
| V15 | Open decisions resolved as recommended; new ones on scope and cascade extent | **Accepted** (§ 8) | — |

---

## Appendix A: measured GHDL output

GHDL 5.0.1 (`winInstaller/vendor/ghdl`) and GHDL 6.0.0 (`hdlboard-backend` image),
`ghdl -a --std=08 blinkTest.vhdl`, identical text. The mutated line is shown first.
For the cascades, the first messages are given in full, then the count of the rest;
phase 0 commits complete captures.

### A.1 range-typo (the reported case)
```
    signal counter   : integer rttange 0 to TOGGLE_COUNT - 1 := 0;

blinkTest.vhdl:33:39:error: missing ";" at end of object declaration
    signal counter   : integer rttange 0 to TOGGLE_COUNT - 1 := 0;
                                      ^
```

### A.2 range-underscore, range-swap
```
    signal counter   : integer ra_nge 0 to TOGGLE_COUNT - 1 := 0;
blinkTest.vhdl:33:38:error: missing ";" at end of object declaration

    signal counter   : integer rnage 0 to TOGGLE_COUNT - 1 := 0;
blinkTest.vhdl:33:37:error: missing ";" at end of object declaration
```
(each followed by the source echo and a caret under the column)

### A.3 downto-typo (14 errors)
```
        SW          : in  std_logic_vector(9 dwonto 0);

blinkTest.vhdl:13:52:error: ')' is expected instead of '<integer>'
blinkTest.vhdl:13:44:error: incorrect constraint for a subtype indication
blinkTest.vhdl:13:53:error: ';' or ')' expected after interface
blinkTest.vhdl:14:9:error: object class keyword such as 'variable' is expected
blinkTest.vhdl:15:9:error: 'end' is expected instead of "ledr"
blinkTest.vhdl:15:9:error: misspelling, "blinktest" expected
blinkTest.vhdl:15:13:error: missing ";" at end of entity
blinkTest.vhdl:16:9:error: missing entity, architecture, package or configuration
… the same message for lines 17, 18, 19, 20, 21 and 23
```

### A.4 signal-typo
```
    signl led_state : std_logic := '0';
blinkTest.vhdl:34:5:error: object class keyword such as 'variable' is expected
```

### A.5 process-typo (21 error lines)
```
    proces(CLOCK_500Hz)

blinkTest.vhdl:39:5:error: '<=' is expected instead of 'begin'
blinkTest.vhdl:39:5:error: unexpected token 'begin' in a primary
blinkTest.vhdl:38:24:error: ';' expected at end of signal assignment
blinkTest.vhdl:38:24:error: (found: 'begin')
blinkTest.vhdl:39:5:error: unexpected token 'begin' in a concurrent statement list
blinkTest.vhdl:40:9:error: a generate statement must have a label
blinkTest.vhdl:40:37:error: 'generate' is expected instead of 'then'
blinkTest.vhdl:41:13:error: a generate statement must have a label
blinkTest.vhdl:41:43:error: 'generate' is expected instead of 'then'
blinkTest.vhdl:45:25:error: ':' is expected instead of '<='
blinkTest.vhdl:45:25:error: 'generate' is expected instead of '<='
blinkTest.vhdl:45:25:error: unexpected token '<=' in a concurrent statement list
blinkTest.vhdl:46:16:error: missing ";" at end of generate statement body
blinkTest.vhdl:46:17:error: 'end' is expected instead of 'if'
blinkTest.vhdl:46:19:error: 'generate' is expected instead of ';'
blinkTest.vhdl:47:12:error: missing ";" at end of generate statement body
blinkTest.vhdl:47:13:error: 'end' is expected instead of 'if'
blinkTest.vhdl:47:15:error: 'generate' is expected instead of ';'
blinkTest.vhdl:48:8:error: missing ";" at end of architecture
blinkTest.vhdl:51:5:error: missing entity, architecture, package or configuration
blinkTest.vhdl:53:1:error: missing entity, architecture, package or configuration
```

### A.6 begin-typo (13 error lines)
```
    begn
blinkTest.vhdl:39:5:error: object class keyword such as 'variable' is expected
blinkTest.vhdl:43:17:error: 'begin' is expected instead of "led_state"
blinkTest.vhdl:44:13:error: 'end' is expected instead of 'else'
blinkTest.vhdl:44:13:error: "end" must be followed by 'process'
blinkTest.vhdl:43:44:error: ';' expected at end of process
blinkTest.vhdl:43:44:error: (found: 'else')
blinkTest.vhdl:44:13:error: 'end' is expected instead of 'else'
blinkTest.vhdl:43:44:error: missing ";" at end of architecture
blinkTest.vhdl:46:13:error: missing entity, architecture, package or configuration
… the same message for lines 47, 48, 51 and 53
```

### A.7 then-typo, then-missing
```
        if rising_edge(CLOCK_500Hz) than
blinkTest.vhdl:40:37:error: 'then' is expected here
blinkTest.vhdl:40:37:error: (found: an identifier)
blinkTest.vhdl:41:13:error: "<=" or ":=" expected instead of 'if'
blinkTest.vhdl:40:41:error: missing ";" at end of statement

        if rising_edge(CLOCK_500Hz)
blinkTest.vhdl:41:13:error: 'then' is expected here
            if counter = TOGGLE_COUNT - 1 then
            ^
blinkTest.vhdl:41:13:error: (found: 'if')
```

### A.8 endif-joined
```
            endif;
blinkTest.vhdl:48:9:error: 'if' is expected instead of 'process'
blinkTest.vhdl:48:8:error: missing ";" at end of statement
blinkTest.vhdl:48:9:error: 'end' is expected instead of 'process'
```

### A.9 architecture-typo, entity-typo (11 errors each)
```
architecure rtl of blinkTest is
blinkTest.vhdl:25:1:error: missing entity, architecture, package or configuration
… the same message for lines 33, 34, 36, 43, 44, 46, 47, 48, 51 and 53

entitiy blinkTest is
blinkTest.vhdl:10:1:error: missing entity, architecture, package or configuration
… the same message for lines 13–21 and 23
```

### A.10 is-missing
```
architecture rtl of blinkTest
blinkTest.vhdl:31:5:error: 'is' is expected instead of 'constant'
    constant TOGGLE_COUNT : integer := 125;
    ^
```

### A.11 Undeclared names
```
        CLOCK_500Hz : inn std_logic;
blinkTest.vhdl:12:23:error: no declaration for "inn"
blinkTest.vhdl:25:21:error: entity "blinkTest" was not analysed

    LEDR <= (other => led_state);
blinkTest.vhdl:51:14:error: no declaration for "other"

    signal led_state : std_logc := '0';
blinkTest.vhdl:34:24:error: no declaration for "std_logc"
blinkTest.vhdl:43:30:error: no function declarations for operator "not"
blinkTest.vhdl:51:24:error: can't match "led_state" with type STD_ULOGIC

        if rising_egde(CLOCK_500Hz) then
blinkTest.vhdl:40:12:error: no declaration for "rising_egde"

                counter <= couter + 1;
blinkTest.vhdl:45:28:error: no declaration for "couter"
```

### A.12 Missing `;`, operators
```
    signal counter   : integer range 0 to TOGGLE_COUNT - 1 := 0
blinkTest.vhdl:33:64:error: missing ";" at end of object declaration

                counter   <= 0
blinkTest.vhdl:43:17:error: unit name expected, found signal "led_state"
blinkTest.vhdl:43:27:error: no function declarations for operator "<="

                counter   =< 0;
blinkTest.vhdl:42:27:error: "<=" or ":=" expected instead of '='

    constant TOGGLE_COUNT : integer = 125;
blinkTest.vhdl:31:37:error: = should be := for initial value
```

### A.13 Column measurements (§ 2.4)

`entity t is end; architecture a of t is <line> begin end;` with `<line>` =
`<indent>signal counter : integer rttange 0 to 9 := 0;`:

```
4 spaces          → t.vhdl:3:37
1 tab             → t.vhdl:3:41
2 tabs            → t.vhdl:3:49
2 spaces + 1 tab  → t.vhdl:3:41
constant S : string := "o"; signal counter : integer rttange 0 to 9 := 0;  → t.vhdl:3:65
constant S : string := "ø"; signal counter : integer rttange 0 to 9 := 0;  → t.vhdl:3:66
```

### A.14 Two mistakes in one file (§ 2.5)

Error lines only, `blinkTest.vhdl:` prefix removed.

```
rttange (33) + =< (42)
  33:39:error: missing ";" at end of object declaration
  42:27:error: "<=" or ":=" expected instead of '='

signl (34) + then left out (40)
  34:5:error: object class keyword such as 'variable' is expected
  41:13:error: 'then' is expected here
  41:13:error: (found: 'if')

then left out (40) + ; left out (51)
  41:13:error: 'then' is expected here
  41:13:error: (found: 'if')
  51:34:error: ';' expected at end of signal assignment
  51:34:error: (found: 'end')

signl (34) + couter (45)
  34:5:error: object class keyword such as 'variable' is expected

couter (45) + other (51)
  45:28:error: no declaration for "couter"
  51:14:error: no declaration for "other"

dwonto (13) + than (40)
  the 14 lines of A.3, then:
  40:37:error: 'then' is expected here
  40:37:error: (found: an identifier)
  41:13:error: "<=" or ":=" expected instead of 'if'
  40:41:error: missing ";" at end of statement

proces (38) + ; left out (51)
  the lines of A.5 up to 48:8, then:
  51:5:error: missing entity, architecture, package or configuration

endif (46), 12 more statements before end process
  60:9:error: 'if' is expected instead of 'process'
  60:8:error: missing ";" at end of statement
  60:9:error: 'end' is expected instead of 'process'

signal acc : signed(7 dwonto 0);  (added to line 34)
  34:70:error: ')' is expected instead of '<integer>'
  34:62:error: incorrect constraint for a subtype indication
  34:70:error: missing ";" at end of object declaration
```

---

## Appendix B: sources

- Becker, B. A., Denny, P., Pettit, R., et al. *Compiler Error Messages Considered
  Unhelpful: The Landscape of Text-Based Programming Error Message Research.*
  ITiCSE-WGR 2019, pp. 177–210. <https://dl.acm.org/doi/10.1145/3344429.3372508>
- Becker, B. A. *An Effective Approach to Enhancing Compiler Error Messages.*
  SIGCSE 2016. <https://dl.acm.org/doi/10.1145/2839509.2844584> ·
  [ResearchGate](https://www.researchgate.net/publication/303939858_An_Effective_Approach_to_Enhancing_Compiler_Error_Messages)
- Denny, P., Luxton-Reilly, A., Carpenter, D. *Enhancing syntax error messages
  appears ineffectual.* ITiCSE 2014, pp. 273–278.
  [ResearchGate](https://www.researchgate.net/publication/266657038_Enhancing_syntax_error_messages_appears_ineffectual)
- Denny, P., Prather, J., Becker, B. A., et al. *On Designing Programming Error
  Messages for Novices: Readability and its Constituent Factors.* CHI 2021, article 55.
  <https://dl.acm.org/doi/10.1145/3411764.3445696>
- Kohn, T. *The Error Behind The Message: Finding the Cause of Error Messages in
  Python.* SIGCSE 2019.
- Python 3.14, *What's New*: improved error messages, keyword typo suggestions
  (gh-132449). <https://docs.python.org/3.14/whatsnew/3.14.html>
- The rustc dev guide, *Errors and lints*.
  <https://rustc-dev-guide.rust-lang.org/diagnostics.html>
- Malcolm, D. *Spelling suggestions for misspelled …* (GCC patch, 2016).
  <https://gcc.gnu.org/legacy-ml/gcc-patches/2016-08/msg01342.html>
- Czaplicki, E. *Compiler Errors for Humans* (Elm, 2015); discussion:
  <https://news.ycombinator.com/item?id=9805978>
- IEEE Std 1076-2008, *VHDL Language Reference Manual*, § 15.10 (reserved words)
  and § 6.3 (subtype indication).
