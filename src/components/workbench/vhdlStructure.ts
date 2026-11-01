// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How VHDL code is nested, read from its words, for the advice on GHDL messages
 * a beginner cannot act on: which architecture, process or subprogram a line is
 * in, where that region's `begin` is, and whether a line ends a design unit.
 * Reads only words, `;` and parentheses, and gives up rather than guess. Pure.
 */

import { tokenizeVhdlLine } from './vhdlHighlight';
import { isReservedWord } from './vhdlWords';

/** The words GHDL reports as `unexpected token '…'` that start a declaration. */
export const DECLARATION_WORDS: ReadonlySet<string> = new Set([
  'signal', 'constant', 'variable', 'shared', 'type', 'subtype', 'alias', 'file', 'attribute',
  'function', 'procedure', 'impure', 'pure',
]);

/** The statement region a declaration was written in. */
export type StatementRegion = 'process' | 'subprogram';

/** Where a misplaced declaration belongs: the region, and the `begin` to move it above (when certain). */
export interface DeclarationHome {
  readonly region: StatementRegion;
  readonly beginLine?: number;
}

interface Word {
  /** Lower case; punctuation other than `;`, `(` and `)` is left out. */
  readonly text: string;
  readonly line: number;
}

const KEPT_PUNCTUATION: ReadonlySet<string> = new Set([';', '(', ')']);

/** The words, `;` and parentheses of lines `from`..`to` (1-based, inclusive); comments and strings left out. */
function wordsOf(lines: readonly string[], from: number, to: number): Word[] {
  const words: Word[] = [];
  for (let line = from; line <= to; line++) {
    for (const { text, type } of tokenizeVhdlLine(lines[line - 1] ?? '')) {
      if (type === 'comment' || type === 'whitespace' || type === 'string') continue;
      if (type !== 'punctuation') words.push({ text: text.toLowerCase(), line });
      else for (const char of text) if (KEPT_PUNCTUATION.has(char)) words.push({ text: char, line });
    }
  }
  return words;
}

// ------------------------------------------------------------ subprograms

const SUBPROGRAM_WORDS: ReadonlySet<string> = new Set(['function', 'procedure']);

/**
 * Index of the `is` that starts the body of the subprogram named at `words[at]`,
 * or undefined for a declaration without a body (`function f return t;`). A `;`
 * inside the parameter list does not end the header.
 */
function subprogramBodyStart(words: readonly Word[], at: number): number | undefined {
  let parentheses = 0;
  for (let i = at + 1; i < words.length; i++) {
    const { text } = words[i];
    if (text === '(') parentheses++;
    else if (text === ')') parentheses--;
    else if (parentheses === 0 && text === 'is') return i;
    else if (parentheses === 0 && text === ';') return undefined;
  }
  return undefined;
}

function isAfterEnd(words: readonly Word[], at: number): boolean {
  return words[at - 1]?.text === 'end';
}

function startsSubprogramBody(words: readonly Word[], at: number): boolean {
  return SUBPROGRAM_WORDS.has(words[at].text) && !isAfterEnd(words, at) && subprogramBodyStart(words, at) !== undefined;
}

// ------------------------------------------------------------ regions

/** `end` followed by one of these closes something that has no `begin`. */
const ENDS_WITHOUT_BEGIN: ReadonlySet<string> = new Set([
  'if', 'case', 'loop', 'record', 'units', 'component', 'protected', 'generate', 'for',
]);

/** `end;` or `end name;`: closes whatever is open, without naming its kind. */
function isUnnamedKindEnd(words: readonly Word[], at: number): boolean {
  if (words[at].text !== 'end') return false;
  const next = words[at + 1]?.text;
  return next === ';' || (next !== undefined && !isReservedWord(next) && words[at + 2]?.text === ';');
}

/**
 * The line of the first `begin` in `words`, the start of one region's
 * declarations, skipping the bodies of the subprograms declared there: they
 * have a `begin` of their own.
 */
function firstBegin(words: readonly Word[]): number | undefined {
  let bodies = 0;
  for (let i = 0; i < words.length; i++) {
    const { text } = words[i];
    if (startsSubprogramBody(words, i)) bodies++;
    else if (text === 'end' && bodies > 0 && !ENDS_WITHOUT_BEGIN.has(words[i + 1]?.text ?? '')) bodies--;
    else if (text === 'begin' && bodies === 0) return words[i].line;
  }
  return undefined;
}

/** An opener still open at the start of a line: the words up to there, and its index in them. */
interface OpenRegion {
  readonly words: readonly Word[];
  readonly at: number;
}

/**
 * Every region a bare `end;` can close, and the process, which cannot: all are
 * counted, whichever kind is looked for, so that `end;` closes the right one.
 */
const REGION_WORDS: ReadonlySet<string> = new Set(['process', 'function', 'procedure', 'architecture', 'entity', 'package']);

