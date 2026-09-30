# Verilog Syntax Highlighting — Step-by-Step Build Instructions

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Who this is for:** a small or weak AI model (or a junior developer) building the feature
**without having to design anything**. Every file is given in full, every edit is given as
"find this exact text, replace it with this exact text", and every step ends with a command
and the result it must print. **Copy, don't improvise.**

**Where the design comes from:** [`verilog_syntax_colouring_imp.md`](verilog_syntax_colouring_imp.md)
(the research and the reasons). You do not need to read it to build, but read it if a
step surprises you.

**Status of this recipe:** every file and edit below was built and run in a clean copy of
the repository on 2026-09-30, with these measured results, which your run must match:

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | no output after the `tsc` line | same |
| `npm test` | 20 files, 473 tests pass | **22 files, 515 tests pass** |
| `npm run build` | builds | builds |
| In a browser | `.v` tab coloured wrongly | `.v` tab coloured as Verilog, `.vhdl` tab identical to before |

---

## 0. The goal, in three lines

1. A file whose name ends in `.v` or `.vh` gets **Verilog** colouring in the editor.
2. A file ending in `.vhd` / `.vhdl`, or any other name, is coloured **exactly as before**.
3. `src/components/workbench/vhdlHighlight.ts` keeps all of its logic; it only gets two extra
   words in a type list (step 3).

## 1. Rules for you (read before you touch anything)

1. **Work only in `/home/user/HDLBoard`** (the repository root). Commands below assume it.
2. **Do the steps in order.** Do not start a step before the previous step's check passes.
3. **Create files with the exact text given.** Do not "improve", reformat, rename, re-order
   or shorten it. Not even a comment.
4. **Edit files only as shown** (`FIND` → `REPLACE`). The `FIND` text must match **exactly
   once** in the file. If it matches zero or several times, **stop and report**; do not guess.
5. **Never change an existing test** to make something pass. Never delete a test.
6. **Do not touch** `diagnosticAdvice.ts`, `declaredNames.ts`, `vhdlWords.ts`, `server/`, or
   anything under `winInstaller/`.
7. **Do not add a dependency.** No `npm install <anything>`.
8. **Do not open a pull request.** Commit and push to the branch you were given, nothing else.
9. **If a check fails and the fix is not spelled out here: stop and report** what you ran and
   the exact output. Do not start a second approach.
10. The one trap already known: this project's TypeScript does not know `Array.prototype.at()`.
    The code below does not use it. Do not add it.

## 2. Step 0 — get a clean baseline

```bash
cd /home/user/HDLBoard
git status --short          # must print nothing (or only docs/ files you were told about)
npm ci --no-audit --no-fund # installs from package-lock.json; takes ~10 s
npm run typecheck           # must end with no error lines
npm test                    # must end with: Test Files  20 passed (20) / Tests  473 passed (473)
```

If the numbers are not 20 / 473, the repository has moved on since this recipe was written.
That is fine **only if everything passes**; then use *your* baseline numbers, and expect your
"after" to be `+2 files` and `+42 tests`.
If anything **fails** before you change a thing, stop and report.

## 3. Step 1 — create the Verilog tokenizer

Create **`src/components/workbench/verilogHighlight.ts`** with exactly this content:

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * A small Verilog tokenizer for the code editor's syntax colouring
 * (docs/verilog_syntax_colouring_imp.md).
 *
 * It takes all the lines of a file, not one line: a `/* … *\/` comment
 * can span lines, so the tokenizer carries one flag (inside a block
 * comment) from line to line. Nothing outside this function sees it.
 *
 * The words are Icarus Verilog's own 1364-2005 keyword table
 * (lexor_keyword.gperf, branch v13-branch), so the editor and the
 * compiler agree on what a keyword is. Verilog is case-sensitive.
 * ------------------------------------------------------------------ */

import type { Token } from './vhdlHighlight';

