# Editor Diagnostics — Improvement Plan: advice where GHDL's words mislead

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: plan, not built (2026-09-30).** It builds on the error markers of
[`editor_diagnostics_implementation_plan.md`](editor_diagnostics_implementation_plan.md)
(phases 1–4, merged into `main` in 1.2.0), and calls that document *the markers plan*.
Every GHDL message in this document was produced by running the real tools the
product ships: **GHDL 5.0.1** (the Windows app's bundled `ghdl.exe`) and **GHDL 6.0.0**
(the Docker image), with the backend's flags (`ghdl -a --std=08 <file>`). The two
printed identical text for every case (§ 2.1). Nothing here was run on Icarus
Verilog; § 4.12 says what that means.

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
console. Of the 22 typical mistakes measured in § 2, **19 get a message that names
the real mistake**. The other 3 already had one and keep it (§ 5).

**How to use this document.** §§ 0–3 say *what* and *why*. § 4 is the design, § 5
the expected result for every measured case (the acceptance test), § 6 the tests,
**§ 7 the work order**. Appendix A has the measured GHDL output, verbatim, for use
as test data. Same conventions as the markers plan.

## Contents

- [0. Summary and decisions](#0-summary-and-decisions)
- [1. Why GHDL's words mislead](#1-why-ghdls-words-mislead)
- [2. What GHDL prints for typical mistakes (measured)](#2-what-ghdl-prints-for-typical-mistakes-measured)
- [3. Research: how to advise a beginner](#3-research-how-to-advise-a-beginner)
- [4. Design](#4-design)
- [5. Expected result on the corpus](#5-expected-result-on-the-corpus)
- [6. Testing](#6-testing)
- [7. Implementation steps](#7-implementation-steps)
- [8. Open decisions](#8-open-decisions)
- [9. Risks](#9-risks)
- [Appendix A: measured GHDL output](#appendix-a-measured-ghdl-output)
- [Appendix B: sources](#appendix-b-sources)

---

## 0. Summary and decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Add advice; never replace the compiler.** Advice becomes the headline of a marker. GHDL's message stays in the tooltip, prefixed `GHDL:`, and in the console, unchanged. | When a rule guesses wrong, the student still has the original. Specific help works; hiding the tool's words is not needed for that (§ 3). |
| D2 | **Advice is computed in the browser, from the source text GHDL saw.** A new pure module, `diagnosticAdvice.ts`, runs after `locateDiagnostics`. | The run snapshot (`RunSnapshot`) already holds exactly the files that were compiled. No backend or protocol change, the same as the markers plan. |
| D3 | **Use GHDL's column.** Convert it to a character position (§ 4.2) and underline the word there. | In all 22 cases the column points at, or directly after, a token on the reported line. In 16 of them that token is the mistake itself. |
| D4 | **Suggest a keyword only when confident**: the word is not a keyword, not a declared name, at least 4 letters, and within 1 edit of a keyword (2 for words of 6 or more letters). | It catches every keyword typo measured, and none of the starter projects' own names (§ 4.4, § 6.2). |
| D5 | **"Did you mean" for `no declaration for "x"`** among the project's declared names, the keywords, and a short list of library names. | Five measured cases. GHDL gives the name but never a suggestion. |
| D6 | **When GHDL reports at the start of a line, point at the previous code line.** | A missing `then`, `is` or `;` is reported on the *next* line of code, up to 6 lines later (§ 2.2). |
| D7 | **Treat errors after the first syntax error of a file as follow-on errors**: muted, and saying so. | One typo produced up to 21 errors. Only the first one is about the mistake (§ 2.3). |
| D8 | **VHDL only in this plan.** Icarus prints no column and was not measured here. § 4.12 sketches the Verilog follow-up. | A plan should not describe output nobody has captured (markers plan convention). |
| D9 | **Wording follows § 4.9**: plain words, the student's own identifiers, one short sentence, a question only when it is a suggestion. | Readability is the factor that most affects whether beginners use a message (§ 3). |

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

So the advice rules look at **the token at the column and the token directly before
it** (§ 4.3).

---

## 2. What GHDL prints for typical mistakes (measured)

The corpus is the starter `tests/fixtures/vhdl/blinkTest.vhdl` with **one** mistake
at a time: 22 mistakes of the kinds beginners make, namely misspelled keywords, a
missing word or `;`, a wrong operator, and a misspelled name. Each variant was
analysed with `ghdl -a --std=08` by both GHDL 5.0.1 and 6.0.0. Appendix A has the
output; § 7 phase 0 commits the runner so it can be repeated.

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
- **Follow-on errors:** 5 cases print 11–21 errors for one mistake (§ 2.3).

### 2.3 Follow-on errors

After a syntax error the parser resynchronises by guessing, and every wrong guess
is another error. process-typo prints 21 errors from one missing `s`, including
*a generate statement must have a label* and *'generate' is expected instead of
'then'*. The markers plan marks all of them (up to 200 lines per file), so the
student sees a column of red lines down the file. Only the first is worth reading.

Semantic errors are different. Two `no declaration` errors are usually two real
mistakes. So only errors **after a syntax error** are treated as follow-on (§ 4.8).

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
| R7 | **Show the cascade for what it is**: a beginner reads every error as a separate mistake. Compilers commonly let you limit the count (GCC `-fmax-errors`), and IDEs sort by position. | Becker et al. 2019 (cascading errors); GCC option | D7 |

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
  /** One sentence shown after the line in place of the compiler's text (§ 4.9). */
  readonly headline: string;
  /** The word to underline, when the advice is about a word on this line. */
  readonly span?: Span;
  /** Another line the advice is about (Rule D: the previous code line; Rule E: the `endif`). */
  readonly relatedLine?: number;
  /** Set on follow-on errors (Rule F): the line of the first error. */
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
(dwonto, proces), its span wins. Rule A alone never changes the headline.

### 4.4 Rule B — a misspelled keyword

**When:** the error is a *syntax error* (§ 4.8's list), and a **candidate word**
is found in this order:

1. the anchor token and the token before it, if they are identifiers;
2. otherwise, the other identifiers on the reported line, left to right.

**A word is a candidate when all hold:**

- it is not a VHDL-2008 reserved word (the full list, IEEE 1076-2008 § 15.10; see
  `vhdlWords.ts` in § 4.11. **Not** the highlighter's `KEYWORDS`, which lacks
  `range` and includes `rising_edge`);
- it is not a **declared name** in any snapshot file (§ 4.5);
- it has at least 4 letters;
- its distance to the nearest reserved word is ≤ 1, or ≤ 2 if it has 6 or more
  letters. The distance is *optimal string alignment* (Levenshtein plus swapping two
  neighbouring letters, which is the most common typing slip: `rnage`, `dwonto`),
  compared case-insensitively;
- exactly one reserved word is nearest. A tie gives no advice (no guessing between
  two).

**Suggestion targets** are the reserved words **minus the PSL-only ones** (`assume`,
`cover`, `fairness`, `property`, `sequence`, `strong`, `vmode`, `vprop`, `vunit`,
`restrict`, …). They are reserved, so they are never candidates, but a beginner
meant `process` more often than `property`.

**Advice:** headline *`rttange` is not a VHDL keyword — did you mean `range`?*;
span on the word.

### 4.5 Rule C — "did you mean" for an undeclared name

**When:** the message is `no declaration for "x"`.

**Candidates**, compared case-insensitively with the same thresholds, except that
words of 3 letters are allowed at distance 1 (`inn` → `in`):

1. **declared names** in the snapshot's files. These are collected by patterns over
   the tokens: the name after `signal`, `constant`, `variable`, `entity`,
   `architecture`, `component`, `type`, `subtype`, `function`, `procedure`,
   `package`, `alias`, `file`; the names before `:` in a `port (…)` or
   `generic (…)` list; and labels (`name :` before `process`, `entity`, `block`,
   `for`, `if`);
2. **library names** a beginner uses (`vhdlWords.ts`): `std_logic`, `std_ulogic`,
   `std_logic_vector`, `std_ulogic_vector`, `unsigned`, `signed`, `integer`,
   `natural`, `positive`, `boolean`, `bit`, `bit_vector`, `character`, `string`,
   `time`, `real`, `rising_edge`, `falling_edge`, `to_integer`, `to_unsigned`,
   `to_signed`, `resize`, `shift_left`, `shift_right`, `ieee`, `std_logic_1164`,
   `numeric_std`, `work`, `now`;
3. **reserved words** (`inn` → `in`, `other` → `others`).

The nearest candidate wins, with ties broken by the order above. A tie within one
group gives no advice.

**Advice:** *`couter` is not declared — did you mean `counter`?*; span on the word.

### 4.6 Rule D — the cause is on the previous line

**When:** the error is a syntax error, or the message is `unit name expected, found …`
(measured: a missing `;` before an assignment, § 2.2), **and** GHDL's column is the
first non-blank character of its line.

**Then:** the *previous code line* is the nearest line above that is not blank and
not only a comment (is-missing skips lines 26–30). The headline depends on what GHDL
expected:

| GHDL's message contains | Headline |
|---|---|
| `'X' is expected` (X a keyword or symbol) | *Probably a missing `X` at the end of line N.* |
| `';' expected`, `missing ";"`, `unit name expected` | *Probably a missing `;` at the end of line N.* |
| anything else | *GHDL noticed this at the start of the line — check the end of line N.* |

`relatedLine = N`. The span is on the last token of line N, if the renderer allows
spans on another line (§ 8 #2). Otherwise it is omitted.

### 4.7 Rule E — keywords written as one word

**When:** a syntax error, and a token on the error line **or above it** (same file,
nearest first) is in this table:

| Written | VHDL wants |
|---|---|
| `endif`, `endcase`, `endloop`, `endprocess`, `endentity`, `endarchitecture`, `endcomponent`, `endgenerate`, `endfunction`, `endprocedure`, `endpackage`, `endrecord`, `endblock` | `end if`, `end case`, … (two words) |
| `elseif`, `elif` | `elsif` |

**Advice:** *`endif` (line 46) must be two words in VHDL: `end if`.* with
`relatedLine = 46`. It is checked before Rule B: `endif` is at distance 2 from `end`
and 1 from nothing, so Rule B would give no advice anyway, and the table is certain
where distance is a guess.

### 4.8 Rule F — follow-on errors, and what counts as a syntax error

**Syntax errors** are recognised by GHDL's message wording. This list comes from the
corpus and is tested against Appendix A:

```
/ expected\b/  /^missing /  /^unexpected token /  /is expected/  /^object class keyword/
/must be followed by/  /must have a label/  /^incorrect constraint/  /^misspelling/
```

Everything else is semantic (`no declaration for`, `can't match`,
`no function declarations for`, `was not analysed`, `unit name expected`, …).

**Follow-on:** in each file, take the first error (lowest line, then column). If it
is a syntax error, **every later error in that file** gets
`followOnOf = <first line>`. The message `entity "x" was not analysed` is always a
follow-on (mode-typo: it follows from the first error).

**Advice on a follow-on** (unless a rule above gave it something better): *Probably
caused by the error on line N — fix that one first and run again.* It is rendered
muted (§ 4.10).

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
editor). Follow-on lines use `is-followon`: the same glyph and tooltip, muted colour,
and no inline text unless it is the only line (§ 8 #1). The inline text is
`advice.headline` when there is one, else the message as today.

### 4.11 Module layout

| Module | Contents | Pure |
|---|---|---|
| `vhdlWords.ts` | `RESERVED_WORDS` (IEEE 1076-2008 § 15.10), `PSL_WORDS`, `LIBRARY_NAMES`, `JOINED_KEYWORDS` | yes |
| `editDistance.ts` | `osaDistance(a, b, max)` with an early exit above `max` | yes |
| `ghdlColumn.ts` | `ghdlColumnToIndex` (§ 4.2) | yes |
| `declaredNames.ts` | `declaredNames(files)` (§ 4.5) | yes |
| `diagnosticAdvice.ts` | `adviseDiagnostics(located, snapshot)`: Rules A–F, applied in the order F (classify), E, B, C, D, A | yes |
| `diagnosticStore.ts`, `diagnosticText.ts`, `CodeEditor.tsx`, `useDiagnostics.ts` | carry `advice`; wording; underline and muted style; call `adviseDiagnostics` | as today |

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

---

## 5. Expected result on the corpus

This table is the acceptance test (§ 6.1). "Headline" is what the line shows.
Follow-on errors are counted, not listed, and count parsed errors: a `(found: …)`
continuation is part of the error before it, not an error of its own.

| Id | Marked line | Underlined | Headline | Rule | Follow-ons |
|---|---|---|---|---|---|
| range-typo | 33 | `rttange` | `rttange` is not a VHDL keyword — did you mean `range`? | B | 0 |
| range-underscore | 33 | `ra_nge` | `ra_nge` is not a VHDL keyword — did you mean `range`? | B | 0 |
| range-swap | 33 | `rnage` | `rnage` is not a VHDL keyword — did you mean `range`? | B | 0 |
| downto-typo | 13 | `dwonto` | `dwonto` is not a VHDL keyword — did you mean `downto`? | B (line scan) | 13 |
| signal-typo | 34 | `signl` | `signl` is not a VHDL keyword — did you mean `signal`? | B | 0 |
| process-typo | 38 | `proces` | `proces` is not a VHDL keyword — did you mean `process`? | B (line scan) | 19 |
| begin-typo | 39 | `begn` | `begn` is not a VHDL keyword — did you mean `begin`? | B | 11 |
| then-typo | 40 | `than` | `than` is not a VHDL keyword — did you mean `then`? | B | 2 |
| then-missing | 41 (+40) | — | Probably a missing `then` at the end of line 40. | D | 0 |
| endif-joined | 48 (+46) | — | `endif` (line 46) must be two words in VHDL: `end if`. | E | 2 |
| architecture-typo | 25 | `architecure` | `architecure` is not a VHDL keyword — did you mean `architecture`? | B | 10 |
| entity-typo | 10 | `entitiy` | `entitiy` is not a VHDL keyword — did you mean `entity`? | B | 10 |
| is-missing | 31 (+25) | — | Probably a missing `is` at the end of line 25. | D | 0 |
| mode-typo | 12 | `inn` | `inn` is not declared — did you mean `in`? | C | 1 (`was not analysed`) |
| others-typo | 51 | `other` | `other` is not declared — did you mean `others`? | C | 0 |
| semicolon-missing | 33 | `0` | *(GHDL's text, unchanged)* | A | 0 |
| semicolon-missing-assign | 43 (+42) | — | Probably a missing `;` at the end of line 42. | D | 0 (the first error is semantic, § 4.8; its second message on line 43 stays) |
| assign-reversed | 42 | `=<` | *(GHDL's text, unchanged)* | A | 0 |
| const-assign | 31 | `=` | *(GHDL's text, unchanged)* | A | 0 |
| type-typo | 34 | `std_logc` | `std_logc` is not declared — did you mean `std_logic`? | C | 0 (semantic; the 2 later errors stay) |
| function-typo | 40 | `rising_egde` | `rising_egde` is not declared — did you mean `rising_edge`? | C | 0 |
| signal-name-typo | 45 | `couter` | `couter` is not declared — did you mean `counter`? | C | 0 |

**19 of 22 get a headline naming the real mistake, the other 3 keep GHDL's correct
one, and 68 follow-on errors are muted.** Two cases need a second look while
building:

- *type-typo*: its 2 later errors (`no function declarations for operator "not"`,
  `can't match "led_state"`) are consequences of the misspelled type, but they are
  semantic, so D7 keeps them. That is acceptable: the first error is revealed and
  correct.
- *downto-typo*: the first error by position (`13:44`) is not the first GHDL prints
  (`13:52`). Rule F must sort, not trust GHDL's order.

---

## 6. Testing

### 6.1 Golden corpus test (`diagnosticAdvice.golden.test.ts`)

The 22 captures of Appendix A plus their mutated sources become
`diagnostics.corpus.ts`. For each one the test runs
`parse → locate → advise → addToFiles` and compares against § 5: marked line, span
text, headline, and follow-on count. **This test is the definition of done for
phase 2.**

### 6.2 False-positive guards

| Test | Expectation |
|---|---|
| Every identifier in every starter file (`files.ts`: VHDL and the names in `tests/fixtures/vhdl`) | Rule B gives no advice for any of them, including `rtl` (1 edit from `rol`, but only 3 letters) |
| A declared signal near a keyword (`signal rang : …` then an unrelated syntax error on its line) | no Rule B advice for `rang` (declared) |
| Two equally near keywords | no advice (tie) |
| `no declaration for "x"` where nothing is near | no advice; GHDL's text shown |
| A semantic first error followed by another semantic error | no follow-on marking |

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
2. process-typo: line 38 revealed with the advice; the other 20 lines muted.
3. is-missing: line 31 marked and line 25 named; the view shows both.
4. A tab-indented copy of case 1: the underline is still exactly on `rttange`.
5. Fix the typo and press Start: all advice and markers clear, as today.

---

## 7. Implementation steps

### Phase 0 — Commit the corpus

- 0.1 Add `tools/ghdl-typo-corpus.mjs`, the runner used for § 2: it applies each
  mutation of § 2.2 to `blinkTest.vhdl`, runs `ghdl -a --std=08` with a given GHDL
  (and in the Docker image), and writes the captures.
- 0.2 Generate `src/components/workbench/diagnostics.corpus.ts` from it.
- **Done when:** re-running the tool reproduces Appendix A byte for byte (after
  `\r\n` → `\n`) on GHDL 5.0.1 and 6.0.0.

### Phase 1 — Pure helpers

- 1.1 `vhdlWords.ts`, `editDistance.ts`, `ghdlColumn.ts`, `declaredNames.ts` with the
  § 6.3 tests.
- **Done when:** `npm test` passes, and nothing else uses the helpers yet.

### Phase 2 — Advice

- 2.1 `diagnosticAdvice.ts` with Rules F, A, B, C, D, E in that order of building
  (each with its own tests).
- 2.2 The golden test of § 6.1 and the guards of § 6.2.
- **Done when:** § 5 holds for all 22 cases and § 6.2 passes.

### Phase 3 — Store, wording, rendering

- 3.1 `advice` on `LineMessage`; `diagnosticText.ts` wording (§ 4.9).
- 3.2 `CodeEditor.tsx`: spans, muted follow-ons (§ 4.10); `useDiagnostics.ts` calls
  `adviseDiagnostics`.
- **Done when:** every existing diagnostics test passes unchanged, and the runbook of
  § 6.4 passes on both backends.

### Phase 4 — Documentation

- 4.1 Update the markers plan (§ 2.4 item 4 now points here), `src/components/workbench/README.md`,
  and `docs/changelog.txt`.

### Phase 5 — Optional, only if asked

- Verilog (§ 4.12): measure an Icarus corpus first.
- Operator typos and `else if`.

---

## 8. Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | Follow-on lines: muted with a glyph and tooltip, or hidden entirely? | **Muted.** Hiding would make the gutter disagree with the console, and a student who fixes the first error sees them go anyway. |
| 2 | Rules D and E name another line: also mark that line (a secondary, hint-coloured marker), or only name it in the text? | **Mark it**, as a hint without a glyph. The student should see where to look without counting lines. Needs a third marker style. |
| 3 | Reveal target for Rule D: GHDL's line (today) or the named line? | **The named line**, when it is within 10 lines of GHDL's; else GHDL's. |
| 4 | Suggestion wording: *did you mean `x`?* (Python, GCC) or rustc's statement form? | ***did you mean***, per § 3. |
| 5 | Norwegian wording for the course? | Out of scope; `diagnosticText.ts` keeps every string in one place, so a translation is a later, local change. |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A wrong suggestion sends the student the wrong way | D1 (GHDL's text always one hover away), D4's strict thresholds and tie rule, the § 6.2 guards |
| A future GHDL changes a message's wording | Rules match wording only to classify (syntax or semantic, Rule D's table). The corpus test fails loudly, and the fallback is today's behaviour (no advice) |
| Column mapping drifts (tabs, UTF-8) | Measured in § 2.4 and unit-tested; a span that does not land on a token is dropped, never drawn in the wrong place |
| Underline misaligns the textarea overlay | `text-decoration` only; no padding, border or font change (§ 4.10); runbook step 4 |
| Advice on a stale file | Cannot happen: `locateDiagnostics` already drops a file edited during the compile, and advice reads the same snapshot |

---

## Appendix A: measured GHDL output

GHDL 5.0.1 (`winInstaller/vendor/ghdl`) and GHDL 6.0.0 (`hdlboard-backend` image),
`ghdl -a --std=08 blinkTest.vhdl`, identical text. The mutated line is shown first.
For the cascades, the first four messages are given in full, then the count of the
rest.

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
… 10 more: 'end' is expected instead of "ledr", misspelling, "blinktest" expected,
missing ";" at end of entity, and 7 × missing entity, architecture, package or configuration
```

### A.4 signal-typo
```
    signl led_state : std_logic := '0';
blinkTest.vhdl:34:5:error: object class keyword such as 'variable' is expected
```

### A.5 process-typo (21 errors)
```
    proces(CLOCK_500Hz)

blinkTest.vhdl:39:5:error: '<=' is expected instead of 'begin'
blinkTest.vhdl:39:5:error: unexpected token 'begin' in a primary
blinkTest.vhdl:38:24:error: ';' expected at end of signal assignment
blinkTest.vhdl:38:24:error: (found: 'begin')
… 17 more, including: a generate statement must have a label; 'generate' is expected
instead of 'then'; missing ";" at end of generate statement body; missing ";" at end
of architecture; missing entity, architecture, package or configuration
```

### A.6 begin-typo (13 errors)
```
    begn
blinkTest.vhdl:39:5:error: object class keyword such as 'variable' is expected
blinkTest.vhdl:43:17:error: 'begin' is expected instead of "led_state"
blinkTest.vhdl:44:13:error: 'end' is expected instead of 'else'
blinkTest.vhdl:44:13:error: "end" must be followed by 'process'
… 9 more
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
… 10 more of the same message, one per following line

entitiy blinkTest is
blinkTest.vhdl:10:1:error: missing entity, architecture, package or configuration
… 10 more of the same message
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