/** `words[at]` opens a region: `entity e is`, not the `entity` of `u: entity work.e`; a subprogram only with a body. */
function opensRegion(words: readonly Word[], at: number): boolean {
  const { text } = words[at];
  if (isAfterEnd(words, at)) return false;
  if (text === 'entity') return words[at + 2]?.text === 'is';
  if (SUBPROGRAM_WORDS.has(text)) return subprogramBodyStart(words, at) !== undefined;
  return true;
}

/**
 * The innermost of `wanted` still open at the start of `line`. Walking back,
 * each `end process`, `end function`, `end;` … closes the next region found.
 */
function enclosingOpener(lines: readonly string[], line: number, wanted: ReadonlySet<string>): OpenRegion | undefined {
  const words = wordsOf(lines, 1, line - 1);
  let closed = 0;
  for (let i = words.length - 1; i >= 0; i--) {
    if (isUnnamedKindEnd(words, i)) closed++;
    if (!REGION_WORDS.has(words[i].text)) continue;
    if (isAfterEnd(words, i)) closed++;
    else if (!opensRegion(words, i)) continue;
    else if (closed > 0) closed--;
    else if (wanted.has(words[i].text)) return { words, at: i };
  }
  return undefined;
}

const ARCHITECTURE: ReadonlySet<string> = new Set(['architecture']);
const ARCHITECTURE_NAME = /\barchitecture\s+(?<name>\w+)/i;

/** The header of the architecture that is still open at the start of `line`, and its name as written. */
export function architectureAbove(lines: readonly string[], line: number): { readonly line: number; readonly name: string } | undefined {
  const open = enclosingOpener(lines, line, ARCHITECTURE);
  if (open === undefined) return undefined;
  const headerLine = open.words[open.at].line;
  const name = ARCHITECTURE_NAME.exec(lines[headerLine - 1])?.groups?.name;
  return name === undefined ? undefined : { line: headerLine, name };
}

/** Between the architecture's `begin` and the error, these open a region with a `begin` of its own. */
const NESTED_CONCURRENT: ReadonlySet<string> = new Set(['generate', 'block']);

/** The `begin` of the architecture around `line`, when nothing in between opens a region of its own. */
export function architectureBegin(lines: readonly string[], line: number): number | undefined {
  const open = enclosingOpener(lines, line, ARCHITECTURE);
  if (open === undefined) return undefined;
  const body = open.words.slice(open.at + 1);
  const begin = firstBegin(body);
  if (begin === undefined) return undefined;
  const nestedRegionAfterBegin = body.some((w) => w.line > begin && NESTED_CONCURRENT.has(w.text));
  return nestedRegionAfterBegin ? undefined : begin;
}

const STATEMENT_OPENERS: ReadonlySet<string> = new Set(['process', 'function', 'procedure', 'architecture']);

/**
 * Where a declaration that GHDL found among sequential statements belongs: the
 * process or subprogram it was written in, and that region's `begin`.
 */
export function statementRegionHome(lines: readonly string[], line: number): DeclarationHome | undefined {
  const open = enclosingOpener(lines, line, STATEMENT_OPENERS);
  if (open === undefined) return undefined;
  const { words, at } = open;
  if (words[at].text === 'architecture') return undefined;
  const region: StatementRegion = words[at].text === 'process' ? 'process' : 'subprogram';
  // A subprogram's declarations start after its own `is`, a process's right away.
  const declarationsStart = region === 'process' ? at + 1 : (subprogramBodyStart(words, at) ?? at) + 1;
  const beginLine = firstBegin(words.slice(declarationsStart));
  return { region, ...(beginLine !== undefined && { beginLine }) };
}

// ------------------------------------------------------------ design units

/** `end;`, `end rtl;`, `end architecture;`, `end package body p;` — the shape of a design unit's end. */
const DESIGN_UNIT_END = /^end(?:\s+(?<kind>architecture|entity|package\s+body|package|configuration))?(?:\s+(?<name>\w+))?\s*;$/;
/** Words that make `end x;` the end of a statement, not of a design unit. */
const ENDS_A_STATEMENT: ReadonlySet<string> = new Set([...ENDS_WITHOUT_BEGIN, 'process', 'block', 'function', 'procedure']);

/**
 * When the line is only the end of a design unit: what it closes, as the line
 * says (`architecture`), or no kind for `end;` and `end rtl;`.
 */
export function designUnitEnd(line: string): { readonly kind?: string } | undefined {
  const code = line.replace(/--.*$/, '').trim().toLowerCase();
  const groups = DESIGN_UNIT_END.exec(code)?.groups;
  if (groups === undefined) return undefined;
  const endsAStatement = groups.kind === undefined && groups.name !== undefined && ENDS_A_STATEMENT.has(groups.name);
  return endsAStatement ? undefined : { kind: groups.kind?.replace(/\s+/, ' ') };
}