/** Add a word here, not in the regex, to extend the highlighter. */
export const VERILOG_KEYWORDS: ReadonlySet<string> = new Set([
  'always', 'and', 'assign', 'automatic', 'begin', 'buf', 'bufif0', 'bufif1',
  'case', 'casex', 'casez', 'cell', 'cmos', 'config', 'deassign', 'default',
  'defparam', 'design', 'disable', 'edge', 'else', 'end', 'endcase',
  'endconfig', 'endfunction', 'endgenerate', 'endmodule', 'endprimitive',
  'endspecify', 'endtable', 'endtask', 'event', 'for', 'force', 'forever',
  'fork', 'function', 'generate', 'highz0', 'highz1', 'if', 'ifnone',
  'incdir', 'include', 'initial', 'inout', 'input', 'instance', 'join',
  'large', 'liblist', 'library', 'localparam', 'macromodule', 'medium',
  'module', 'nand', 'negedge', 'nmos', 'nor', 'noshowcancelled', 'not',
  'notif0', 'notif1', 'or', 'output', 'parameter', 'pmos', 'posedge',
  'primitive', 'pull0', 'pull1', 'pulldown', 'pullup', 'pulsestyle_onevent',
  'pulsestyle_ondetect', 'rcmos', 'release', 'repeat', 'rnmos', 'rpmos',
  'rtran', 'rtranif0', 'rtranif1', 'scalared', 'showcancelled', 'signed',
  'small', 'specify', 'specparam', 'strong0', 'strong1', 'table', 'task',
  'tran', 'tranif0', 'tranif1', 'unsigned', 'use', 'vectored', 'wait',
  'weak0', 'weak1', 'while', 'xnor', 'xor',
]);

export const VERILOG_TYPES: ReadonlySet<string> = new Set([
  'genvar', 'integer', 'real', 'realtime', 'reg', 'supply0', 'supply1',
  'time', 'tri', 'tri0', 'tri1', 'triand', 'trior', 'trireg', 'uwire',
  'wand', 'wire', 'wor',
]);

// One alternation, most specific first, so `4'b1010` is one number (the based
// form is tried before the plain one, which would take only the `4`). There is
// no `'…'` string alternative: a `'` in Verilog is only ever part of a number.
// The last group takes any other single character, so no character is dropped
// and every line's tokens put together are the line. Punctuation is one
// character at a time, so `;//` cannot hide the start of a comment.
const TOKEN_RE =
  /(\/\/[^\n]*)|(\/\*)|("(?:\\.|[^"\\])*"?)|(`[A-Za-z_][A-Za-z0-9_$]*)|(\$[A-Za-z_][A-Za-z0-9_$]*)|((?:\d[\d_]*)?'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+)|(\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)|(\\\S+)|([A-Za-z_][A-Za-z0-9_$]*)|(\s+)|(\S)/g;

/** The tokens of each line, in order. Block comments may run across lines. */
export function tokenizeVerilog(lines: readonly string[]): Token[][] {
  let inBlockComment = false;
  return lines.map((line) => {
    const tokens: Token[] = [];
    let start = 0;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) {
        if (line.length > 0) tokens.push({ text: line, type: 'comment' });
        return tokens;
      }
      start = end + 2;
      tokens.push({ text: line.slice(0, start), type: 'comment' });
      inBlockComment = false;
    }
    TOKEN_RE.lastIndex = start;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(line))) {
      const [, lineComment, blockStart, str, directive, system, based, num, escaped, word, whitespace, other] = match;
      if (lineComment) {
        tokens.push({ text: lineComment, type: 'comment' });
      } else if (blockStart) {
        const end = line.indexOf('*/', match.index + 2);
        if (end < 0) {
          tokens.push({ text: line.slice(match.index), type: 'comment' });
          inBlockComment = true;
          break;
        }
        tokens.push({ text: line.slice(match.index, end + 2), type: 'comment' });
        TOKEN_RE.lastIndex = end + 2;
      } else if (str) {
        tokens.push({ text: str, type: 'string' });
      } else if (directive) {
        tokens.push({ text: directive, type: 'directive' });
      } else if (system) {
        tokens.push({ text: system, type: 'system' });
      } else if (based || num) {
        tokens.push({ text: based || num, type: 'number' });
      } else if (escaped) {
        tokens.push({ text: escaped, type: 'identifier' });
      } else if (word) {
        tokens.push({
          text: word,
          type: VERILOG_KEYWORDS.has(word) ? 'keyword' : VERILOG_TYPES.has(word) ? 'type' : 'identifier',
        });
      } else if (whitespace) {
        tokens.push({ text: whitespace, type: 'whitespace' });
      } else if (other) {
        tokens.push({ text: other, type: 'punctuation' });
      }
    }
    return tokens;
  });
}
```

Notes (do not act on these, they are only to help you understand it):
the two word lists are Icarus Verilog's own keyword table; Verilog is case-sensitive, so
there is no lower-casing; `tokenizeVerilog` takes **all the lines** because a `/* … */`
comment can span lines; the last regex group `(\S)` takes any other single character so
that no character is ever lost.

**Check:** `npm run typecheck`. It will **fail** with an error about `TokenType` (or
`'directive'`/`'system'` not assignable) — that is expected until step 3. Go on to step 2.

## 4. Step 2 — create the dispatcher

Create **`src/components/workbench/highlight.ts`** with exactly this content:

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Language } from './fileKinds';
import { tokenizeVerilog } from './verilogHighlight';
import { tokenizeVhdlLine, type Token } from './vhdlHighlight';

/**
 * The tokens of every line of a file, by the file's language. Verilog has its own
 * tokenizer; everything else — VHDL, and a name of no known language — takes the VHDL
 * one, line by line, exactly as the editor always has.
 */
export function tokenizeSource(language: Language | undefined, lines: readonly string[]): Token[][] {
  return language === 'verilog' ? tokenizeVerilog(lines) : lines.map(tokenizeVhdlLine);
}
```

