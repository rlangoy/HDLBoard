# Symbol Occurrence Highlighting — Implementation Specification

**Project:** [HDLBoard](https://github.com/rlangoy/HDLBoard) (verified against v1.4.0, `main`, 10 Oct 2026)
**Feature:** hovering a signal, variable, port, generic, constant, parameter or I/O declaration in the VHDL/Verilog editor highlights its declaration and every reference in scope.
**Status:** ready to implement. Every code block below has been applied to a clean HDLBoard checkout and passes `npm run typecheck`, `npm test` (1326 tests, 30 new) and `npm run build`.
**Save this file in the repository as:** `docs/symbol_occurrence_highlighting.md` (the source comments point there).

---

## 0. How to use this document (read first if you are the implementing model)

1. Work through **Section 6, Steps 1–13, in order.** Do not skip, merge or reorder steps.
2. **Copy every code block verbatim.** Do not rename, "improve", reformat or add features. The code was tested exactly as written.
3. After each step run the **Verify** command. If it fails, fix the step you just did before moving on — never continue on a red build.
4. **Add no dependencies.** `package.json` must not change.
5. Edit only the files the steps name. Two existing files change (`EditorSurface.tsx`, `CodeEditor.css`); everything else is new, in `src/components/workbench/symbols/`.
6. A ready-made patch of the same change exists (`symbol-occurrence-highlighting.patch`). `git apply symbol-occurrence-highlighting.patch` from the repository root gives the same result as Steps 1–13.

---

## 1. Behaviour

When the mouse rests (≈100 ms) on an identifier in the editor:

- The identifier is resolved to **its declaration by scope**, not by text matching. An inner declaration shadows an outer one with the same name.
- The **declaration** gets a light-blue background with a blue outline.
- Every **reference** gets the light-blue background only.
- The highlight disappears when the pointer leaves the editor, moves to something that is not a resolvable name (keyword, comment, string, whitespace, unknown name), or moves to another symbol.
- After an edit, the highlight is recomputed from the new text automatically.
- Hovering never re-parses: the file is analysed once per edit, and a hover is one lookup.
- Scrolling the text under a still pointer drops the hover highlight until the pointer moves again.

The **text cursor** highlights the same way (`symbols/useCaretSymbol.ts`): clicking a name, selecting it, or moving the cursor onto it (or just after it, `count|`) lights it up, and the highlight stays while the mouse goes elsewhere. A selection that spans more than one name highlights nothing. While the pointer rests on a name, the hover wins.

Shadowing examples that must work (both are unit tests):

```vhdl
signal data : std_logic;
process
    variable data : std_logic;   -- hover here → this line + "data := '1'"
begin
    data := '1';
end process;
data <= '0';                     -- hover here → "signal data" + this line
```

```verilog
wire valid;
always @(*) begin
    reg valid;                   // hover here → this line + "valid = 1'b1"
    valid = 1'b1;
end
```

---

## 2. Decisions

| Question | Decision | Why |
|---|---|---|
| Replace the editor with Monaco or CodeMirror 6? | **No.** Extend the existing editor. | HDLBoard's editor is a transparent `<textarea>` over a tokenised `<pre>`, and it already merges character ranges into the token stream for diagnostic underlines (`markRanges`). Occurrence highlighting is one more kind of range. Migrating would mean rewriting the diagnostics overlay, gutter, reveal-line and custom scrollbars for one feature. |
| Use a library for name resolution? | **No.** A small pure TypeScript analyser. | No browser library resolves VHDL/Verilog scopes. CodeMirror's `@codemirror/legacy-modes` has `vhdl` and `verilog` modes, but they only colour tokens. Monaco has no HDL semantics. Language servers (VHDL-LS/rust_hdl, svlangserver) are native/Node processes that need a WebSocket bridge, project configuration and lifecycle management: far too heavy for v1. |
| Reuse existing code? | **Yes.** | The analyser reads the editor's own tokenizer output (`tokenizeSource`), so highlighting and analysis agree on what is a comment, string, keyword or identifier. Rendering reuses `markRanges`. The Verilog name-list rules are the ones in `verilogDeclaredNames.ts`. |
| Incremental parsing? | **No.** | `useMemo` rebuilds the index when the text changes. A 1 600-line file analyses well under the 100 ms hover delay (there is a test). Incremental machinery would add complexity with no visible benefit. |
| Cross-file references (testbench ↔ design)? | **Not in v1.** | Current-file only, as the spec says ("current scope"). |
| Pointer → character position | **Arithmetic**, not DOM lookup. | The text is monospace, never wraps (`wrap="off"`) and all lines are the same height, so line = ⌊y / line-height⌋ and column = ⌊x / char-width⌋ (with tabs expanded). |

Possible later upgrade: replace only the analysis layer (`vhdlSymbols.ts` / `verilogSymbols.ts`) with a tree-sitter parser (`web-tree-sitter` plus VHDL/Verilog grammars compiled to WASM). The `Analysis` interface (Step 3) is the seam; nothing else would change.

---

## 3. Review of the earlier recommendation documents

Four documents were reviewed. What was kept and what was corrected:

| Document | Kept | Corrected |
|---|---|---|
| `HDLBoard_Symbol_Occurrence_Highlighting.md` (original spec) | Behaviour, colours, scope examples, debounce 75–150 ms, "no reparse on hover", acceptance criteria. | Written in C# (`DispatcherTimer`, classes): translated to TypeScript types and a React hook. "Incremental parse" dropped (see Section 2). |
| `hdlboard-symbol-occurrence-highlighting-implementation-recommendations.md` (previous version of this file) | Keep the overlay editor; pure index + hook + CSS; `useMemo` as the invalidation mechanism; tests from the spec examples. | **`caretRangeFromPoint` on the `<pre>` does not work**: the `<pre>` has `pointer-events: none` and lies *under* the textarea, so the browser only ever finds the textarea. Replaced by arithmetic (`pointerPosition.ts`). It also said the tokenizer "already tags" scope keywords; it does not (see Section 4). |
| `Symbol_Occurrence_Highlighting_Recommendations.md` | Same architecture; reuse the `declaredNames` patterns; coordinates from the editor's CSS metrics; tree-sitter as a later upgrade. | Uses a CSS `outline`/border idea and line/column spans; this spec uses an inset `box-shadow` (never moves glyphs) and the editor's existing 0-based `{start, end}` convention so it plugs straight into `markRanges`. |
| `HDLBoard_Symbol_Occurrence_Highlighting_Reviewed.md` | Separation into controller / service / decoration layers; stale-result safety; explicit support matrix; tests for case rules, comments, multi-name declarations. | Recommends evaluating Monaco and language servers first. After inspecting the repository, both are rejected for v1 (Section 2). Its async/stale-result machinery is unnecessary because the analysis is synchronous: the hook stores only *where* the pointer is, and the symbol is looked up in the current index on every render, so a stale result cannot exist. |

---

## 4. Facts about the HDLBoard code this design relies on

All verified in the repository (v1.4.0):

- `package.json` dependencies: only `react` and `react-dom`. Tests: `vitest` with `environment: 'node'` and `include: ['src/**/*.test.ts']`, so tests must be pure (no DOM) and named `*.test.ts`.
- `src/components/workbench/EditorSurface.tsx` renders, per file: a gutter, a `<pre className="wb-editor__highlight">` with one `HighlightedLine` per line, and a `<textarea className="wb-editor__textarea">` on top with transparent text.
- `CodeEditor.css`: `.wb-editor__highlight { pointer-events: none; }`; both layers share `--wb-code-font`, `--wb-code-size: 13px`, `--wb-code-line-h: 20px`, `--wb-code-pad-top: 12px`, `--wb-code-pad-x: 16px`, `white-space: pre`, `tab-size: 4`. Glyph metrics in the `<pre>` must never change, or the textarea caret drifts away from the visible text. That is why highlights may only use `background` and `box-shadow` (no border, padding or margin).
- `tokenizeSource(language, lines)` (`highlight.ts`) returns `Token[][]` (one array per line; the tokens of a line concatenate to the line). VHDL uses `tokenizeVhdlLine`, Verilog uses `tokenizeVerilog` (handles `/* */` across lines).
- `Token = { text, type }`, `type` ∈ `keyword | type | comment | string | number | directive | system | identifier | punctuation | whitespace`.
- **VHDL tokenizer quirks the analyser must handle:**
  - Neighbouring punctuation is one token: `);`, `),`, `:=`, `=>`. → `sourceTokens.ts` splits punctuation into single characters, keeping `:=`, `=>`, `<=`, `>=`, `/=`, `**` whole.
  - Its keyword list is short: `type`, `subtype`, `procedure`, `block`, `generate`, `package`, `alias`, `body`, `record` are tokenised as **`identifier`**. → the analyser compares the lower-cased **text**, never `token.type`, for these words.
  - VHDL is case-insensitive; Verilog is case-sensitive (`verilogHighlight.ts`).
- `markRanges(tokens, ranges)` (`vhdlHighlight.ts`) splits tokens at range boundaries and marks pieces; ranges are `{ start, end }`, 0-based, end exclusive. Diagnostics use it for the wavy underline.
- `languageOfName(name)` (`fileKinds.ts`) returns `'vhdl' | 'verilog' | undefined`; unknown names are coloured as VHDL, and this feature does the same.
- Existing pure helpers `declaredNames.ts` and `verilogDeclaredNames.ts` find declared names by token pattern. Their rules are reused, but they return names, not positions, so they cannot be called directly.

---

## 5. Architecture

```text
EditorSurface.tsx                               (existing; ~15 changed lines)
  ├─ tokenizeSource(...)            existing    → Token[][]          (memo: text)
  ├─ buildSymbolIndex(...)          NEW, pure   → SymbolIndex        (memo: tokens)
  ├─ useHoveredSymbol(lines, index) NEW, hook   → { symbol, handlers }
  ├─ occurrencesByLine(symbol)      NEW, pure   → Map<line, Occurrence[]>
  └─ HighlightedLine → decorateLine NEW, pure   → pieces with CSS classes

symbols/
  types.ts            shared data types                                  pure
  sourceTokens.ts     Token[][] → positioned tokens (drops comments…)    pure
  analysis.ts         Analysis interface, ScopeTracker, small helpers    pure
  vhdlSymbols.ts      VHDL scopes + declarations   → Analysis            pure
  verilogSymbols.ts   Verilog scopes + declarations → Analysis           pure
  symbolIndex.ts      shared name resolution → SymbolIndex               pure
  occurrences.ts      symbol → spans to paint, by line                   pure
  decorateLine.ts     tokens + diagnostics + occurrences → pieces        pure
  pointerPosition.ts  pointer x/y → (line, offset)                       pure
  useHoveredSymbol.ts debounce, pointer events, metrics                  React + DOM
```

**Dependency rules (this is what keeps it from becoming spaghetti):**

- Language analysers know **only** language rules (which words open/close scopes, which declare). They never resolve names.
- `symbolIndex.ts` knows **only** resolution (walk scopes outwards, first declaration wins). It contains no VHDL or Verilog words.
- Only `useHoveredSymbol.ts` touches the DOM or timers. Everything else is pure and unit-tested in Node.
- `EditorSurface.tsx` only wires things together; it contains no HDL rules and no geometry.
- Nothing in `symbols/` imports from `EditorSurface.tsx`.

**Resolution algorithm** (in `symbolIndex.ts`):

1. The analyser walks the tokens once, keeping a stack of open scopes, and records for every token the scope it is in, plus which tokens are declarations (and of what kind) and which names to skip.
2. Declarations are entered into their scope's table (`Map<name, symbol>`), in file order. A second declaration of the same name in the same scope (`output q; reg q;`) is shown as a use of the first.
3. Every other identifier is looked up from its own scope outwards through the parent chain; the first hit is its symbol.
4. All declarations and resolved references are grouped by line, so `symbolAt(line, offset)` scans only the names on one line.

An architecture's scope is opened **inside its entity's scope**, so ports and generics are visible in the architecture, and two entities in one file stay separate.

---

## 6. Step-by-step implementation

Run from the repository root. Before Step 1, confirm the baseline is green:

```bash
npm ci
npm run typecheck && npm test
```

### Step 1 — Shared types

**Create** `src/components/workbench/symbols/types.ts` with exactly this content.

Data types only. Positions use the editor's existing convention: 0-based line, 0-based offsets, end exclusive.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Shared types for symbol occurrence highlighting
 * (docs/symbol_occurrence_highlighting.md). Pure data: no React, no DOM.
 *
 * Positions follow the editor's existing convention (vhdlHighlight.ts CharRange):
 * a 0-based line, and 0-based character offsets in that line, end exclusive.
 */

/** What a declaration declares. Only these kinds are highlighted. */
export type SymbolKind =
  // VHDL
  | 'signal'
  | 'variable'
  | 'constant'
  | 'generic'
  | 'port'
  | 'parameter'
  | 'alias'
  | 'type'
  | 'enum-literal'
  // Verilog
  | 'wire'
  | 'reg'
  | 'logic'
  | 'localparam'
  | 'genvar';

export type OccurrenceKind = 'declaration' | 'reference';

/** Where a name is written in the file. */
export interface SourceSpan {
  /** 0-based line. */
  readonly line: number;
  /** 0-based offset of the first character. */
  readonly start: number;
  /** 0-based offset just after the last character. */
  readonly end: number;
}

/** One declared name and every place that refers to it. */
export interface HdlSymbol {
  /** Stable within one analysis: the declaration's position, e.g. "4:11". */
  readonly id: string;
  /** As written at the declaration. */
  readonly name: string;
  readonly kind: SymbolKind;
  readonly declaration: SourceSpan;
  readonly references: readonly SourceSpan[];
}

/** A span to paint, and how. */
export interface Occurrence extends SourceSpan {
  readonly kind: OccurrenceKind;
}

/** The result of analysing one file. Built once per edit; hover only reads it. */
export interface SymbolIndex {
  /** The symbol whose declaration or reference covers this character, if any. */
  symbolAt(line: number, offset: number): HdlSymbol | undefined;
}
```

**Verify:** `npm run typecheck` passes.

### Step 2 — Positioned tokens

**Create** `src/components/workbench/symbols/sourceTokens.ts` with exactly this content.

Turns the editor's `Token[][]` into one flat list with positions. Drops whitespace, comments and strings (so a name inside a comment is never highlighted) and splits joined punctuation.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Token, TokenType } from '../vhdlHighlight';
import type { SourceSpan } from './types';

/** A token the symbol analysis looks at, with its position in the file. */
export interface SourceToken extends SourceSpan {
  readonly text: string;
  readonly type: TokenType;
}

/** Tokens that can never name or mark a declaration. */
const IGNORED: ReadonlySet<TokenType> = new Set(['whitespace', 'comment', 'string']);

/**
 * The VHDL tokenizer joins neighbouring punctuation (`);`, `),`, `:=`). The analysis
 * needs single characters, except for these operators, which keep their meaning
 * only as a pair: `:=` is not `:`, and `=>` marks a formal in a port map.
 */
const PUNCTUATION_PIECE = /:=|=>|<=|>=|\/=|\*\*|[\s\S]/g;

/**
 * Every significant token of a file, in order, from the editor's own tokenizer
 * output (`tokenizeSource`). Whitespace, comments and strings are dropped, and
 * punctuation is split so that `(` `)` `;` `,` are always tokens of their own.
 */
export function sourceTokens(tokenLines: readonly (readonly Token[])[]): SourceToken[] {
  const result: SourceToken[] = [];
  tokenLines.forEach((tokens, line) => {
    let offset = 0;
    for (const token of tokens) {
      if (!IGNORED.has(token.type)) result.push(...piecesOf(token, line, offset));
      offset += token.text.length;
    }
  });
  return result;
}

function piecesOf(token: Token, line: number, start: number): SourceToken[] {
  if (token.type !== 'punctuation') {
    return [{ text: token.text, type: token.type, line, start, end: start + token.text.length }];
  }
  return [...token.text.matchAll(PUNCTUATION_PIECE)].map((match) => {
    const pieceStart = start + (match.index ?? 0);
    return { text: match[0], type: token.type, line, start: pieceStart, end: pieceStart + match[0].length };
  });
}
```

