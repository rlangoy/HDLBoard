// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where a VHDL file's processes, loops, generates and subprograms start and end, found
 * by pattern rather than by parsing: enough for vhdlDeclarations.ts to see that a
 * variable declared in one process is not the one another process uses. Comments and
 * the insides of strings are blanked first, so `report "end;"` ends nothing. Pure.
 */

import { tokenizeVhdlLine } from './vhdlHighlight';

/** Where a block starts and ends in the file's text; a block left open reaches its end. */
export interface Region {
  readonly kind: 'process' | 'loop' | 'generate' | 'subprogram';
  /** Where its first word is: `process`, `loop`, `generate`, `function` or `procedure`. */
  readonly start: number;
  readonly end: number;
}

/** The blocks whose declarations are seen only inside them; a loop declares only its parameter. */
const DECLARATIVE_KINDS: ReadonlySet<Region['kind']> = new Set(['process', 'generate', 'subprogram']);

export function holdsDeclarations(region: Region): boolean {
  return DECLARATIVE_KINDS.has(region.kind);
}

/** Every block in the file `lines` make, joined by newlines; offsets are into that text. */
export function regionsIn(lines: readonly string[]): Region[] {
  const structure = structureOf(lines);
  return [...blockRegions(structure), ...subprogramRegions(structure)];
}

/** The file with comments and string contents blanked, every offset where it was. */
function structureOf(lines: readonly string[]): string {
  const blanked = ({ text, type }: { text: string; type: string }) => {
    if (type === 'comment') return ' '.repeat(text.length);
    if (type === 'string') return blankedInside(text);
    return text;
  };
  return lines.map((line) => tokenizeVhdlLine(line).map(blanked).join('')).join('\n');
}

/** `"end;"` → `"    "`: the quotes stay, so the string still reads as one. */
function blankedInside(quoted: string): string {
  const QUOTES = 2;
  if (quoted.length < QUOTES) return quoted;
  return `${quoted[0]}${' '.repeat(quoted.length - QUOTES)}${quoted[quoted.length - 1]}`;
}

// ------------------------------------------------------------ process, loop, generate

/** Statements that end with their own kind: `end process`, `end loop`, `end generate`. */
const BLOCK_KEYWORD = /\b(?<end>end\s+)?(?<kind>process|loop|generate)\b/gi;

/** Each process, loop and generate, matched with the `end` of its kind; loops and generates nest. */
function blockRegions(code: string): Region[] {
  const regions: Region[] = [];
  const open = new Map<Region['kind'], number[]>();
  for (const match of code.matchAll(BLOCK_KEYWORD)) {
    const kind = (match.groups?.kind ?? '').toLowerCase() as Region['kind'];
    const stack = open.get(kind) ?? [];
    open.set(kind, stack);
    if (match.groups?.end === undefined) stack.push(match.index);
    else {
      const start = stack.pop();
      if (start !== undefined) regions.push({ kind, start, end: match.index + match[0].length });
    }
  }
  for (const [kind, stack] of open) for (const start of stack) regions.push({ kind, start, end: code.length });
  return regions;
}

// ------------------------------------------------------------ function, procedure

/** A subprogram's first word, not the one an `end function` repeats. */
const SUBPROGRAM = /(?<!\bend\s+)\b(?:function|procedure)\s+\w+/gi;
/** An `end` that may close a subprogram body: `end;`, `end function;`, `end f;`… */
const SUBPROGRAM_END = /\bend\b(?<keyword>\s+(?:function|procedure))?(?:\s+(?<name>\w+))?\s*;/gi;
/** What an `end` closes when it names a statement or a type instead: `end if;`, `end record;`. */
const STATEMENT_ENDS: ReadonlySet<string> = new Set(['if', 'case', 'loop', 'record', 'units', 'protected', 'block']);
const IS = 'is';

/** Where a subprogram body opens (after its `is`) or closes (after its `end …;`). */
type Boundary = { readonly at: number; readonly opens: true; readonly start: number } | { readonly at: number; readonly opens: false; readonly end: number };