It imports `Language` from `fileKinds.ts`, which does not export it yet (step 3 fixes that).

## 5. Step 3 — small edits to existing files

Do the edits **one file at a time**, in this order. After the last one, run the check.

### 5.1 `src/components/workbench/fileKinds.ts` (two edits)

FIND (once):
```ts
type Language = 'vhdl' | 'verilog';
```
REPLACE WITH:
```ts
export type Language = 'vhdl' | 'verilog';
```

FIND (once):
```ts
function languageOfName(name: string): Language | undefined {
```
REPLACE WITH:
```ts
export function languageOfName(name: string): Language | undefined {
```

### 5.2 `src/components/workbench/vhdlHighlight.ts` (one edit — the only one in this file)

FIND (once):
```ts
  | 'number'
  | 'identifier'
```
REPLACE WITH:
```ts
  | 'number'
  | 'directive'
  | 'system'
  | 'identifier'
```

### 5.3 `src/components/workbench/CodeEditor.tsx` (eight edits)

**(a)** FIND (once):
```ts
import { markRanges, tokenizeVhdlLine, type CharRange, type MarkedToken, type Token } from './vhdlHighlight';
```
REPLACE WITH:
```ts
import { languageOfName } from './fileKinds';
import { tokenizeSource } from './highlight';
import { markRanges, type CharRange, type MarkedToken, type Token } from './vhdlHighlight';
```

**(b)** FIND (once):
```ts
  number: 'wb-tok-number',
```
REPLACE WITH:
```ts
  number: 'wb-tok-number',
  directive: 'wb-tok-directive',
  system: 'wb-tok-system',
```

**(c)** FIND (once):
```ts
function HighlightedLine({
  line,
  diagnostic,
```
REPLACE WITH:
```ts
function HighlightedLine({
  line,
  tokens,
  diagnostic,
```

**(d)** FIND (once):
```ts
  line: string;
  diagnostic?: LineDiagnostic;
```
REPLACE WITH:
```ts
  line: string;
  /** The line's tokens (`tokenizeSource`); together they are `line`. */
  tokens: readonly Token[];
  diagnostic?: LineDiagnostic;
```

**(e)** FIND (once):
```ts
  const pieces = markRanges(tokenizeVhdlLine(line), diagnostic
```
REPLACE WITH:
```ts
  const pieces = markRanges(tokens, diagnostic
```
(Only the start of the line is shown so you can match it; the rest of that line stays as it is.)

**(f)** FIND (once):
```ts
 * The tabbed VHDL editor.
```
REPLACE WITH:
```ts
 * The tabbed VHDL and Verilog editor.
```

**(g)** FIND (once):
```ts
  const lines = active ? active.content.split('\n') : [];
```
REPLACE WITH:
```ts
  const lines = active ? active.content.split('\n') : [];
  const language = active ? languageOfName(active.name) : undefined;
  // Whole file at once: a Verilog block comment runs across lines. Recomputed only when the text or language changes.
  const tokenLines = useMemo(
    () => tokenizeSource(language, active ? active.content.split('\n') : []),
    [language, active?.content],
  );
```

**(h)** FIND (once):
```tsx
                  line={line}
                  key={i}
```
REPLACE WITH:
```tsx
                  line={line}
                  tokens={tokenLines[i] ?? []}
                  key={i}
```

### 5.4 `src/components/workbench/CodeEditor.css` (append to the end of the file)

Add a blank line and then these lines at the very end:

```css

/* Verilog only: `timescale / `define / a macro use, and $display-style system tasks. */
.wb-tok-directive {
  color: #be185d;
}

.wb-tok-system {
  color: #0369a1;
}
```

(Both colours were measured: contrast on white is 6.0:1 and 5.9:1, above the 4.5:1 minimum.)

### 5.5 `src/components/workbench/index.ts`

FIND (once):
```ts
export { tokenizeVhdlLine } from './vhdlHighlight';
```
REPLACE WITH:
```ts
export { tokenizeVhdlLine } from './vhdlHighlight';
export { tokenizeVerilog } from './verilogHighlight';
export { tokenizeSource } from './highlight';
```