**Verify:** `npm run typecheck` passes.

### Step 3 — Analysis interface and scope tracker

**Create** `src/components/workbench/symbols/analysis.ts` with exactly this content.

The contract between a language analyser and the shared resolver, plus the scope stack. `ScopeTracker.close()` never closes the file scope, so unbalanced student code (a missing `end`) cannot crash anything.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { SourceToken } from './sourceTokens';
import type { SymbolKind } from './types';

/**
 * What a language analyser (vhdlSymbols.ts, verilogSymbols.ts) reports about a
 * file. It holds only language facts: scopes, declarations, names to skip.
 * Name resolution is shared and lives in symbolIndex.ts.
 */
export interface Analysis {
  /** The parent of each scope. Scope 0 is the whole file; its parent is -1. */
  readonly scopeParents: readonly number[];
  /** The scope each token is in, by token index. */
  readonly tokenScopes: readonly number[];
  /** Token index → the kind of symbol that token declares. */
  readonly declarations: ReadonlyMap<number, SymbolKind>;
  /** Token indices of names that are neither declarations nor references (a port-map formal, say). */
  readonly ignored: ReadonlySet<number>;
}

export const FILE_SCOPE = 0;
const NO_PARENT = -1;

/** A stack of open scopes that also remembers every scope's parent. */
export class ScopeTracker {
  private readonly parents: number[] = [NO_PARENT];
  private readonly stack: number[] = [FILE_SCOPE];

  get current(): number {
    return this.stack[this.stack.length - 1];
  }

  /** Opens a new scope inside `parent` (normally the current one) and enters it. */
  open(parent: number = this.current): number {
    const id = this.parents.length;
    this.parents.push(parent);
    this.stack.push(id);
    return id;
  }

  /** Leaves the current scope. The file scope is never closed, so unbalanced code is safe. */
  close(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  get scopeParents(): readonly number[] {
    return this.parents;
  }
}

/** Collects declarations; the first kind recorded for a token wins. */
export class DeclarationMap {
  readonly entries = new Map<number, SymbolKind>();