/**
 * Each function and procedure: a declaration alone to its `;`, a body to its own
 * `end`, past the `end if`s and `end loop`s in it and the bodies nested in it.
 */
function subprogramRegions(code: string): Region[] {
  const { declarations, bodyOpenings } = subprogramHeaders(code);
  return [...declarations, ...pairedBodies([...bodyOpenings, ...subprogramClosings(code)], code.length)];
}

/** Each subprogram's header: a declaration that ends with it, or the opening of a body. */
function subprogramHeaders(code: string): { readonly declarations: Region[]; readonly bodyOpenings: Boundary[] } {
  const declarations: Region[] = [];
  const bodyOpenings: Boundary[] = [];
  for (const match of code.matchAll(SUBPROGRAM)) {
    const header = afterHeader(code, match.index + match[0].length);
    if (header.body) bodyOpenings.push({ at: header.at, opens: true, start: match.index });
    else declarations.push({ kind: 'subprogram', start: match.index, end: header.at });
  }
  return { declarations, bodyOpenings };
}

function subprogramClosings(code: string): Boundary[] {
  const closings: Boundary[] = [];
  for (const match of code.matchAll(SUBPROGRAM_END)) {
    const named = match.groups?.name?.toLowerCase();
    const closesStatement = match.groups?.keyword === undefined && named !== undefined && STATEMENT_ENDS.has(named);
    if (closesStatement) continue;
    closings.push({ at: match.index, opens: false, end: match.index + match[0].length });
  }
  return closings;
}

/** Each closing ends the innermost body still open; a body never closed reaches `fileEnd`. */
function pairedBodies(boundaries: readonly Boundary[], fileEnd: number): Region[] {
  const regions: Region[] = [];
  const open: number[] = [];
  for (const boundary of [...boundaries].sort((a, b) => a.at - b.at)) {
    if (boundary.opens) open.push(boundary.start);
    else {
      const start = open.pop();
      if (start !== undefined) regions.push({ kind: 'subprogram', start, end: boundary.end });
    }
  }
  for (const start of open) regions.push({ kind: 'subprogram', start, end: fileEnd });
  return regions;
}

/**
 * After `is`, what makes no body: VHDL-2008's instantiation `function f is new work.p.g
 * generic map (…);` and a generic formal's default, `is <>` or a subprogram's name
 * (`function op (…) return t is increment;`). A body's `is` is followed by declarations or
 * `begin`, never by one name and then `;` or `)`.
 */
const NO_BODY_AFTER_IS = /\s*(?:<>|new\b|[A-Za-z_][\w.]*\s*[;)])/iy;

/**
 * Past a subprogram's name and parameters: `is` starts its body, `;` ends a declaration
 * that has none, and so does the `)` that closes the generic list a formal stands in.
 */
function afterHeader(code: string, from: number): { readonly body: boolean; readonly at: number } {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    const char = code[i];
    if (char === '(') depth++;
    else if (char === ')' && --depth < 0) return { body: false, at: i };
    else if (depth === 0 && char === ';') return { body: false, at: i + 1 };
    else if (depth === 0 && isWordAt(code, i, IS) && !followedBy(NO_BODY_AFTER_IS, code, i + IS.length)) return { body: true, at: i + IS.length };
  }
  return { body: false, at: code.length };
}

/** Whether the sticky `pattern` matches `code` at `at`. */
function followedBy(pattern: RegExp, code: string, at: number): boolean {
  pattern.lastIndex = at;
  return pattern.test(code);
}

/** `word` stands alone at `at`: not the end of `this` nor the start of `island`. */
function isWordAt(code: string, at: number, word: string): boolean {
  const before = code[at - 1] ?? ' ';
  const after = code[at + word.length] ?? ' ';
  return code.slice(at, at + word.length).toLowerCase() === word && !/\w/.test(before) && !/\w/.test(after);
}