### 5.6 Check for steps 1–3

```bash
npm run typecheck    # must print only the two "> ..." header lines and NO error
npm test             # must still be: 20 files, 473 tests, all passed (no new tests yet)
```

If `typecheck` shows an error, read it. The most likely cause is an `old → new` edit applied
to the wrong place or twice. Undo that file with `git checkout -- <file>` and redo its edits
from the top of its sub-section. Do **not** run `git checkout` on the two new files.

## 6. Step 4 — the tests

Create **`src/components/workbench/verilogHighlight.test.ts`** with exactly this content:

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { STARTER_FILES } from './files';
import { tokenizeVerilog, VERILOG_KEYWORDS, VERILOG_TYPES } from './verilogHighlight';
import { markRanges, type Token } from './vhdlHighlight';

/** The tokens of one line, without the whitespace, as `type:text`. */
function summary(line: string): string[] {
  return tokenizeVerilog([line])[0]
    .filter((token) => token.type !== 'whitespace')
    .map((token) => `${token.type}:${token.text}`);
}

const fixtureTexts = import.meta.glob<string>('../../../tests/fixtures/verilog/*.v', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Icarus Verilog's lexor_keyword.gperf, generations 1364-1995/2001/2001-config/2005, without the deprecated `wone`. */
const ICARUS_2005_WORDS = `always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config
deassign default defparam design disable edge else end endcase endconfig endfunction endgenerate endmodule
endprimitive endspecify endtable endtask event for force forever fork function generate genvar highz0 highz1
if ifnone incdir include initial inout input instance integer join large liblist library localparam
macromodule medium module nand negedge nmos nor noshowcancelled not notif0 notif1 or output parameter pmos
posedge primitive pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect rcmos real realtime reg
release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify specparam
strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg
unsigned use uwire vectored wait wand weak0 weak1 while wire wor xnor xor`.split(/\s+/);

describe('tokenizeVerilog: numbers', () => {
  test.each(["4'b1010", "8'hFF", "'h0", "8'sd12", "4'b10xz?", "16'h_dead", '1_000', '42', '1.5e-3'])(
    '%s is one number',
    (literal) => {
      expect(summary(literal)).toEqual([`number:${literal}`]);
    },
  );

  test('two sized numbers on a line are not a string (the VHDL tokenizer paints them as one)', () => {
    expect(summary("reg [3:0] a = 4'b0000, b = 1'b1;")).toEqual([
      'type:reg', 'punctuation:[', 'number:3', 'punctuation::', 'number:0', 'punctuation:]',
      'identifier:a', 'punctuation:=', "number:4'b0000", 'punctuation:,',
      'identifier:b', 'punctuation:=', "number:1'b1", 'punctuation:;',
    ]);
  });
});

describe('tokenizeVerilog: comments', () => {
  test('a line comment runs to the end of the line, even right after a semicolon', () => {
    expect(summary('x;// count up')).toEqual(['identifier:x', 'punctuation:;', 'comment:// count up']);
  });

  test('`--` is not a comment', () => {
    expect(summary('i--;')).toEqual(['identifier:i', 'punctuation:-', 'punctuation:-', 'punctuation:;']);
  });

  test('two block comments on one line', () => {
    expect(summary('/* a */ wire w; /* b */')).toEqual([
      'comment:/* a */', 'type:wire', 'identifier:w', 'punctuation:;', 'comment:/* b */',
    ]);
  });

  test('a block comment across lines; the code after the closing mark is coloured normally', () => {
    const lines = ['wire a; /* start', '   still a comment', '   end */ wire b;', 'wire c;'];
    const tokens = tokenizeVerilog(lines);
    expect(tokens[0].map((t) => t.type)).toEqual(['type', 'whitespace', 'identifier', 'punctuation', 'whitespace', 'comment']);
    expect(tokens[1]).toEqual([{ text: '   still a comment', type: 'comment' }]);
    expect(tokens[2][0]).toEqual({ text: '   end */', type: 'comment' });
    expect(tokens[2].slice(1).filter((t) => t.type !== 'whitespace').map((t) => t.type)).toEqual(['type', 'identifier', 'punctuation']);
    expect(tokens[3].some((t) => t.type === 'comment')).toBe(false);
  });

  test('an unterminated block comment runs to the end of the file; an empty line inside it has no tokens', () => {
    expect(tokenizeVerilog(['/* never closed', '', 'wire w;']).map((line) => line.map((t) => t.type))).toEqual([
      ['comment'], [], ['comment'],
    ]);
  });
});

describe('tokenizeVerilog: words', () => {
  test('keywords, types and identifiers; Verilog is case-sensitive', () => {
    expect(summary('module m(input wire Begin);')).toEqual([
      'keyword:module', 'identifier:m', 'punctuation:(', 'keyword:input', 'type:wire', 'identifier:Begin',
      'punctuation:)', 'punctuation:;',
    ]);
  });

  test('`logic` and `bit` are not keywords at the default (1364-2005) generation', () => {
    expect(summary('logic bit')).toEqual(['identifier:logic', 'identifier:bit']);
  });

  test('system tasks, including one with a `$` inside, and directives and macro uses', () => {
    expect(summary('$display("x=%0d", n);')).toEqual([
      'system:$display', 'punctuation:(', 'string:"x=%0d"', 'punctuation:,', 'identifier:n', 'punctuation:)', 'punctuation:;',
    ]);
    expect(summary('$value$plusargs')).toEqual(['system:$value$plusargs']);
    expect(summary('`timescale 1ns/1ps')).toEqual([
      'directive:`timescale', 'number:1', 'identifier:ns', 'punctuation:/', 'number:1', 'identifier:ps',
    ]);
    expect(summary('`WIDTH')).toEqual(['directive:`WIDTH']);
  });

  test('an escaped identifier ends at whitespace', () => {
    expect(summary('\\bus[0] = 1;')).toEqual(['identifier:\\bus[0]', 'punctuation:=', 'number:1', 'punctuation:;']);
  });

  test('a string with an escaped quote; an unterminated string stops at the end of its line', () => {
    expect(summary('"a \\"q\\" b"')).toEqual(['string:"a \\"q\\" b"']);
    const tokens = tokenizeVerilog(['"unterminated', 'wire w;']);
    expect(tokens[0]).toEqual([{ text: '"unterminated', type: 'string' }]);
    expect(tokens[1].some((t) => t.type === 'string')).toBe(false);
  });

  test('a lone `$`, a lone backtick and a lone quote are kept, as punctuation', () => {
    expect(summary("$ ` '")).toEqual(['punctuation:$', 'punctuation:`', "punctuation:'"]);
  });
});

describe('tokenizeVerilog: the keyword table', () => {
  test('keywords and types together are exactly Icarus Verilog\'s 1364-2005 words, and do not overlap', () => {
    expect([...VERILOG_KEYWORDS, ...VERILOG_TYPES].sort()).toEqual([...ICARUS_2005_WORDS].sort());
    expect([...VERILOG_KEYWORDS].filter((word) => VERILOG_TYPES.has(word))).toEqual([]);
  });
});

describe('tokenizeVerilog: whole files', () => {
  const sources = [
    ...STARTER_FILES.filter((file) => file.folder === 'verilog').map((file) => [file.name, file.content] as const),
    ...Object.entries(fixtureTexts).map(([path, text]) => [path.slice(path.lastIndexOf('/') + 1), text] as const),
  ];

  test('there are files to check', () => {
    expect(sources.length).toBeGreaterThanOrEqual(4);
  });

  test.each(sources)('%s: every line\'s tokens put together are the line, and none is empty', (_name, content) => {
    const lines = content.split('\n');
    const tokens = tokenizeVerilog(lines);
    expect(tokens).toHaveLength(lines.length);
    tokens.forEach((line, i) => {
      expect(line.map((t) => t.text).join('')).toBe(lines[i]);
      expect(line.every((t) => t.text.length > 0)).toBe(true);
    });
  });

  test('a Windows line end is kept, as whitespace', () => {
    const tokens = tokenizeVerilog(['wire w;\r'])[0];
    expect(tokens[tokens.length - 1]).toEqual({ text: '\r', type: 'whitespace' });
  });

  test('no input, and an empty line', () => {
    expect(tokenizeVerilog([])).toEqual([]);
    expect(tokenizeVerilog([''])).toEqual([[]]);
  });
});

describe('tokenizeVerilog with markRanges', () => {
  test('a mark inside a Verilog token splits it, and each piece keeps its type', () => {
    const tokens: Token[] = tokenizeVerilog(["4'b1010"])[0];
    expect(markRanges(tokens, [{ start: 2, end: 4 }])).toEqual([
      { text: "4'", type: 'number', marked: false },
      { text: 'b1', type: 'number', marked: true },
      { text: '010', type: 'number', marked: false },
    ]);
  });
});
```

Create **`src/components/workbench/highlight.test.ts`** with exactly this content:

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { STARTER_FILES } from './files';
import { tokenizeSource } from './highlight';
import { tokenizeVerilog } from './verilogHighlight';
import { tokenizeVhdlLine } from './vhdlHighlight';

const vhdlFixtures = import.meta.glob<string>('../../../tests/fixtures/vhdl/*.vhdl', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Every VHDL file we have: the starters and the fixtures. */
const VHDL_SOURCES = [
  ...STARTER_FILES.filter((file) => file.folder !== 'verilog').map((file) => [file.name, file.content] as const),
  ...Object.entries(vhdlFixtures).map(([path, text]) => [path.slice(path.lastIndexOf('/') + 1), text] as const),
];

describe('tokenizeSource keeps VHDL colouring exactly as it was', () => {
  test('there are files to check', () => {
    expect(VHDL_SOURCES.length).toBeGreaterThanOrEqual(6);
  });

  test.each(VHDL_SOURCES)('%s: VHDL and no language both equal tokenizeVhdlLine line by line', (_name, content) => {
    const lines = content.split('\n');
    const expected = lines.map((line) => tokenizeVhdlLine(line));
    expect(tokenizeSource('vhdl', lines)).toEqual(expected);
    expect(tokenizeSource(undefined, lines)).toEqual(expected);
  });

  test('VHDL still treats `--` as a comment and does not see a Verilog comment', () => {
    const tokens = tokenizeSource('vhdl', ['a <= b; -- c'])[0];
    expect(tokens[tokens.length - 1]).toEqual({ text: '-- c', type: 'comment' });
    expect(tokenizeSource('vhdl', ['// c'])[0].some((token) => token.type === 'comment')).toBe(false);
  });
});

describe('tokenizeSource for Verilog', () => {
  test('uses the Verilog tokenizer', () => {
    const lines = ['/* a', 'b */ wire w; // c'];
    expect(tokenizeSource('verilog', lines)).toEqual(tokenizeVerilog(lines));
  });
});
```

**Check:**

```bash
npm run typecheck    # no errors
npm test             # Test Files  22 passed (22)   Tests  515 passed (515)
```

What the tests prove, so you can tell a real failure from a typo:

- `verilogHighlight.test.ts` — sized numbers are one token; the old "two `'` make a
  string" bug is gone; `//` and `/* */` (also across lines) work; keywords are
  case-sensitive; the word lists equal Icarus's 124 words; every line of the Verilog
  starter and fixture files round-trips.
- `highlight.test.ts` — **the VHDL guarantee:** for every VHDL starter and fixture file,
  `tokenizeSource('vhdl' | undefined, …)` is identical to the old `tokenizeVhdlLine`.
  If this ever fails, VHDL colouring has changed — that is a **stop and report**.

If a test fails, read its message, compare your file with the text above character by
character (a missing `\`, a changed regex, a dropped word from the keyword list are the
usual causes), fix **the source file**, not the test.

## 7. Step 5 — look at it in a browser

Only if a browser is available; otherwise say so in your report and go to step 6.

```bash
npm run build                      # must end with "✓ built in …"
npx vite preview --port 4173 &     # serves the build at http://localhost:4173/
```

Open `http://localhost:4173/` and check, in this order:

| # | Do | Must see |
|---|---|---|
| 1 | Look at the `DE1_SoC.vhdl` tab that is open at start | Same colours as before: `library`, `entity`, `in`, `std_logic` … blue/teal; `--` comments green italic |
| 2 | Click `DE1_SoC.v` under the VERILOG folder | `module`, `input`, `output`, `assign`, `endmodule` blue bold; `wire` teal; `7'b1111111` **purple, as one piece**; `//` comments green italic |
| 3 | Click in the `.v` file, press Ctrl+Home, type `/* ` | Every line below turns green italic (a block comment) |
| 4 | Press Backspace three times | The colours come back |
| 5 | Go back to the `.vhdl` tab | Unchanged from check 1 |

Stop the preview server when done (`kill %1`, or close the terminal). Do not commit
`dist/` (it is in `.gitignore`; `git status` must not list it).

## 8. Step 6 — update the documentation

Six small edits. Same rules: `FIND` must match once.

### 8.1 `README.md`

FIND (once):
```
tabbed editor (VHDL syntax highlighting)
```
REPLACE WITH:
```
tabbed editor (VHDL and Verilog syntax highlighting)
```

### 8.2 `src/components/workbench/README.md` (one edit: insert a section)

Find the heading `### `vhdlHighlight.ts`` (it is followed by a code block, then a
paragraph that ends "…add a word there, not in the regex, to extend the highlighter.").
Insert the text below **after that paragraph, with a blank line before and after, and
before the next heading** (`### `files.ts``). The block is fenced with four backticks here
because the text to insert contains its own three-backtick `ts` block; insert only what is
between the four-backtick lines:

````markdown
### `verilogHighlight.ts` and `highlight.ts`

```ts
function tokenizeVerilog(lines: readonly string[]): Token[][]   // one Token[] per line
function tokenizeSource(language: Language | undefined, lines: readonly string[]): Token[][]
```

Verilog has `/* … */` comments that span lines, so `tokenizeVerilog` takes all the
lines of a file and carries a single "inside a block comment" flag from line to
line. `tokenizeSource` is what the editor calls: Verilog files (`languageOfName` in
`fileKinds.ts`) get `tokenizeVerilog`; everything else gets `tokenizeVhdlLine` per
line, exactly as before. The Verilog word lists are Icarus Verilog's own 1364-2005
keyword table, pinned by a test. Two extra token types exist for it, `directive`
and `system`.
````

### 8.3 `docs/Design_Description.md` (two edits)

**(a)** FIND (once; the line starts with 9 spaces):
```
         ├─ vhdlHighlight.ts    line-based VHDL tokenizer for the editor
```
REPLACE WITH:
```
         ├─ vhdlHighlight.ts    line-based VHDL tokenizer for the editor
         ├─ verilogHighlight.ts Verilog tokenizer (carries block-comment state)
         ├─ highlight.ts        picks the tokenizer by file extension
```

**(b)** FIND (4 lines; match exactly):
```
- **Tabbed code editor** — closable tabs, line numbers and VHDL syntax
  highlighting (keywords, types, comments, strings, numbers; Verilog files
  are shown with the same highlighter, which is not Verilog-aware), built on a
  real, editable `<textarea>`, not a static preview.
```
REPLACE WITH (4 lines):
```
- **Tabbed code editor** — closable tabs, line numbers and VHDL or Verilog
  syntax highlighting, chosen by the file's extension (keywords, types,
  comments, strings, numbers; Verilog also colours `$system` tasks and
  `` `directives``), built on a real, editable `<textarea>`, not a static preview.
```

### 8.4 `docs/Verilog_implementation_plan.md` (two edits)

**(a)** FIND (2 lines):
```
Verilog syntax highlighting (§ 9 #6 — until then `.v` is coloured by the VHDL
tokenizer); waveform capture;
```
REPLACE WITH:
```
Verilog syntax highlighting (§ 9 #6 — built later, see
`verilog_syntax_colouring_imp.md`); waveform capture;
```

**(b)** FIND (once):
```
| 6 | **Verilog syntax highlighting** | Out of scope by request; a ~40-line `verilogHighlight.ts` chosen by extension is the follow-up. |
```
REPLACE WITH:
```
| 6 | **Verilog syntax highlighting** | Done: `verilogHighlight.ts`, chosen by extension (docs/verilog_syntax_colouring_imp.md). |
```

### 8.5 `src/components/workbench/vhdlHighlight.ts` — header comment only

FIND (once):
```
 * `/* … *\/` comments are therefore not coloured as comments.
```
REPLACE WITH:
```
 * `/* … *\/` comments are therefore not coloured as comments. Verilog files use
 * verilogHighlight.ts instead (see highlight.ts), which does track them.
```

(This is a comment change inside the file edited in 5.2. No logic changes.)

### 8.6 `docs/verilog_syntax_colouring_imp.md`

FIND (2 lines):
```
**Status: researched and prototyped (2026-09-30); not built.** The prototype (§ 8) lives
in a scratch directory, not in the repository; nothing under `src/` has changed.
```
REPLACE WITH (2 lines):
```
**Status: built (2026-09-30).** The step-by-step recipe that built it is
[`verilog_syntax_highlight_imp_plan.md`](verilog_syntax_highlight_imp_plan.md); the sections below are the research and design it follows.
```

### 8.7 `docs/changelog.txt`

Add **one new line at the very top** of the file (above the current first line), exactly:

```
2026-09-30 - Verilog syntax colouring: .v and .vh files now get Verilog colouring in the editor (keywords and types from Icarus Verilog's own 1364-2005 table, sized numbers like 4'b1010 as one number, // and multi-line /* */ comments, $system tasks, `directives, strings), instead of VHDL's rules - which had painted text between two ' marks as a string and missed // comments. VHDL files (and any other file name) are coloured exactly as before, pinned by a test over every VHDL starter and fixture. New verilogHighlight.ts and highlight.ts (+ tests); CodeEditor picks the tokenizer by file extension. No backend or protocol change. Plan: docs/verilog_syntax_colouring_imp.md; recipe: docs/verilog_syntax_highlight_imp_plan.md.
```

## 9. Step 7 — the manual test script (optional but requested by the plan)

Create **`tests/e2e/verilog-highlight.md`** with exactly this content:

```
<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Verilog syntax colouring — manual check

Run after changing `verilogHighlight.ts`, `highlight.ts` or the `wb-tok-*` colours.

## Prerequisites

- `npm run build`, then `npx vite preview --port 4173`; open `http://localhost:4173/`.

## Steps

1. The `DE1_SoC.vhdl` tab: VHDL keywords blue, `--` comments green italic. (Must look the same as before the Verilog work.)
2. Click `DE1_SoC.v`: `module`, `input`, `assign`, `endmodule` blue bold; `wire` teal; `7'b1111111` one purple piece; `//` comments green italic.
3. Open `blinkTest.v`: `$clog2` in sky blue; `` `timescale `` (if present) in rose; `4'b0000`-style numbers purple.
4. In `DE1_SoC.v` press Ctrl+Home and type `/* `: every line below turns green italic. Backspace three times: colours return.
5. Rename `DE1_SoC.v` to `DE1_SoC.vhd` (double-click the name): it moves to the VHDL folder and is coloured as VHDL; rename back: Verilog colours return.
6. Back to the `.vhdl` tab: unchanged from step 1.
```

## 10. Step 8 — final checks, commit, push

```bash
npm run typecheck     # no errors
npm test              # 22 files, 515 tests, all passed
npm run build         # "✓ built in …"
git status --short    # see the list below
```

`git status --short` must list **exactly** these (no more, no fewer; `dist/` and
`node_modules/` are ignored and must not appear):

```
 M README.md
 M docs/Design_Description.md
 M docs/Verilog_implementation_plan.md
 M docs/changelog.txt
 M docs/verilog_syntax_colouring_imp.md
 M src/components/workbench/CodeEditor.css
 M src/components/workbench/CodeEditor.tsx
 M src/components/workbench/README.md
 M src/components/workbench/fileKinds.ts
 M src/components/workbench/index.ts
 M src/components/workbench/vhdlHighlight.ts
?? src/components/workbench/highlight.test.ts
?? src/components/workbench/highlight.ts
?? src/components/workbench/verilogHighlight.test.ts
?? src/components/workbench/verilogHighlight.ts
?? tests/e2e/verilog-highlight.md
```

Then prove VHDL logic is untouched:

```bash
git diff src/components/workbench/vhdlHighlight.ts
```

The output must contain **exactly these changes and nothing else**: in the header comment,
one changed line (`-` the old ` * \`/* … *\/\` comments are therefore not coloured as comments.`,
`+` the same text, then one more `+` line starting ` * verilogHighlight.ts`), and in the
`TokenType` list two added lines, `+  | 'directive'` and `+  | 'system'`. If you see any
change to `KEYWORDS`, `TYPES`, `TOKEN_RE` or a function body, stop and report.

Commit and push (use the branch you were told to use; do **not** open a PR):

```bash
git add README.md docs src tests
git commit -m "Verilog syntax colouring in the editor

.v/.vh files get a Verilog tokenizer (Icarus's 1364-2005 keywords, sized
numbers, // and multi-line /* */ comments, \$system tasks, directives).
VHDL files are coloured exactly as before, pinned by a test."
git push -u origin <your-branch-name>
```

## 11. Report back with

- The final `npm test` summary line, and `typecheck` / `build` results.
- `git status --short` output and the `git diff` of `vhdlHighlight.ts`.
- What you saw in the browser (step 5), or "no browser available".
- Anything you had to deviate from, and why. If nothing: "no deviations".

## 12. Troubleshooting (the only failures that were seen while writing this)

| Symptom | Cause | Fix |
|---|---|---|
| `typecheck`: `Property 'at' does not exist on type 'Token[]'` | used `.at(-1)` | use `tokens[tokens.length - 1]` (the test files above already do) |
| `typecheck`: `'"directive"' is not assignable to type 'TokenType'` | step 5.2 not done | do step 5.2 |
| `typecheck`: `Language` is not exported from `./fileKinds` | step 5.1 not done | do step 5.1 |
| `highlight.test.ts`: "there are files to check" fails | the fixture glob found fewer than 6 VHDL files | check `tests/fixtures/vhdl/` still has `DE1_SoC.vhdl`, `blinkTest.vhdl`, `keyCouter2Led.vhdl` and the starter project has the same three; otherwise stop and report |
| `verilogHighlight.test.ts`: keyword-table test fails | a word was dropped or added in the lists | compare both lists with the file in step 1, word by word |
| Verilog file is coloured as VHDL in the browser | step 5.3 (g) or (h) missing, or the tab name has no `.v` | re-check 5.3; the language comes from the **file name** |
| A Verilog file looks unchanged after typing | stale build | rerun `npm run build` and reload with cache cleared |