  add(tokenIndex: number, kind: SymbolKind): void {
    if (!this.entries.has(tokenIndex)) this.entries.set(tokenIndex, kind);
  }
}

/** The index of the bracket that closes the one at `open`, or the last token if it is never closed. */
export function matchingClose(tokens: readonly SourceToken[], open: number, opening = '(', closing = ')'): number {
  let depth = 0;
  for (let j = open; j < tokens.length; j++) {
    if (tokens[j].text === opening) depth++;
    else if (tokens[j].text === closing && --depth === 0) return j;
  }
  return tokens.length - 1;
}

export function isIdentifier(token: SourceToken | undefined): token is SourceToken {
  return token?.type === 'identifier';
}
```

**Verify:** `npm run typecheck` passes.

### Step 4 — VHDL analyser

**Create** `src/components/workbench/symbols/vhdlSymbols.ts` with exactly this content.

Language rules only. Read the header comment: it lists exactly what is supported.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * VHDL scopes and declarations, found by walking tokens rather than by parsing.
 * Only language facts live here; resolving names is symbolIndex.ts's job.
 *
 * Scopes: entity, architecture (inside its entity, so ports are visible), package,
 * process, block, generate, component, configuration, function and procedure.
 * Each closes at an `end` that is not `end if` / `end case` / `end loop` / … .
 *
 * Declarations: signal, variable, constant, alias, type, subtype, enumeration
 * literals, and the names in port, generic and subprogram parameter lists.
 * VHDL is case-insensitive; symbolIndex.ts compares names in lower case.
 */

import {
  DeclarationMap,
  isIdentifier,
  matchingClose,
  ScopeTracker,
  type Analysis,
} from './analysis';
import type { SourceToken } from './sourceTokens';
import type { SymbolKind } from './types';

/** Keywords that open a scope (when they do not follow `end` or a label's `:`). */
const SCOPE_OPENERS: ReadonlySet<string> = new Set([
  'entity', 'architecture', 'package', 'process', 'block', 'generate', 'component', 'configuration',
]);
const SUBPROGRAMS: ReadonlySet<string> = new Set(['function', 'procedure']);
/** `end if`, `end loop`, …: these close a statement, never one of our scopes. */
const NON_SCOPE_ENDS: ReadonlySet<string> = new Set(['if', 'case', 'loop', 'record', 'units', 'protected', 'for']);
/** `u0 : entity work.counter`, `u1 : component counter`: an instance, not a declaration. */
const INSTANTIABLE: ReadonlySet<string> = new Set(['entity', 'component', 'configuration']);
/** `signal a, b : …` */
const OBJECT_DECLARATIONS: ReadonlyMap<string, SymbolKind> = new Map([
  ['signal', 'signal'],
  ['variable', 'variable'],
  ['constant', 'constant'],
]);
/** `port (…)`, `generic (…)` */
const INTERFACE_LISTS: ReadonlyMap<string, SymbolKind> = new Map([
  ['port', 'port'],
  ['generic', 'generic'],
]);
/** Words that may start an item of an interface list: `(signal x : out bit; constant n : integer)`. */
const INTERFACE_CLASS_WORDS: ReadonlySet<string> = new Set(['signal', 'variable', 'constant', 'file']);

export function analyzeVhdl(tokens: readonly SourceToken[]): Analysis {
  const scopes = new ScopeTracker();
  const declarations = new DeclarationMap();
  const ignored = new Set<number>();
  const tokenScopes: number[] = [];
  const entityScopes = new Map<string, number>();
  /** Subprogram scopes whose `is` has not been seen yet, with the bracket depth they opened at. */
  const pendingSubprograms = new Map<number, number>();
  let depth = 0;
  let inEndStatement = false;

  for (let i = 0; i < tokens.length; i++) {
    tokenScopes[i] = scopes.current;
    const token = tokens[i];
    const word = token.text.toLowerCase();

    if (token.text === '(') depth++;
    else if (token.text === ')') depth--;

    // `end process blink;`: the words up to the `;` close a scope; they declare and refer to nothing.
    if (inEndStatement) {
      if (token.text === ';') inEndStatement = false;
      else if (isIdentifier(token)) ignored.add(i);
      continue;
    }
    if (word === 'end') {
      if (!NON_SCOPE_ENDS.has(tokens[i + 1]?.text.toLowerCase() ?? '')) scopes.close();
      inEndStatement = true;
      continue;
    }

    // A function or procedure declared without a body (`function f (a : bit) return bit;`) ends at its `;`.
    const pendingAt = pendingSubprograms.get(scopes.current);
    if (pendingAt === depth && word === 'is') pendingSubprograms.delete(scopes.current);
    if (pendingAt === depth && token.text === ';') {
      pendingSubprograms.delete(scopes.current);
      scopes.close();
      continue;
    }

    const isInstance = tokens[i - 1]?.text === ':' && INSTANTIABLE.has(word);
    if (SCOPE_OPENERS.has(word) && !isInstance) openScope(tokens, i, word, scopes, entityScopes);

    if (SUBPROGRAMS.has(word)) {
      pendingSubprograms.set(scopes.open(), depth);
      const open = indexOfOpenBracket(tokens, i + 1);
      if (open !== undefined) declareAll(declarations, interfaceNames(tokens, open), 'parameter');
    }

    const listKind = INTERFACE_LISTS.get(word);
    if (listKind && tokens[i + 1]?.text === '(') declareAll(declarations, interfaceNames(tokens, i + 1), listKind);

    const objectKind = OBJECT_DECLARATIONS.get(word);
    if (objectKind) declareAll(declarations, namesBeforeColon(tokens, i + 1), objectKind);

    if (word === 'alias' && isIdentifier(tokens[i + 1])) declarations.add(i + 1, 'alias');
    if ((word === 'type' || word === 'subtype') && isIdentifier(tokens[i + 1])) declarations.add(i + 1, 'type');
    if (word === 'type') declareAll(declarations, enumerationLiterals(tokens, i), 'enum-literal');
    if (word === 'record') recordFieldNames(tokens, i).forEach((j) => ignored.add(j));
    if (word === 'map' && tokens[i + 1]?.text === '(') formalNames(tokens, i + 1).forEach((j) => ignored.add(j));

    // A label (`blink : process`) is a name followed by `:` that declares nothing.
    if (isIdentifier(token) && tokens[i + 1]?.text === ':' && !declarations.entries.has(i)) ignored.add(i);
  }

  return {
    scopeParents: scopes.scopeParents,
    tokenScopes,
    declarations: declarations.entries,
    ignored,
  };
}

/** Opens the scope a keyword starts. An architecture sits inside its entity so it sees the ports. */
function openScope(
  tokens: readonly SourceToken[],
  i: number,
  word: string,
  scopes: ScopeTracker,
  entityScopes: Map<string, number>,
): void {
  if (word === 'architecture') {
    const entityName = tokens[i + 2]?.text.toLowerCase() === 'of' ? tokens[i + 3]?.text.toLowerCase() : undefined;
    scopes.open(entityScopes.get(entityName ?? '') ?? scopes.current);
    return;
  }
  const scope = scopes.open();
  if (word === 'entity' && isIdentifier(tokens[i + 1])) entityScopes.set(tokens[i + 1].text.toLowerCase(), scope);
}

function declareAll(declarations: DeclarationMap, indices: readonly number[], kind: SymbolKind): void {
  for (const index of indices) declarations.add(index, kind);
}

/** The `(` that starts a subprogram's parameter list: `function f (` or `function "+" (` (the string is dropped). */
function indexOfOpenBracket(tokens: readonly SourceToken[], from: number): number | undefined {
  if (tokens[from]?.text === '(') return from;
  if (tokens[from + 1]?.text === '(') return from + 1;
  return undefined;
}

/** `a, b, c :` starting at `from`; nothing unless the list really ends in `:`. */
function namesBeforeColon(tokens: readonly SourceToken[], from: number): number[] {
  const names: number[] = [];
  let j = from;
  while (isIdentifier(tokens[j])) {
    names.push(j);
    if (tokens[j + 1]?.text !== ',') break;
    j += 2;
  }
  return tokens[j + 1]?.text === ':' ? names : [];
}

/**
 * The declared names of an interface list `( a, b : in bit; signal c : out bit )`:
 * at the start of each `;`-separated item, the identifiers before the `:`.
 */
function interfaceNames(tokens: readonly SourceToken[], open: number): number[] {
  const close = matchingClose(tokens, open);
  const names: number[] = [];
  let atItemStart = true;
  for (let j = open + 1; j < close; j++) {
    const token = tokens[j];
    if (token.text === '(') j = matchingClose(tokens, j); // `std_logic_vector(7 downto 0)`
    else if (token.text === ';') atItemStart = true;
    else if (!atItemStart || token.text === ',') continue;
    else if (INTERFACE_CLASS_WORDS.has(token.text.toLowerCase())) continue;
    else if (isIdentifier(token)) names.push(j);
    else atItemStart = false; // the `:` (or anything else) ends the item's names
  }
  return names;
}

/** `type state_t is (IDLE, RUN, DONE)`: the literals. */
function enumerationLiterals(tokens: readonly SourceToken[], typeIndex: number): number[] {
  const open = typeIndex + 3;
  if (tokens[typeIndex + 2]?.text.toLowerCase() !== 'is' || tokens[open]?.text !== '(') return [];
  const close = matchingClose(tokens, open);
  const literals: number[] = [];
  for (let j = open + 1; j < close; j++) if (isIdentifier(tokens[j])) literals.push(j);
  return literals;
}

/** `record a, b : bit; c : integer; end record`: the field names, which are not references. */
function recordFieldNames(tokens: readonly SourceToken[], recordIndex: number): number[] {
  const fields: number[] = [];
  for (let j = recordIndex + 1; j < tokens.length && tokens[j].text.toLowerCase() !== 'end'; j++) {
    const startsItem = tokens[j - 1].text === ';' || j === recordIndex + 1;
    if (startsItem) fields.push(...namesBeforeColon(tokens, j));
  }
  return fields;
}

/** `port map (clk => clk_50, q => leds)`: the formals left of `=>`. */
function formalNames(tokens: readonly SourceToken[], open: number): number[] {
  const close = matchingClose(tokens, open);
  const formals: number[] = [];
  for (let j = open + 1; j < close; j++) {
    if (tokens[j].text === '(') j = matchingClose(tokens, j);
    else if (isIdentifier(tokens[j]) && tokens[j + 1]?.text === '=>') formals.push(j);
  }
  return formals;
}
```

**Verify:** `npm run typecheck` passes.

### Step 5 — Verilog analyser

**Create** `src/components/workbench/symbols/verilogSymbols.ts` with exactly this content.

Language rules only. `begin … end` (named or not) is a scope, which is what the spec's `always … begin reg valid;` example needs.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog scopes and declarations, found by walking tokens rather than by parsing.
 * Only language facts live here; resolving names is symbolIndex.ts's job.
 *
 * Scopes: module … endmodule, function … endfunction, task … endtask,
 * begin … end (named or not) and fork … join.
 *
 * Declarations: the names after input / output / inout, parameter / localparam,
 * genvar, the net and variable types (wire, reg, integer, …) and SystemVerilog's
 * `logic`. The name-list rules are the ones verilogDeclaredNames.ts uses.
 * Verilog is case-sensitive.
 */

import { VERILOG_TYPES } from '../verilogHighlight';
import { isVerilogReservedWord } from '../verilogWords';
import { DeclarationMap, isIdentifier, ScopeTracker, type Analysis } from './analysis';
import type { SourceToken } from './sourceTokens';
import type { SymbolKind } from './types';

const SCOPE_OPENERS: ReadonlySet<string> = new Set(['module', 'macromodule', 'function', 'task', 'begin', 'fork']);
const SCOPE_CLOSERS: ReadonlySet<string> = new Set([
  'endmodule', 'endfunction', 'endtask', 'end', 'join', 'join_any', 'join_none',
]);
/** `begin : blink`, `end : blink`: the word after the `:` is a label. */
const LABELLED: ReadonlySet<string> = new Set(['begin', 'fork', 'end']);

/** Declaring words other than the types in VERILOG_TYPES. */
const DECLARING_KEYWORDS: ReadonlyMap<string, SymbolKind> = new Map([
  ['input', 'port'],
  ['output', 'port'],
  ['inout', 'port'],
  ['parameter', 'parameter'],
  ['localparam', 'localparam'],
  ['logic', 'logic'], // SystemVerilog; the tokenizer calls it an identifier
]);
const VARIABLE_TYPES: ReadonlySet<string> = new Set(['integer', 'real', 'realtime', 'time']);
/** Words that may sit between a declaring word and its names: `input wire signed [7:0] x`. */
const DECLARATION_MODIFIERS: ReadonlySet<string> = new Set(['signed', 'unsigned', 'scalared', 'vectored', 'automatic']);
/** What may follow a declared name after its dimensions: `a,` `a;` `a)` `a = 0`. */
const AFTER_A_NAME: ReadonlySet<string> = new Set([',', ';', ')', '=']);
const OPENING: ReadonlySet<string> = new Set(['(', '[', '{']);
const CLOSING: ReadonlySet<string> = new Set([')', ']', '}']);

export function analyzeVerilog(tokens: readonly SourceToken[]): Analysis {
  const scopes = new ScopeTracker();
  const declarations = new DeclarationMap();
  const ignored = new Set<number>();
  const tokenScopes: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    tokenScopes[i] = scopes.current;
    const { text } = tokens[i];

    if (SCOPE_OPENERS.has(text)) scopes.open();
    else if (SCOPE_CLOSERS.has(text)) scopes.close();

    const kind = declaringKind(text);
    if (kind) for (const j of declaredNames(tokens, i)) declarations.add(j, kind);

    if (tokens[i - 1]?.text === ':' && LABELLED.has(tokens[i - 2]?.text ?? '') && isIdentifier(tokens[i])) ignored.add(i);
  }

  return {
    scopeParents: scopes.scopeParents,
    tokenScopes,
    declarations: declarations.entries,
    ignored,
  };
}

/** The kind a declaring word declares, or undefined if the word declares nothing. */
function declaringKind(text: string): SymbolKind | undefined {
  const keywordKind = DECLARING_KEYWORDS.get(text);
  if (keywordKind) return keywordKind;
  if (!VERILOG_TYPES.has(text)) return undefined;
  if (text === 'reg') return 'reg';
  if (text === 'genvar') return 'genvar';
  if (VARIABLE_TYPES.has(text)) return 'variable';
  return 'wire'; // wire, tri, wand, supply0, …
}

/** A name the student chose: an identifier that is not a reserved word (nor `logic`). */
function isName(token: SourceToken | undefined): token is SourceToken {
  return isIdentifier(token) && !isVerilogReservedWord(token.text) && !DECLARING_KEYWORDS.has(token.text);
}

/** A reserved word that ends a declaration's name list: anything but a type or a modifier. */
function endsDeclaration(text: string): boolean {
  return isVerilogReservedWord(text) && !VERILOG_TYPES.has(text) && !DECLARATION_MODIFIERS.has(text);
}

/** Skips any `[ … ]` groups starting at `j`; returns the index after them. */
function afterDimensions(tokens: readonly SourceToken[], j: number): number {
  let next = j;
  while (tokens[next]?.text === '[') {
    let depth = 0;
    for (; next < tokens.length; next++) {
      if (tokens[next].text === '[') depth++;
      else if (tokens[next].text === ']' && --depth === 0) break;
    }
    next++;
  }
  return next;
}

/** A name is declared only where a name can end, so a misspelled keyword is not taken for one. */
function isDeclaredName(tokens: readonly SourceToken[], j: number): boolean {
  const next = tokens[afterDimensions(tokens, j + 1)];
  return isName(tokens[j]) && (next === undefined || AFTER_A_NAME.has(next.text));
}

/**
 * The comma-separated names after the declaring word at `i`, up to the `;` that
 * ends the declaration, the `)` that ends a port list, or the next keyword.
 * Ranges, parentheses and initial values (`= 4'b0`) are skipped.
 */
function declaredNames(tokens: readonly SourceToken[], i: number): number[] {
  const names: number[] = [];
  let depth = 0;
  let expectingName = true;
  for (let j = i + 1; j < tokens.length; j++) {
    const { text } = tokens[j];
    if (OPENING.has(text)) depth++;
    else if (CLOSING.has(text)) {
      if (depth === 0) break;
      depth--;
    } else if (depth > 0) continue;
    else if (text === ';') break;
    else if (text === ',') expectingName = true;
    else if (text === '=') expectingName = false;
    else if (endsDeclaration(text)) break;
    else if (expectingName && isDeclaredName(tokens, j)) {
      names.push(j);
      expectingName = false;
    }
  }
  return names;
}
```

**Verify:** `npm run typecheck` passes.

### Step 6 — Symbol index (shared resolution)

**Create** `src/components/workbench/symbols/symbolIndex.ts` with exactly this content.

The only place names are resolved. VHDL names are compared in lower case, Verilog names as written. Identifiers right after a `.` are never references (`work.counter`, `r.field`, Verilog `.clk(clk)` port connections).

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Scope-aware name resolution for one file (docs/symbol_occurrence_highlighting.md).
 * A language analyser reports scopes and declarations; this module links every
 * other identifier to the declaration it means, walking from the identifier's
 * own scope outwards so an inner declaration shadows an outer one. Pure.
 */

import type { Language } from '../fileKinds';
import type { Token } from '../vhdlHighlight';
import { isIdentifier, type Analysis } from './analysis';
import { sourceTokens, type SourceToken } from './sourceTokens';
import type { HdlSymbol, SourceSpan, SymbolIndex } from './types';
import { analyzeVerilog } from './verilogSymbols';
import { analyzeVhdl } from './vhdlSymbols';

interface MutableSymbol extends HdlSymbol {
  readonly references: SourceSpan[];
}

/** One clickable name on a line: a declaration or a resolved reference. */
interface NameOnLine extends SourceSpan {
  readonly symbol: HdlSymbol;
}

/**
 * Analyses a file from the editor's tokens (`tokenizeSource`). Call it once per
 * edit (EditorSurface memoises it); hovering only calls `symbolAt`.
 */
export function buildSymbolIndex(language: Language | undefined, tokenLines: readonly (readonly Token[])[]): SymbolIndex {
  const tokens = sourceTokens(tokenLines);
  if (language === 'verilog') return indexFromAnalysis(tokens, analyzeVerilog(tokens), (name) => name);
  // Like the editor's colouring, a file of no known language is read as VHDL.
  return indexFromAnalysis(tokens, analyzeVhdl(tokens), (name) => name.toLowerCase());
}

function indexFromAnalysis(
  tokens: readonly SourceToken[],
  analysis: Analysis,
  keyOf: (name: string) => string,
): SymbolIndex {
  const tables = analysis.scopeParents.map(() => new Map<string, MutableSymbol>());
  const names: NameOnLine[] = [];

  const resolve = (key: string, scope: number): MutableSymbol | undefined => {
    for (let s = scope; s >= 0; s = analysis.scopeParents[s]) {
      const symbol = tables[s].get(key);
      if (symbol) return symbol;
    }
    return undefined;
  };

  // 1. Declarations, in file order: the first declaration of a name in a scope wins.
  const declarationIndices = [...analysis.declarations.keys()].sort((a, b) => a - b);
  for (const i of declarationIndices) {
    const token = tokens[i];
    const table = tables[analysis.tokenScopes[i]];
    const key = keyOf(token.text);
    const earlier = table.get(key);
    if (earlier) {
      // `output q; reg q;` declares q twice: the second is shown as a use of the first.
      earlier.references.push(spanOf(token));
      names.push({ ...spanOf(token), symbol: earlier });
      continue;
    }
    const symbol: MutableSymbol = {
      id: `${token.line}:${token.start}`,
      name: token.text,
      kind: analysis.declarations.get(i)!,
      declaration: spanOf(token),
      references: [],
    };
    table.set(key, symbol);
    names.push({ ...spanOf(token), symbol });
  }

  // 2. References: every other identifier that resolves.
  tokens.forEach((token, i) => {
    if (!isReferenceCandidate(tokens, analysis, i)) return;
    const symbol = resolve(keyOf(token.text), analysis.tokenScopes[i]);
    if (!symbol) return;
    symbol.references.push(spanOf(token));
    names.push({ ...spanOf(token), symbol });
  });

  return lineLookup(names);
}

/** An identifier that is not a declaration, not marked to skip, and not a selected name (`work.counter`, `.clk(`). */
function isReferenceCandidate(tokens: readonly SourceToken[], analysis: Analysis, i: number): boolean {
  return (
    isIdentifier(tokens[i]) &&
    !analysis.declarations.has(i) &&
    !analysis.ignored.has(i) &&
    tokens[i - 1]?.text !== '.'
  );
}

function spanOf(token: SourceToken): SourceSpan {
  return { line: token.line, start: token.start, end: token.end };
}

/** Groups the names by line so a hover looks at one short list. */
function lineLookup(names: readonly NameOnLine[]): SymbolIndex {
  const byLine = new Map<number, NameOnLine[]>();
  for (const name of names) {
    const list = byLine.get(name.line);
    if (list) list.push(name);
    else byLine.set(name.line, [name]);
  }
  return {
    symbolAt(line, offset) {
      return byLine.get(line)?.find((name) => name.start <= offset && offset < name.end)?.symbol;
    },
  };
}
```

**Verify:** `npm run typecheck` passes.

### Step 7 — Occurrences by line

**Create** `src/components/workbench/symbols/occurrences.ts` with exactly this content.

Turns the hovered symbol into the spans to paint, grouped by line, so each `HighlightedLine` receives only its own.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { HdlSymbol, Occurrence } from './types';

const NONE: ReadonlyMap<number, readonly Occurrence[]> = new Map();

/** What to paint for a hovered symbol, by 0-based line: its declaration and every reference. Pure. */
export function occurrencesByLine(symbol: HdlSymbol | undefined): ReadonlyMap<number, readonly Occurrence[]> {
  if (!symbol) return NONE;
  const all: Occurrence[] = [
    { ...symbol.declaration, kind: 'declaration' },
    ...symbol.references.map((span): Occurrence => ({ ...span, kind: 'reference' })),
  ];
  const byLine = new Map<number, Occurrence[]>();
  for (const occurrence of all) {
    const list = byLine.get(occurrence.line);
    if (list) list.push(occurrence);
    else byLine.set(occurrence.line, [occurrence]);
  }
  return byLine;
}
```

**Verify:** `npm run typecheck` passes.

### Step 8 — Line decoration

**Create** `src/components/workbench/symbols/decorateLine.ts` with exactly this content.

Reuses `markRanges` for the cutting, then labels each piece with its diagnostic underline and occurrence kind. With nothing hovered it returns exactly what `markRanges` returned before, so existing rendering is unchanged.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { markRanges, type CharRange, type MarkedToken, type Token } from '../vhdlHighlight';
import type { Occurrence, OccurrenceKind } from './types';

/** A piece of a highlighted line: its token colour, the diagnostic underline, and any occurrence highlight. */
export interface DecoratedPiece extends MarkedToken {
  readonly occurrence?: OccurrenceKind;
}

function covers(ranges: readonly CharRange[], offset: number): boolean {
  return ranges.some((range) => range.start <= offset && offset < range.end);
}

/**
 * Splits a line's tokens at every diagnostic and occurrence boundary (the existing
 * `markRanges` does the cutting) and labels each piece. The pieces put together
 * are the line, unchanged. Pure.
 */
export function decorateLine(
  tokens: readonly Token[],
  diagnosticRanges: readonly CharRange[],
  occurrences: readonly Occurrence[],
): DecoratedPiece[] {
  if (occurrences.length === 0) return markRanges(tokens, diagnosticRanges);
  const pieces = markRanges(tokens, [...diagnosticRanges, ...occurrences]);
  let offset = 0;
  return pieces.map((piece) => {
    const at = offset;
    offset += piece.text.length;
    const occurrence = occurrences.find((o) => o.start <= at && at < o.end)?.kind;
    return { ...piece, marked: covers(diagnosticRanges, at), occurrence };
  });
}
```

**Verify:** `npm run typecheck` passes.

### Step 9 — Pointer position

**Create** `src/components/workbench/symbols/pointerPosition.ts` with exactly this content.

Pure arithmetic from pointer coordinates to (line, offset), with tab expansion.

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Pointer position → line and character, by arithmetic. The editor's text is
 * monospace, never wraps, and every line has the same height, so no DOM lookup is
 * needed. (The highlight `<pre>` has `pointer-events: none` and sits under the
 * textarea, so `caretRangeFromPoint` would only ever find the textarea.) Pure.
 */

/** The text box's layout, read once from the textarea's computed style. */
export interface TextMetrics {
  readonly paddingTop: number;
  readonly paddingLeft: number;
  readonly lineHeight: number;
  /** Width of one character of the monospace font, in px. */
  readonly charWidth: number;
  readonly tabSize: number;
}

/** A pointer position inside the textarea's padding box, plus how far it is scrolled. */
export interface PointerInText {
  readonly x: number;
  readonly y: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

/** A character of the file: 0-based line and 0-based offset in that line. */
export interface TextCell {
  readonly line: number;
  readonly offset: number;
}

/** The character under the pointer, or undefined over padding, past a line's end, or below the last line. */
export function cellAtPointer(
  pointer: PointerInText,
  metrics: TextMetrics,
  lines: readonly string[],
): TextCell | undefined {
  const top = pointer.y + pointer.scrollTop - metrics.paddingTop;
  const left = pointer.x + pointer.scrollLeft - metrics.paddingLeft;
  if (top < 0 || left < 0 || metrics.lineHeight <= 0 || metrics.charWidth <= 0) return undefined;
  const line = Math.floor(top / metrics.lineHeight);
  if (line >= lines.length) return undefined;
  const offset = offsetAtColumn(lines[line], Math.floor(left / metrics.charWidth), metrics.tabSize);
  return offset === undefined ? undefined : { line, offset };
}

/** The character drawn at a visual column, counting a tab as reaching the next tab stop. */
export function offsetAtColumn(text: string, column: number, tabSize: number): number | undefined {
  let visual = 0;
  for (let offset = 0; offset < text.length; offset++) {
    const width = text[offset] === '\t' ? tabSize - (visual % tabSize) : 1;
    if (column < visual + width) return offset;
    visual += width;
  }
  return undefined;
}

export function sameCell(a: TextCell | undefined, b: TextCell | undefined): boolean {
  return a?.line === b?.line && a?.offset === b?.offset;
}
```

**Verify:** `npm run typecheck` passes.

### Step 10 — Hover hook

**Create** `src/components/workbench/symbols/useHoveredSymbol.ts` with exactly this content.

The only module with DOM access and timers. It stores *where* the pointer rests, never a symbol; the symbol is looked up in the current index during render, so after an edit the highlight follows the new text and cannot be stale. Touch input is ignored (there is no hover on touch).

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { cellAtPointer, sameCell, type TextCell, type TextMetrics } from './pointerPosition';
import type { HdlSymbol, SymbolIndex } from './types';

/** How long the pointer must rest before the highlight follows it (spec: 75–150 ms). */
export const HOVER_DELAY_MS = 100;

/** Spread these on the editor's `<textarea>`. */
export interface HoverHandlers {
  onPointerEnter: (event: PointerEvent<HTMLTextAreaElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLTextAreaElement>) => void;
  onPointerLeave: () => void;
}

export interface HoveredSymbol {
  /** The symbol under the resting pointer, or undefined. */
  symbol: HdlSymbol | undefined;
  handlers: HoverHandlers;
}

/** Reads the text box's layout from the textarea's computed style. */
function measureText(textarea: HTMLTextAreaElement): TextMetrics {
  const style = getComputedStyle(textarea);
  const context = document.createElement('canvas').getContext('2d');
  let charWidth = 0;
  if (context) {
    context.font = `${style.fontSize} ${style.fontFamily}`;
    charWidth = context.measureText('0'.repeat(100)).width / 100;
  }
  return {
    paddingTop: parseFloat(style.paddingTop) || 0,
    paddingLeft: parseFloat(style.paddingLeft) || 0,
    lineHeight: parseFloat(style.lineHeight) || 0,
    charWidth,
    tabSize: parseInt(style.tabSize, 10) || 4,
  };
}

/**
 * Which symbol the pointer rests on. The hover only stores *where* the pointer is;
 * the symbol is looked up in the current index, so after an edit the highlight
 * follows the new text by itself and never shows stale positions.
 *
 * @param lines The file's current lines.
 * @param index The current symbol index (rebuilt by the caller on every edit).
 */
export function useHoveredSymbol(lines: readonly string[], index: SymbolIndex): HoveredSymbol {
  const [cell, setCell] = useState<TextCell | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const metrics = useRef<TextMetrics | undefined>(undefined);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerEnter = useCallback((event: PointerEvent<HTMLTextAreaElement>) => {
    metrics.current = measureText(event.currentTarget); // re-read in case the font size changed
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLTextAreaElement>) => {
    if (event.pointerType === 'touch') return;
    const textarea = event.currentTarget;
    if (!metrics.current) metrics.current = measureText(textarea);
    const rect = textarea.getBoundingClientRect();
    const next = cellAtPointer(
      {
        x: event.clientX - rect.left - textarea.clientLeft,
        y: event.clientY - rect.top - textarea.clientTop,
        scrollLeft: textarea.scrollLeft,
        scrollTop: textarea.scrollTop,
      },
      metrics.current,
      linesRef.current,
    );
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCell((previous) => (sameCell(previous, next) ? previous : next));
    }, HOVER_DELAY_MS);
  }, []);

  const onPointerLeave = useCallback(() => {
    window.clearTimeout(timer.current);
    setCell(undefined);
  }, []);

  const symbol = useMemo(() => (cell ? index.symbolAt(cell.line, cell.offset) : undefined), [cell, index]);
  const handlers = useMemo(() => ({ onPointerEnter, onPointerMove, onPointerLeave }), [onPointerEnter, onPointerMove, onPointerLeave]);
  return { symbol, handlers };
}
```

**Verify:** `npm run typecheck` passes.

### Step 11 — Unit tests

**Create** these three files with exactly this content. They encode the spec's acceptance criteria (shadowing in both languages, ports, generics, parameters, case rules, comments, labels, multi-name declarations, port-map formals, enum literals, function parameters, record fields, performance).

`src/components/workbench/symbols/symbolIndex.test.ts`

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import type { Language } from '../fileKinds';
import { tokenizeSource } from '../highlight';
import { occurrencesByLine } from './occurrences';
import { buildSymbolIndex } from './symbolIndex';

/**
 * Hovers the `nth` (0-based) `word` on `line` (0-based) and returns what would be
 * painted, as "line:kind" in file order — e.g. ["1:declaration", "8:reference"].
 * An empty list means nothing is highlighted.
 */
function hover(language: Language, source: string, line: number, word: string, nth = 0): string[] {
  const lines = source.split('\n');
  const index = buildSymbolIndex(language, tokenizeSource(language, lines));
  let offset = -1;
  for (let k = 0; k <= nth; k++) offset = lines[line].indexOf(word, offset + 1);
  if (offset < 0) throw new Error(`"${word}" #${nth} not on line ${line}: ${lines[line]}`);
  const byLine = occurrencesByLine(index.symbolAt(line, offset));
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([l, list]) => [...list].sort((a, b) => a.start - b.start).map((o) => `${l}:${o.kind}`));
}

const vhdl = (source: string, line: number, word: string, nth = 0) => hover('vhdl', source, line, word, nth);
const verilog = (source: string, line: number, word: string, nth = 0) => hover('verilog', source, line, word, nth);

describe('VHDL', () => {
  // The spec's shadowing example, inside an architecture.
  const SHADOWING = [
    'architecture rtl of e is', //       0
    '  signal data : std_logic;', //     1
    'begin', //                          2
    '  process', //                      3
    '    variable data : std_logic;', // 4
    '  begin', //                        5
    "    data := '1';", //               6
    '  end process;', //                 7
    "  data <= '0';", //                 8
    'end architecture;', //              9
  ].join('\n');

  it('hovering the inner variable highlights only the variable', () => {
    expect(vhdl(SHADOWING, 6, 'data')).toEqual(['4:declaration', '6:reference']);
    expect(vhdl(SHADOWING, 4, 'data')).toEqual(['4:declaration', '6:reference']);
  });

  it('hovering the outer signal highlights only the signal', () => {
    expect(vhdl(SHADOWING, 8, 'data')).toEqual(['1:declaration', '8:reference']);
    expect(vhdl(SHADOWING, 1, 'data')).toEqual(['1:declaration', '8:reference']);
  });

  it('works for the bare snippet from the spec too', () => {
    const bare = [
      'signal data : std_logic;',
      'process',
      '    variable data : std_logic;',
      'begin',
      "    data := '1';",
      'end process;',
      "data <= '0';",
    ].join('\n');
    expect(vhdl(bare, 4, 'data')).toEqual(['2:declaration', '4:reference']);
    expect(vhdl(bare, 6, 'data')).toEqual(['0:declaration', '6:reference']);
  });

  const COUNTER = [
    'library ieee;', //                                                    0
    'use ieee.std_logic_1164.all;', //                                     1
    'entity counter is', //                                                2
    '  generic (N : integer := 4);', //                                    3
    '  port (clk : in std_logic;', //                                      4
    '        q   : out std_logic_vector(N-1 downto 0));', //               5
    'end entity;', //                                                      6
    'architecture rtl of counter is', //                                   7
    '  signal cnt : unsigned(N-1 downto 0); -- clk comment', //            8
    'begin', //                                                            9
    '  tick : process (CLK)', //                                           10
    '  begin', //                                                          11
    '    if rising_edge(clk) then cnt <= cnt + 1; end if;', //             12
    '  end process tick;', //                                              13
    '  q <= std_logic_vector(cnt);', //                                    14
    'end architecture rtl;', //                                            15
  ].join('\n');

  it('links entity ports to their use in the architecture, ignoring case', () => {
    expect(vhdl(COUNTER, 12, 'clk')).toEqual(['4:declaration', '10:reference', '12:reference']);
    expect(vhdl(COUNTER, 14, 'q')).toEqual(['5:declaration', '14:reference']);
  });

  it('links generics', () => {
    expect(vhdl(COUNTER, 3, 'N')).toEqual(['3:declaration', '5:reference', '8:reference']);
  });

  it('highlights signals with every use', () => {
    expect(vhdl(COUNTER, 8, 'cnt')).toEqual(['8:declaration', '12:reference', '12:reference', '14:reference']);
  });

  it('ignores comments, keywords, labels and unknown names', () => {
    expect(vhdl(COUNTER, 8, 'clk')).toEqual([]); // in the comment
    expect(vhdl(COUNTER, 12, 'then')).toEqual([]);
    expect(vhdl(COUNTER, 10, 'tick')).toEqual([]);
    expect(vhdl(COUNTER, 13, 'tick')).toEqual([]);
    expect(vhdl('architecture a of e is\nsignal x : bit;\nbegin\ny <= x;\nend;', 3, 'y')).toEqual([]);
  });

  it('keeps the ports of two entities in one file apart', () => {
    const two = [
      'entity a is port (clk : in bit); end entity;', //   0
      'architecture r of a is begin end architecture;', // 1
      'entity b is port (clk : in bit); end entity;', //   2
      'architecture r of b is', //                         3
      'begin', //                                          4
      '  x <= clk;', //                                    5
      'end architecture;', //                              6
    ].join('\n');
    expect(vhdl(two, 5, 'clk')).toEqual(['2:declaration', '5:reference']);
  });

  it('declares every name of a list', () => {
    const source = 'architecture r of e is\nsignal a, b : bit;\nbegin\nb <= a;\nend;';
    expect(vhdl(source, 3, 'a')).toEqual(['1:declaration', '3:reference']);
    expect(vhdl(source, 3, 'b')).toEqual(['1:declaration', '3:reference']);
  });

  it('does not treat a port-map formal as a use of the actual', () => {
    const tb = [
      'architecture sim of tb is', //                                         0
      '  signal clk : std_logic;', //                                         1
      'begin', //                                                             2
      '  u0 : entity work.counter port map (clk => clk, q => open);', //       3
      'end architecture;', //                                                 4
    ].join('\n');
    expect(vhdl(tb, 3, 'clk', 1)).toEqual(['1:declaration', '3:reference']);
    expect(vhdl(tb, 3, 'clk', 0)).toEqual([]);
    expect(vhdl(tb, 3, 'counter')).toEqual([]);
  });

  it('links enumeration literals and types', () => {
    const fsm = [
      'architecture r of e is', //                         0
      '  type state_t is (IDLE, RUN);', //                 1
      '  signal state : state_t := IDLE;', //              2
      'begin', //                                          3
      '  process (state) begin', //                        4
      '    case state is', //                              5
      '      when IDLE => state <= RUN;', //               6
      '      when others => null;', //                     7
      '    end case;', //                                  8
      '  end process;', //                                 9
      'end architecture;', //                              10
    ].join('\n');
    expect(vhdl(fsm, 6, 'IDLE')).toEqual(['1:declaration', '2:reference', '6:reference']);
    expect(vhdl(fsm, 2, 'state_t')).toEqual(['1:declaration', '2:reference']);
  });

  it('scopes function parameters to the function', () => {
    const source = [
      'architecture r of e is', //                                            0
      '  signal x : unsigned(3 downto 0);', //                                1
      '  function inc (x : unsigned) return unsigned is', //                  2
      '  begin', //                                                           3
      '    return x + 1;', //                                                 4
      '  end function;', //                                                   5
      'begin', //                                                             6
      '  x <= inc(x);', //                                                    7
      'end architecture;', //                                                 8
    ].join('\n');
    expect(vhdl(source, 4, 'x')).toEqual(['2:declaration', '4:reference']);
    expect(vhdl(source, 7, 'x')).toEqual(['1:declaration', '7:reference', '7:reference']);
  });

  it('closes a function declared without a body at its semicolon', () => {
    const pkg = [
      'package p is', //                                           0
      '  function f (a : bit) return bit;', //                     1
      '  constant K : integer := 3;', //                           2
      'end package;', //                                           3
      'architecture r of e is', //                                 4
      '  signal a : bit;', //                                      5
      'begin', //                                                  6
      '  a <= a;', //                                              7
      'end;', //                                                   8
    ].join('\n');
    expect(vhdl(pkg, 7, 'a')).toEqual(['5:declaration', '7:reference', '7:reference']);
    expect(vhdl(pkg, 1, 'a')).toEqual(['1:declaration']);
  });

  it('does not take record fields or selected names for references', () => {
    const source = [
      'architecture r of e is', //                                      0
      '  signal a : bit;', //                                           1
      '  type rec_t is record a : bit; end record;', //                 2
      '  signal r : rec_t;', //                                         3
      'begin', //                                                       4
      '  a <= r.a;', //                                                 5
      'end;', //                                                        6
    ].join('\n');
    expect(vhdl(source, 5, 'a')).toEqual(['1:declaration', '5:reference']);
    expect(vhdl(source, 2, 'a')).toEqual([]);
  });

  it('builds a large file fast', () => {
    const body = Array.from({ length: 1500 }, (_, k) => `  s${k % 50} <= s${(k + 1) % 50} and clk;`);
    const decls = Array.from({ length: 50 }, (_, k) => `  signal s${k} : std_logic;`);
    const source = ['entity big is port (clk : in std_logic); end;', 'architecture r of big is', ...decls, 'begin', ...body, 'end;'].join('\n');
    const lines = source.split('\n');
    const started = performance.now();
    const index = buildSymbolIndex('vhdl', tokenizeSource('vhdl', lines));
    expect(performance.now() - started).toBeLessThan(250);
    expect(index.symbolAt(0, lines[0].indexOf('clk'))?.references).toHaveLength(1500);
  });
});

describe('Verilog', () => {
  // The spec's shadowing example.
  const SHADOWING = [
    'module m;', //              0
    'wire valid;', //            1
    'always @(*) begin', //      2
    '    reg valid;', //         3
    "    valid = 1'b1;", //      4
    'end', //                    5
    "assign valid = 1'b0;", //   6
    'endmodule', //              7
  ].join('\n');

  it('hovering the inner reg does not highlight the outer wire', () => {
    expect(verilog(SHADOWING, 4, 'valid')).toEqual(['3:declaration', '4:reference']);
    expect(verilog(SHADOWING, 6, 'valid')).toEqual(['1:declaration', '6:reference']);
  });

  const COUNTER = [
    'module counter #(parameter N = 4) (', //            0
    '  input  wire clk,', //                             1
    '  output reg [N-1:0] q', //                         2
    ');', //                                             3
    '  localparam MAX = 9;', //                          4
    '  always @(posedge clk) begin : tick', //           5
    '    /* clk in a comment */', //                     6
    '    if (q == MAX) q <= 0; else q <= q + 1;', //     7
    '  end', //                                          8
    'endmodule', //                                      9
  ].join('\n');

  it('links ANSI ports, parameters and localparams', () => {
    expect(verilog(COUNTER, 5, 'clk')).toEqual(['1:declaration', '5:reference']);
    expect(verilog(COUNTER, 2, 'N')).toEqual(['0:declaration', '2:reference']);
    expect(verilog(COUNTER, 7, 'MAX')).toEqual(['4:declaration', '7:reference']);
    expect(verilog(COUNTER, 7, 'q')).toEqual(['2:declaration', '7:reference', '7:reference', '7:reference', '7:reference']);
  });

  it('ignores block comments, keywords and block labels', () => {
    expect(verilog(COUNTER, 6, 'clk')).toEqual([]);
    expect(verilog(COUNTER, 5, 'posedge')).toEqual([]);
    expect(verilog(COUNTER, 5, 'tick')).toEqual([]);
  });

  it('is case-sensitive', () => {
    const source = 'module m(input clk);\nwire Clk;\nassign Clk = clk;\nendmodule';
    expect(verilog(source, 2, 'clk')).toEqual(['0:declaration', '2:reference']);
    expect(verilog(source, 2, 'Clk')).toEqual(['1:declaration', '2:reference']);
  });

  it('links non-ANSI ports declared after the header', () => {
    const source = [
      'module m (clk, q);', //  0
      '  input clk;', //        1
      '  output q;', //         2
      '  reg q;', //            3
      'endmodule', //           4
    ].join('\n');
    expect(verilog(source, 0, 'q')).toEqual(['0:reference', '2:declaration', '3:reference']);
  });

  it('does not treat a named port connection as a use', () => {
    const tb = [
      'module tb;', //                            0
      '  reg clk;', //                            1
      '  counter u0 (.clk(clk), .q());', //       2
      'endmodule', //                             3
    ].join('\n');
    expect(verilog(tb, 2, 'clk', 1)).toEqual(['1:declaration', '2:reference']);
    expect(verilog(tb, 2, 'clk', 0)).toEqual([]);
  });

  it('declares every name of a list and accepts SystemVerilog logic', () => {
    const source = 'module m;\n  logic a, b;\n  assign a = b;\nendmodule';
    expect(verilog(source, 2, 'b')).toEqual(['1:declaration', '2:reference']);
  });
});
```

`src/components/workbench/symbols/pointerPosition.test.ts`

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { cellAtPointer, offsetAtColumn, type TextMetrics } from './pointerPosition';

const METRICS: TextMetrics = { paddingTop: 12, paddingLeft: 16, lineHeight: 20, charWidth: 8, tabSize: 4 };
const LINES = ['signal a : bit;', '\tq <= a;'];
const at = (x: number, y: number, scrollLeft = 0, scrollTop = 0) =>
  cellAtPointer({ x, y, scrollLeft, scrollTop }, METRICS, LINES);

describe('offsetAtColumn', () => {
  it('maps columns one to one without tabs', () => {
    expect(offsetAtColumn('abc', 0, 4)).toBe(0);
    expect(offsetAtColumn('abc', 2, 4)).toBe(2);
    expect(offsetAtColumn('abc', 3, 4)).toBeUndefined();
  });

  it('lets a tab cover the columns up to the next tab stop', () => {
    expect(offsetAtColumn('\tq', 0, 4)).toBe(0);
    expect(offsetAtColumn('\tq', 3, 4)).toBe(0);
    expect(offsetAtColumn('\tq', 4, 4)).toBe(1);
    expect(offsetAtColumn('ab\tq', 3, 4)).toBe(2);
    expect(offsetAtColumn('ab\tq', 4, 4)).toBe(3);
  });
});

describe('cellAtPointer', () => {
  it('finds the character under the pointer', () => {
    expect(at(16 + 7 * 8 + 1, 12 + 1)).toEqual({ line: 0, offset: 7 }); // the `a`
    expect(at(16 + 4 * 8 + 1, 12 + 20 + 1)).toEqual({ line: 1, offset: 1 }); // the `q` after a tab
  });

  it('accounts for scrolling', () => {
    expect(at(16 + 1, 12 + 1, 7 * 8, 20)).toEqual({ line: 1, offset: 4 });
  });

  it('finds nothing over padding, past a line end or below the last line', () => {
    expect(at(5, 13)).toBeUndefined();
    expect(at(17, 5)).toBeUndefined();
    expect(at(16 + 40 * 8, 13)).toBeUndefined();
    expect(at(17, 12 + 2 * 20 + 1)).toBeUndefined();
  });
});
```

`src/components/workbench/symbols/decorateLine.test.ts`

```ts
// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { markRanges, tokenizeVhdlLine } from '../vhdlHighlight';
import { decorateLine } from './decorateLine';

const LINE = 'q <= cnt + cnt;';
const TOKENS = tokenizeVhdlLine(LINE);

describe('decorateLine', () => {
  it('is markRanges when nothing is hovered', () => {
    const ranges = [{ start: 5, end: 8 }];
    expect(decorateLine(TOKENS, ranges, [])).toEqual(markRanges(TOKENS, ranges));
  });

  it('labels exactly the occurrence characters and keeps the line intact', () => {
    const pieces = decorateLine(TOKENS, [], [
      { line: 0, start: 5, end: 8, kind: 'reference' },
      { line: 0, start: 11, end: 14, kind: 'declaration' },
    ]);
    expect(pieces.map((p) => p.text).join('')).toBe(LINE);
    expect(pieces.filter((p) => p.occurrence).map((p) => [p.text, p.occurrence])).toEqual([
      ['cnt', 'reference'],
      ['cnt', 'declaration'],
    ]);
  });

  it('keeps a diagnostic underline on an occurrence', () => {
    const pieces = decorateLine(TOKENS, [{ start: 5, end: 8 }], [{ line: 0, start: 5, end: 8, kind: 'reference' }]);
    const cnt = pieces.find((p) => p.text === 'cnt');
    expect(cnt).toMatchObject({ marked: true, occurrence: 'reference' });
  });
});
```

**Verify:** `npx vitest run src/components/workbench/symbols` → 3 files, 30 tests, all passing.

If a test fails here, the bug is in Steps 1–10 (the tests are known to pass against that code). Compare your file with the block above character by character; do not change the test.

### Step 12 — Wire it into `EditorSurface.tsx`

**Edit** `src/components/workbench/EditorSurface.tsx`. Make exactly these seven replacements. Each "Find" text occurs exactly once in the file.

**12a.** Find:

```tsx
import { useId, useMemo, useRef, type RefObject, type UIEvent } from 'react';
```

Replace with:

```tsx
import { memo, useId, useMemo, useRef, type RefObject, type UIEvent } from 'react';
```

**12b.** Find:

```tsx
import { markRanges, type CharRange, type MarkedToken, type Token } from './vhdlHighlight';
```

Replace with:

```tsx
import type { CharRange, Token } from './vhdlHighlight';
import { decorateLine, type DecoratedPiece } from './symbols/decorateLine';
import { occurrencesByLine } from './symbols/occurrences';
import { buildSymbolIndex } from './symbols/symbolIndex';
import type { Occurrence, OccurrenceKind } from './symbols/types';
import { useHoveredSymbol } from './symbols/useHoveredSymbol';
```

**12c.** Find:

```tsx
const NO_RANGES: readonly CharRange[] = [];
```

Replace with:

```tsx
const NO_RANGES: readonly CharRange[] = [];
const NO_OCCURRENCES: readonly Occurrence[] = [];

const OCCURRENCE_CLASS: Record<OccurrenceKind, string> = {
  declaration: 'wb-editor__occ-decl',
  reference: 'wb-editor__occ-ref',
};
```

**12d.** Replace the whole `TokenPiece` function and the start of `HighlightedLine`. Find:

```tsx
/** One highlighted piece; an underlined one is wrapped, and the underline never changes the glyphs. */
function TokenPiece({ piece }: { piece: MarkedToken }) {
  const className = TOKEN_CLASS[piece.type];
  const text = className ? <span className={className}>{piece.text}</span> : piece.text;
  return piece.marked ? <span className="wb-editor__diag-span">{text}</span> : <>{text}</>;
}

function HighlightedLine({
  line,
  tokens,
  diagnostic,
  hintFrom,
}: {
```

Replace with:

```tsx
/**
 * One highlighted piece; an underlined one is wrapped, and so is a hovered symbol's
 * occurrence. Neither wrapper changes the glyphs' metrics.
 */
function TokenPiece({ piece }: { piece: DecoratedPiece }) {
  const className = TOKEN_CLASS[piece.type];
  const text = className ? <span className={className}>{piece.text}</span> : piece.text;
  const underlined = piece.marked ? <span className="wb-editor__diag-span">{text}</span> : text;
  return piece.occurrence ? <span className={OCCURRENCE_CLASS[piece.occurrence]}>{underlined}</span> : <>{underlined}</>;
}

const HighlightedLine = memo(function HighlightedLine({
  line,
  tokens,
  diagnostic,
  hintFrom,
  occurrences,
}: {
```

**12e.** Still in `HighlightedLine`. Find:

```tsx
  /** Rules D and E point at this line from that marked line. */
  hintFrom?: LineDiagnostic;
}) {
  const pieces = markRanges(tokens, diagnostic ? visibleSpans(diagnostic) : NO_RANGES);
```

Replace with:

```tsx
  /** Rules D and E point at this line from that marked line. */
  hintFrom?: LineDiagnostic;
  /** The hovered symbol's declaration and references on this line. */
  occurrences: readonly Occurrence[];
}) {
  const pieces = decorateLine(tokens, diagnostic ? visibleSpans(diagnostic) : NO_RANGES, occurrences);
```

**12f.** Close the `memo(` call at the end of `HighlightedLine`. Find:

```tsx
      )}
    </div>
  );
}

/** Line numbers;
```

Replace with:

```tsx
      )}
    </div>
  );
});

/** Line numbers;
```

(The comment line continues unchanged after `Line numbers;`.)

**12g.** In `EditorSurface`, three small additions.

Find:

```tsx
  const tokenLines = useMemo(() => tokenizeSource(language, file.content.split('\n')), [language, file.content]);
```

Replace with:

```tsx
  const tokenLines = useMemo(() => tokenizeSource(language, file.content.split('\n')), [language, file.content]);
  // Symbol occurrence highlighting: analysed once per edit, looked up on hover.
  const symbolIndex = useMemo(() => buildSymbolIndex(language, tokenLines), [language, tokenLines]);
  const hovered = useHoveredSymbol(lines, symbolIndex);
  const occurrences = useMemo(() => occurrencesByLine(hovered.symbol), [hovered.symbol]);
```

Find:

```tsx
              hintFrom={hints.get(i + 1)}
            />
```

Replace with:

```tsx
              hintFrom={hints.get(i + 1)}
              occurrences={occurrences.get(i) ?? NO_OCCURRENCES}
            />
```

Find:

```tsx
          onChange={(e) => onChange(file.id, e.target.value)}
```

Replace with:

```tsx
          onChange={(e) => onChange(file.id, e.target.value)}
          {...hovered.handlers}
```

Notes for this step:

- `occurrences.get(i)` uses the **0-based** line index `i`; diagnostics use `i + 1`. This is intentional: the symbol code is 0-based throughout.
- `memo` on `HighlightedLine` means that when the hover changes, only the lines that gain or lose a highlight re-render (every other line receives the same `NO_OCCURRENCES` constant). Do not replace `NO_OCCURRENCES` with an inline `[]`, or every line re-renders.
- The handlers go on the **textarea** because it is the element on top that receives pointer events.

**Verify:** `npm run typecheck` passes.

### Step 13 — Styles

**Edit** `src/components/workbench/CodeEditor.css`.

**13a.** Find:

```css
  --wb-code-pad-x: 16px;
}
```

Replace with:

```css
  --wb-code-pad-x: 16px;
  /* Symbol occurrence highlighting (docs/symbol_occurrence_highlighting.md). */
  --wb-occ-bg: #dbeafe;
  --wb-occ-decl-edge: #3b82f6;
}
```

**13b.** Find:

```css
/* The word GHDL points at.
```

Insert this block **directly before** it:

```css
/* The hovered symbol's declaration and references. Background and an inset
   box-shadow only: no border, padding or margin, so the glyphs do not move and
   the transparent textarea stays aligned with this layer. */
.wb-editor__occ-ref,
.wb-editor__occ-decl {
  background: var(--wb-occ-bg);
  border-radius: 2px;
}
.wb-editor__occ-decl {
  box-shadow: inset 0 0 0 1px var(--wb-occ-decl-edge);
}

```

**Verify (all must pass):**

```bash
npm run typecheck
npm test          # all existing tests + 30 new
npm run build
```

### Step 14 — Manual check in the browser

`npm run dev`, open the app, open a VHDL example and a Verilog example, and check:

1. Hovering a port name in the architecture/module body highlights the port declaration (outlined) and all uses (background only).
2. Paste the shadowing snippets from Section 1 into a file: inner and outer names highlight separately.
3. Hovering a keyword, a comment, a string or empty space shows nothing.
4. Moving the pointer out of the editor clears the highlight at once.
5. With the pointer resting on a name, type elsewhere in the file: the highlight stays correct.
6. Scroll horizontally and vertically, then hover: the right name is found. Hover a name after a tab character: the right name is found.
7. A line with a compiler error still shows its wavy underline and tint; a highlighted name on that line keeps both.
8. The caret and selection still line up exactly with the visible text while a highlight is shown (the glyphs must not move).

If (6) is off by a few characters on some platform, the measured character width is wrong; check `measureText` in `useHoveredSymbol.ts` reads the textarea's real font.

---

## 7. Support matrix (v1)

| Construct | VHDL | Verilog / SV |
|---|---|---|
| signal / variable / constant | ✅ | — |
| port, generic (entity and component) | ✅ | — |
| input / output / inout (ANSI and non-ANSI) | — | ✅ |
| wire, reg, integer, other net/variable types | — | ✅ |
| `logic` (SystemVerilog) | — | ✅ |
| parameter / localparam | — | ✅ |
| genvar | — | ✅ |
| function / procedure parameters | ✅ | ✅ (as ports inside the function/task scope) |
| alias | ✅ | — |
| type / subtype names | ✅ | — |
| enumeration literals | ✅ | ❌ (SV `enum` not in v1) |
| nested scopes / shadowing | ✅ process, block, generate, function, procedure, component, package | ✅ module, function, task, begin…end, fork…join |
| ports visible in the architecture | ✅ (architecture is opened inside its entity) | n/a |
| case rule | case-insensitive | case-sensitive |
| ignored (never highlighted) | comments, strings, keywords, labels, names after `end`, port-map formals, record field names, `x.y` selected names | comments, strings, keywords, block labels, `.port(…)` formals, `a.b` hierarchical names |
| record fields as symbols | ❌ | — |
| loop / for-generate parameters (`for i in …`) | ❌ | ❌ |
| SV typedef names, enum values | — | ❌ |
| cross-file references | ❌ | ❌ |

Add a construct only together with a test in `symbolIndex.test.ts`.

---

## 8. Acceptance criteria → how each is met

| Criterion (original spec) | Met by |
|---|---|
| Hovering a symbol highlights its declaration and all references | `occurrencesByLine` + `decorateLine`; tests "links entity ports…", "links ANSI ports…" |
| Resolution is semantic and scope-aware | `symbolIndex.ts` scope walk; shadowing tests in both languages |
| Nested scopes handled | ScopeTracker; tests "scopes function parameters", "keeps the ports of two entities apart" |
| Works for VHDL and Verilog/SystemVerilog | two analysers behind one `Analysis` interface; both test suites |
| Highlights disappear when hover ends | `onPointerLeave` clears immediately; non-names resolve to nothing |
| Highlights update after edits | hook stores the position; symbol is looked up in the index rebuilt by `useMemo` on edit |
| Hover does not trigger a reparse | index built in `useMemo([language, tokenLines])`; hover calls only `symbolAt` |
| Responsive in large designs | linear analysis; per-line lookup; `memo` on lines; test "builds a large file fast" (1 600 lines < 250 ms in CI, typically a few ms) |
| Declaration distinguishable from references | `.wb-editor__occ-decl` adds a blue inset outline |

---

## 9. Known limitations

- The analyser walks tokens; it is not a full parser. It is lenient: on code it does not understand it simply highlights less. It never throws on incomplete code (scopes cannot underflow; all look-ahead is bounds-checked).
- A name used before its declaration in the same scope still resolves (resolution runs after the whole file is scanned). This is deliberate: Verilog non-ANSI headers (`module m(q); output q;`) need it.
- The existing VHDL tokenizer reads `'event and clk='` as one string in `clk'event and clk='1'`, so the second `clk` there is not highlighted. Fixing the tokenizer is out of scope.
- Mouse-wheel scrolling without moving the pointer leaves the previous highlight until the pointer moves (still correct, just not under the pointer).
- VHDL subprogram overloads are not distinguished (they rarely appear in student code).

## 10. Optional follow-ups (each fits without restructuring)

- **Tooltip** (kind, name, declared at): `HdlSymbol` already carries `kind`, `name` and `declaration`; render a small absolutely-positioned box from `useHoveredSymbol`'s result.
- **Read/write tinting:** classify each reference in the analyser (left of `<=`/`:=`/`=` → write) and add a field to `SourceSpan` for references; add two CSS classes.
- **Scope tint:** record each scope's first and last line in `ScopeTracker`; tint those lines while a local symbol is hovered.
- **Loop parameters** (`for i in …`): open a scope at `for`/`loop` in VHDL and declare the name after `for`.

## 11. Rules for the implementing model

- Do **not** install Monaco, CodeMirror, tree-sitter or any other package.
- Do **not** use `document.caretRangeFromPoint`, `elementFromPoint` or DOM measurement of individual spans.
- Do **not** add `border`, `padding`, `margin`, `font-weight` or `letter-spacing` to highlight classes (they shift glyphs and break caret alignment).
- Do **not** put VHDL/Verilog words in `symbolIndex.ts`, `EditorSurface.tsx` or the hook.
- Do **not** compare `token.type === 'keyword'` to detect VHDL scope words; compare the lower-cased text.
- Keep every new pure module free of React and DOM imports so its tests run under Vitest's `node` environment.
- If a requirement seems to need a change not described here, stop and ask instead of improvising.

## 12. Sources

- HDLBoard repository: https://github.com/rlangoy/HDLBoard (files cited in Section 4)
- CodeMirror legacy modes (VHDL/Verilog token colouring only): https://www.npmjs.com/package/@codemirror/legacy-modes
- CodeMirror 6 reference: https://codemirror.net/docs/ref/
- Monaco Editor: https://microsoft.github.io/monaco-editor/
- VHDL-LS / rust_hdl: https://github.com/VHDL-LS/rust_hdl
- svlangserver: https://github.com/imc-trading/svlangserver
- web-tree-sitter: https://www.npmjs.com/package/web-tree-sitter
