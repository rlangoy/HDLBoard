# Verilog Syntax Colouring — Implementation Plan

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: researched and prototyped (2026-09-30); not built.** The prototype (§ 8) lives
in a scratch directory, not in the repository; nothing under `src/` has changed.

This is the follow-up that [`Verilog_implementation_plan.md`](Verilog_implementation_plan.md)
§ 1 and § 9 #6 left open: *"Verilog syntax highlighting — a ~40-line
`verilogHighlight.ts` chosen by extension is the follow-up."* The research below shows
that estimate is about half right: the tokenizer itself is small, but **Verilog has
multi-line block comments, and the editor colours one line at a time with no state**, so
the editor needs one contained change as well.

The requirement has two halves, and both are tested (§ 7):

1. `.v` / `.vh` files get real Verilog colouring.
2. `.vhd` / `.vhdl` files (and any file of no known language) are coloured **exactly as
   they are today**. `vhdlHighlight.ts` is not edited.

---

## Contents

1. [What happens today](#1-what-happens-today)
2. [What Verilog needs coloured](#2-what-verilog-needs-coloured)
3. [Options considered](#3-options-considered)
4. [Design](#4-design)
5. [Keeping VHDL unchanged](#5-keeping-vhdl-unchanged)
6. [Build steps](#6-build-steps)
7. [Tests and checks](#7-tests-and-checks)
8. [Prototype results](#8-prototype-results)
9. [Documents to update](#9-documents-to-update)
10. [Open decisions and risks](#10-open-decisions-and-risks)

---

## 1. What happens today

`CodeEditor.tsx` draws the text twice: a transparent `<textarea>` on top, and a `<pre>`
underneath holding one `HighlightedLine` per line. Each `HighlightedLine` calls
`tokenizeVhdlLine(line)` (`CodeEditor.tsx:97`), then `markRanges` to split tokens for the
error underline, then `TokenPiece` maps a token's `type` to a CSS class
(`TOKEN_CLASS`, `wb-tok-*` in `CodeEditor.css`). Nothing in `CodeEditor` knows a file's
language: **a `.v` file goes through the VHDL tokenizer.**

I ran the current tokenizer on Verilog lines (scratch script, same source file):

| Verilog line | What the VHDL tokenizer does | Why |
|---|---|---|
| `assign HEX0_N = 7'b1111111;` | `assign` plain; `7`, `'`, `b1111111` three separate pieces | `'` is a VHDL character-literal quote, and the base-specifier is not a number to it |
| `reg [3:0] a = 4'b0000, b = 1'b1;` | `'b0000, b = 1'` painted as one **string** | two `'` on a line pair up as a VHDL character/string literal — the most visible bug. Of the four fixtures in `tests/fixtures/verilog/`, `DE1_SoC.v` gets one such false string today; any design with two sized literals on one line would |
| `c <= c + 1'b1; // count up` | `//` is punctuation; the comment is **not green** | VHDL comments start with `--` |
| `i--;` | `-- ;` painted as a **comment** | `--` is VHDL's comment; in Verilog it is decrement (SystemVerilog) |
| `always @(posedge CLOCK_50) begin` | only `begin` is a keyword | the keyword list is VHDL's (`begin`, `end`, `if`, `case`… happen to overlap) |
| `$display("x=%0d", LEDR[7:0]);` | `$` punctuation, `"`-strings broken by `%` | no system-task notion |
| `` `timescale 1ns/1ps `` | backtick is punctuation | no compiler-directive notion |
| `/* … */` over several lines | not a comment | line-based; VHDL-2008 has the same gap (noted at the top of `vhdlHighlight.ts`) |

**Who else calls `tokenizeVhdlLine`:** `diagnosticAdvice.ts` and `declaredNames.ts`. Both
are the VHDL "did you mean" advice, which only runs on GHDL errors
(`diagnosticAdvice.ts` header: *"Only GHDL compile errors get advice"*). They must keep
using the VHDL tokenizer and are not touched. `tokenizeVhdlLine` and the `Token` /
`TokenType` types are also re-exported from `index.ts`.

**How the editor learns a file's language:** it does not. `EditorTab` is
`{ id, name, content }`. The one place that knows the extension rules is
`fileKinds.ts` (`languageOfName`, currently module-private, `/\.vh?$/i` → Verilog,
`/\.(vhdl?|vhd)$/i` → VHDL). Reusing it keeps one source of truth for "which language is
this file", as `fileKinds.ts`'s own header demands.

---

## 2. What Verilog needs coloured

Checked against the language itself (IEEE 1364-2005 lexical conventions) and against
**Icarus Verilog's own keyword table**, `lexor_keyword.gperf` (branch `v13-branch`, the
version HDLBoard ships). The editor should agree with the compiler about what is a
keyword.

| Class | Rule | Token type |
|---|---|---|
| Line comment | `//` to end of line | `comment` |
| Block comment | `/*` … `*/`, **may span lines**; an unterminated one runs to the end of the file | `comment` |
| String | `"…"`, `\"` and `\\` escapes; a string cannot span lines, so an unterminated one stops at the end of the line | `string` |
| Number | decimal `42`, `1_000`; real `1.5e-3`; based `4'b1010`, `8'hFF`, `'h0`, `8'sd12`, `4'b10xz?`, `16'h_dead`. Size, base and digits are **one** token. A space is legal between base and digits (`8'h FF`) | `number` |
| Keyword | the 1364-2005 set (below) | `keyword` |
| Data type | `wire reg integer real realtime time genvar uwire tri* wand wor supply0 supply1 trireg` | `type` |
| System task/function | `$` followed by an identifier: `$display`, `$clog2`, `$value$plusargs`. **Any** `$name`, not a list — `$` names cannot be user identifiers, VPI can add more, and a list would rot | `system` (new) |
| Compiler directive / macro use | `` ` `` followed by an identifier: `` `timescale ``, `` `define ``, `` `ifdef ``, and a macro use such as `` `WIDTH `` | `directive` (new) |
| Escaped identifier | `\` then any non-space characters, ended by whitespace (`\bus[0] `) | `identifier` |
| Identifier | `[A-Za-z_][A-Za-z0-9_$]*` (a `$` may appear inside, not first) | `identifier` |
| Everything else | operators and punctuation | `punctuation` |

**Keywords.** Icarus's table has 124 entries enabled by default (generation 1364-2005),
after dropping `wone`, a deprecated early name for `uwire`. I split them in two, the way
the VHDL tokenizer splits `KEYWORDS` and `TYPES`:

```
KEYWORDS (106):
always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config
deassign default defparam design disable edge else end endcase endconfig endfunction
endgenerate endmodule endprimitive endspecify endtable endtask event for force forever
fork function generate highz0 highz1 if ifnone incdir include initial inout input
instance join large liblist library localparam macromodule medium module nand negedge
nmos nor noshowcancelled not notif0 notif1 or output parameter pmos posedge primitive
pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect rcmos release
repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify
specparam strong0 strong1 table task tran tranif0 tranif1 unsigned use vectored wait
weak0 weak1 while xnor xor

TYPES (18):
genvar integer real realtime reg supply0 supply1 time tri tri0 tri1 triand trior
trireg uwire wand wire wor
```

I checked this mechanically: the union of the two lists equals Icarus's 124 with **no
word missing and none extra**. Step 6.1 turns that check into a test, so a future
keyword change is a deliberate edit.

Two consequences worth stating:

- **Verilog is case-sensitive**, VHDL is not. The VHDL tokenizer lower-cases words before
  the lookup; the Verilog one must not (`Begin` is an identifier, `begin` a keyword).
- `logic`, `bit`, `do`, `final`, … are **not** keywords at the default generation (Icarus
  lists them under 1800-2005). They stay plain identifiers, as they are to the compiler
  — HDLBoard compiles without `-g2012`. SystemVerilog is § 10 #1.

---

## 3. Options considered

| Option | For | Against |
|---|---|---|
| **A. Hand-written tokenizer next to the VHDL one** (recommended) | Same shape as `vhdlHighlight.ts`; emits the `Token[]` that `markRanges`, `TokenPiece` and the error underline already consume; no dependency; the lists can be checked against Icarus; ~100 lines | Keyword list is ours to keep |
| B. CodeMirror 6 + `@codemirror/legacy-modes` `verilog` (601 lines, itself a hand-written stream tokenizer) | Mature; also handles SystemVerilog and TL-Verilog | Means replacing the textarea-over-`<pre>` editor (or bolting a second tokenizer system beside it), which the scrollbar, gutter, reveal, drag-drop and diagnostics code are built on — a rewrite, not a colouring change. The legacy mode is a CodeMirror `StreamParser`, not a standalone function |
| C. Prism or highlight.js | Small; Verilog grammar included | New runtime dependency (the app has only `react` and `react-dom`) and a new licence line in README's credits; emits HTML strings or its own token tree, so the error underline would need re-deriving; no per-line state story for the overlay |
| D. Extend the VHDL tokenizer with a `language` flag | Fewer files | Mixes two languages' rules in one regex (VHDL's `'` versus Verilog's `'b`, `--` versus `//`); makes "VHDL unchanged" impossible to show by diff; the VHDL consumers would inherit the risk |

**Recommendation: A**, and it is also what the Verilog plan already named. B and C buy
SystemVerilog, which is out of scope (§ 10 #1), at the price of a rewrite or a
dependency.

---

## 4. Design

### 4.1 Files

| File | Change |
|---|---|
| `src/components/workbench/verilogHighlight.ts` | **new** — `tokenizeVerilog(lines: readonly string[]): Token[][]` |
| `src/components/workbench/highlight.ts` | **new** — `tokenizeSource(language, lines): Token[][]`, the one dispatcher |
| `src/components/workbench/fileKinds.ts` | export `languageOfName` (and the `Language` type); no behaviour change |
| `src/components/workbench/vhdlHighlight.ts` | add two members to the `TokenType` union only (§ 4.3); no logic change |
| `src/components/workbench/CodeEditor.tsx` | tokenize the whole file once per edit, pass each line's tokens to `HighlightedLine` |
| `src/components/workbench/CodeEditor.css` | colours for the two new token types |
| `src/components/workbench/index.ts` | export `tokenizeVerilog` beside `tokenizeVhdlLine` |

### 4.2 Why the API takes all lines, not one line

A block comment's state crosses lines. Three ways to handle that:

1. *Per-line function with an explicit state argument*
   (`tokenizeLine(line, state) → { tokens, state }`) — the CodeMirror/TextMate style.
   Correct, but every caller must thread state and keep it per line.
2. *Regex over the whole text*, then cut tokens at `\n` — one pass, but every token type
   must then be prepared to contain newlines.
3. **A function over all the lines that owns the state** (recommended). The editor
   already has `lines = content.split('\n')`; `tokenizeVerilog(lines)` returns
   `Token[][]`, one array per line, and the only state (`inBlockComment`) is a local
   variable. No caller sees it.

Inside it, each line runs one regex, like the VHDL tokenizer. A line that starts inside a
block comment is coloured up to the first `*/` and then scanned normally; `/*` found
mid-line switches the flag on when its `*/` is not on the same line.

Every line's tokens, joined, equal that line — the same invariant `markRanges` relies on
and that `vhdlHighlight.test.ts` asserts ("the pieces put together are the line"). The
prototype asserts it on all four starter files.

### 4.3 Token types

`Token['type']` gains `'directive'` and `'system'`. This is additive: `diagnosticAdvice`
and `declaredNames` filter on `type === 'identifier'` and the like, never exhaustively,
and they only ever see VHDL tokens. `TokenPiece` and `TOKEN_CLASS` are the only places
that need a new entry. (Verify with `tsc` — § 7.)

| New type | Class | Suggested colour | Reasoning |
|---|---|---|---|
| `directive` | `wb-tok-directive` | `#be185d` (rose) | A preprocessor line is conventionally distinct from keywords |
| `system` | `wb-tok-system` | `#0369a1` (sky) | `$display` reads as a call, not a keyword |

The other classes are reused unchanged, so a Verilog `module` and a VHDL `entity` are the
same blue, comments the same green. Check contrast of both new colours on `#ffffff`
against the existing ones when adding them; the editor has no dark theme today.

### 4.4 Language selection

```ts
// highlight.ts
export function tokenizeSource(language: Language | undefined, lines: readonly string[]): Token[][] {
  return language === 'verilog' ? tokenizeVerilog(lines) : lines.map(tokenizeVhdlLine);
}
```

- `undefined` (a file named `notes.txt`, or a new tab whose name has no known extension)
  takes the VHDL path, because that is what the editor does today. Changing that default
  would change VHDL behaviour.
- In `CodeEditor`: `const language = active ? languageOfName(active.name) : undefined;`
  then
  `const tokenLines = useMemo(() => tokenizeSource(language, lines), [language, active?.content]);`
  and `HighlightedLine` receives `tokens={tokenLines[i]}` instead of calling the tokenizer.
  `markRanges(tokens, …)` is unchanged.
- **Rename** re-colours by itself: `name` changes → `language` changes → the memo
  recomputes. (The file also moves folder; `folderAfterRename` already handles that.)
- Because `lines` is rebuilt on every render today, `useMemo` also removes repeated
  tokenizing on renders that do not change the text (scroll-metrics updates, hover).
  Only `active.content` and `language` are real inputs.

### 4.5 Tokenizer sketch

One alternation, **longest and most specific first**, as in the VHDL tokenizer:

```
//… | /* | "…" | `name | $name | [size]'[s]base digits | decimal/real | \escaped | word | space | punctuation
```

The order is what makes the `4'b0000` bug class impossible: the based-number
alternative is tried *before* the bare-number alternative (which would take `4` and leave
`'b0000`), and there is **no** `'…'` string alternative at all, so two base marks on
a line can never pair up.

Decisions inside it, each found while prototyping:

- Based number: `(\d[\d_]*)?'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+`. The unsized `'hFF`
  form is covered by the optional size. A base with no digits yet (`8'd` while the student
  is still typing) does not match; it falls back to number, punctuation, identifier, which
  is harmless and is replaced by a proper number as soon as a digit is typed.
- Punctuation is matched **one character at a time** in the prototype, not as a run as
  the VHDL tokenizer does (`[^\s…]+`). A run would glue `;` and `//` together, hiding the
  comment start in `x;// c` (checked: the run pattern matches `;//` as one token). One
  character costs nothing visible because punctuation has a single colour.
- Word lookup is an exact, case-sensitive `Set` lookup: `KEYWORDS`, then `TYPES`.
- Keep the lists as two `Set`s at the top, as `vhdlHighlight.ts` does and its README
  section tells maintainers to ("add a word there, not in the regex").

### 4.6 Edge cases and what the tokenizer does

| Input | Result | Notes |
|---|---|---|
| `/* a */ wire w; /* b */` | comment, type, …, comment | two comments on one line |
| unterminated `/*` | rest of file is a comment | as every editor does; typing `*/` later fixes it instantly (whole file re-tokenized) |
| `"unterminated` | string to end of line; next line unaffected | Verilog strings cannot span lines without a `\` at the end of the line, a rarity not worth state |
| `` `define W 4 // c `` | directive, identifier, number, comment | multi-line macros (`\` continuations) colour their later lines normally; acceptable |
| `\bus[0] = 1;` | `\bus[0]` identifier | escaped-identifier rule; the terminating space is not part of it |
| `i--;` | identifier, punctuation, punctuation, punctuation | not a comment, unlike today |
| `$value$plusargs` | one `system` token | `$` allowed inside a `$name` |
| Empty line | no tokens | `HighlightedLine` already prints a space |
| Windows line ends | `split('\n')` leaves a trailing `\r` | becomes a whitespace token (checked); add to the test list |

---

## 5. Keeping VHDL unchanged

Four independent guarantees, strongest first:

1. **No logic in `vhdlHighlight.ts` changes.** The only edit is two extra union members
   in `TokenType`. `git diff` on that file should show nothing else.
2. **The dispatcher's default is VHDL** (§ 4.4): any name that is not a Verilog
   extension takes `lines.map(tokenizeVhdlLine)`, byte-for-byte the current code path.
3. **A regression test pins it.** `highlight.test.ts` (new) asserts, over all three
   starter `.vhdl` files (`STARTER_FILES`) and every file in `tests/fixtures/vhdl/`,
   that `tokenizeSource('vhdl', lines)` deep-equals `lines.map(tokenizeVhdlLine)`, and
   that an unknown-language file equals it too.
4. **The existing suite still passes untouched**: `vhdlHighlight.test.ts`,
   `diagnosticAdvice*.test.ts`, `declaredNames.test.ts` and the golden tests exercise the
   VHDL tokenizer through its real consumers.

The diagnostics (error underline, tint, inline message) sit on `markRanges`, which takes
`Token[]` of either language. Icarus diagnostics carry no column, so a Verilog file gets
the line tint and message and no word underline, exactly as today.

---

## 6. Build steps

Each step leaves the tree green (`npm run typecheck && npm test`).

| # | Step | Done when |
|---|---|---|
| 6.1 | New `verilogHighlight.ts` (lists from § 2, regex from § 4.5) and `verilogHighlight.test.ts` (§ 7). Not yet wired in. | unit tests pass; the keyword-table test passes |
| 6.2 | Export `languageOfName` / `Language` from `fileKinds.ts`; extend `TokenType`. | `tsc` passes; `fileKinds.test.ts` unchanged and passing |
| 6.3 | New `highlight.ts` + `highlight.test.ts`, including the § 5 VHDL-identity test. | passes |
| 6.4 | `CodeEditor.tsx`: compute `tokenLines` with `useMemo`; `HighlightedLine` takes `tokens`; add the two classes to `TOKEN_CLASS`. `CodeEditor.css`: the two colours. | the editor shows both languages; VHDL looks identical (step 6.6) |
| 6.5 | `index.ts` export. Update the docs in § 9. | links resolve |
| 6.6 | Look at it in a browser (`npm run dev`, open `DE1_SoC.v` and `DE1_SoC.vhdl` in two tabs, then upload `tb_counter8.v`): compare a VHDL tab before and after the change, rename a file `.vhd` ↔ `.v` and watch it re-colour, type `/*` mid-file and watch the rest of the file turn into a comment, then `*/`. The repo has no Playwright (the repo dropped it, `tests/e2e/*.md` are manual scripts); add a short `tests/e2e/verilog-highlight.md` in the same style. | checked by eye; screenshot for the changelog entry optional |

---

## 7. Tests and checks

**`verilogHighlight.test.ts`** (Vitest, like the existing suites; pure, no DOM):

| Test | Asserts |
|---|---|
| based numbers | `4'b1010`, `8'hFF`, `'h0`, `8'sd12`, `4'b10xz?`, `16'h_dead`, `1_000`, `1.5e-3` are one `number` token each |
| **the regression** | `reg [3:0] a = 4'b0000, b = 1'b1;` has no `string` token and two `number` tokens |
| comments | `// c`, one-line `/* c */`, two on a line |
| multi-line comment | lines 2..n of `/* … */` are entirely `comment`; the text after `*/` on the last line is tokenized normally; the line after is unaffected |
| unterminated string | colours to the end of the line, next line normal |
| case sensitivity | `begin` keyword, `Begin` identifier |
| system / directive | `$display`, `$value$plusargs`, `` `timescale ``, `` `WIDTH `` |
| escaped identifier | `\bus[0]` one identifier |
| `--` | `i--;` has no `comment` token |
| round trip | for every line of every `tests/fixtures/verilog/*.v` and the three Verilog `STARTER_FILES`, the tokens' texts joined equal the line |
| **keyword table** | the union of `KEYWORDS` and `TYPES` equals a pinned copy of the 124 Icarus words (the list in § 2), and the two sets do not overlap. This turns § 2's manual check into a guard |
| empty input | `tokenizeVerilog([''])` → `[[]]`; `tokenizeVerilog([])` → `[]` |
| composition | `markRanges(tokenizeVerilog([line])[0], range)` splits a Verilog token and keeps its type (same as the existing `markRanges` tests) |

**Also:** `highlight.test.ts` (§ 5, item 3); `npm run typecheck`; `npm test`; ESLint if
the root config covers `src/` (only `server/` has a config, so nothing to run there).
Performance: keep the tokenizer single-pass with one regex per line, and let the editor
`useMemo` it (§ 4.4) — see § 8 for the measurement.

---

## 8. Prototype results

Built in a scratch directory, from copies of the repo files; no repository file was
modified. Node 22 running TypeScript directly.

- **Tokens, all four Verilog fixtures** (`DE1_SoC.v`, `blinkTest.v`, `keyCouter2Led.v`,
  `tb_counter8.v`): round trip holds on every line; the three design files have no `string` token
  (today's VHDL tokenizer paints one false string in `DE1_SoC.v`); `blinkTest.v` gets one
  `system` (`$clog2`) and `tb_counter8.v` five (`$display`, `$finish`) and its four real
  strings.
- **Every line of the § 4.6 table** behaves as stated, including the block comment across
  three lines, two block comments on one line, `\bus[0]`, `$value$plusargs`, and
  `i--;`.
- **Keyword lists vs Icarus:** 106 + 18 = 124, equal to `lexor_keyword.gperf`'s entries
  for generations 1364-1995, 2001, 2001-config and 2005 (minus `wone`); none missing, none
  extra.
- **Speed:** 5000 lines of dense code (one `always` line each, with a based number and a
  comment) tokenized in about 150 ms **cold** in Node, which includes compiling the
  regex for every line in the prototype; the real version compiles it once (module-level,
  as `TOKEN_RE` is), and only runs when the text or the language changes. The starter
  files are 40–150 lines. The VHDL tokenizer has the same cost profile.
- **Windows line ends:** a trailing `\r` becomes a `whitespace` token; nothing else changes.
- **Not yet run:** the React integration (§ 6.4) and the browser check (§ 6.6). The
  prototype covers the tokenizer only.

---

## 9. Documents to update

| Document | Edit |
|---|---|
| `README.md` (Features, "A small IDE") | "VHDL syntax highlighting" → "VHDL and Verilog syntax highlighting" |
| `src/components/workbench/README.md` | the feature bullet that says Verilog files use a highlighter "which is not Verilog-aware"; and the `### vhdlHighlight.ts` section: add `verilogHighlight.ts` and `highlight.ts`, and replace "no state needs to carry across lines" with the per-language statement |
| `docs/Design_Description.md` | the file tree (line ~201, add the two files) and the feature bullet around line 942 |
| `docs/Verilog_implementation_plan.md` | § 1 non-goals and § 9 #6: mark done and point here |
| `docs/changelog.txt` | one dated entry, same style as its neighbours |
| `src/components/workbench/vhdlHighlight.ts` header comment | mention that `.v` files use `verilogHighlight.ts` |

---

## 10. Open decisions and risks

| # | Decision or risk | Recommendation |
|---|---|---|
| 1 | **SystemVerilog (`.sv`)** and the words `logic bit do final always_ff …` | Not now: HDLBoard accepts only `.v`/`.vh` and compiles at 1364-2005. When `.sv` arrives (Verilog plan § 9 #1), add a third `Language`, a larger keyword set from the 1800-2005/2009/2012 generations of the same gperf file, and `tokenizeSource` picks it. No design change needed; this plan's shape is the reason it is cheap. |
| 2 | **VHDL-2008 `/* */` comments** stay uncoloured | Out of scope, and "VHDL unchanged" is a requirement. The mechanism built here (a tokenizer over all the lines) would fix it in a few lines later; say so in `vhdlHighlight.ts`'s header rather than change it now. |
| 3 | **Typing `/*` turns the rest of the file green** until `*/` | Correct, and the same in every editor. It is whole-file re-tokenizing that makes the colour return the instant `*/` is typed. |
| 4 | **Stale-looking colours on the line being typed** | None expected: the overlay re-renders from `active.content` on every change, as today. |
| 5 | **Unknown extension defaults to VHDL colouring** | Keeps today's behaviour. If wanted, a plain "no colouring" mode for unknown names is a separate, visible change. |
| 6 | **Keyword list drift** | The pinned-list test (§ 7) makes a change deliberate; the source of truth is Icarus's `lexor_keyword.gperf`, and the keyword test's comment should name it. |
| 7 | **`` `define `` bodies and `` `include `` file names** | The bodies colour as ordinary code and `` `include "file.vh" `` shows a directive then a string. Good enough; a preprocessor-aware colourer is not worth its complexity for a teaching tool. |
| 8 | **Colour accessibility** | Two new colours on white: verify contrast ≥ 4.5:1 when choosing them (§ 4.3). Colour is not the only cue for errors and this plan leaves that untouched. |
