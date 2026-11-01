// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The source reading behind two GHDL messages a beginner cannot act on: a
 * declaration written after `begin` (`unexpected token 'signal' in a concurrent
 * statement list`, `declaration not allowed within statements`), and an extra
 * `end architecture;` (`missing entity, architecture, package or configuration`).
 * Reads only words and `;`, line by line, and gives up rather than guess. Pure.
 */

import { tokenizeVhdlLine } from './vhdlHighlight';

/** The words GHDL reports as `unexpected token '…'` that start a declaration. */
export const DECLARATION_WORDS: ReadonlySet<string> = new Set([
  'signal', 'constant', 'variable', 'shared', 'type', 'subtype', 'alias', 'file', 'attribute',
  'function', 'procedure', 'impure', 'pure',
]);

/** Which part of the code a declaration was written in. */
export type Region = 'architecture' | 'process' | 'subprogram';

/** Where a misplaced declaration belongs: the region, and the `begin` to move it above (when certain). */
export interface DeclarationHome {
  readonly region: Region;
  readonly beginLine?: number;
}

interface Word {
  readonly text: string;
  readonly line: number;
}

/** The words and `;` of lines `from`..`to` (1-based, inclusive), lower case, comments and strings left out. */
function wordsOf(lines: readonly string[], from: number, to: number): Word[] {
  const words: Word[] = [];
  for (let line = from; line <= to; line++) {
    for (const { text, type } of tokenizeVhdlLine(lines[line - 1] ?? '')) {
      if (type === 'comment' || type === 'whitespace' || type === 'string') continue;
      if (type === 'punctuation') {
        for (const char of text) if (char === ';') words.push({ text: ';', line });
      } else {
        words.push({ text: text.toLowerCase(), line });
      }
    }
  }
  return words;
}

/** `end` followed by one of these closes something that has no `begin`. */
const ENDS_WITHOUT_BEGIN: ReadonlySet<string> = new Set([
  'if', 'case', 'loop', 'record', 'units', 'component', 'protected', 'generate', 'for',
]);

/**
 * The first `begin` of the region whose words start at `words[0]`, skipping the
 * bodies of functions and procedures declared in it — they have a `begin` of
 * their own. A function declared without a body (`… return t;`) has none.
 */
function firstBegin(words: readonly Word[]): number | undefined {
  let depth = 0;
  let subprogramHeader = false;
  for (let i = 0; i < words.length; i++) {
    const { text } = words[i];
    const previous = words[i - 1]?.text;
    if ((text === 'function' || text === 'procedure') && previous !== 'end') subprogramHeader = true;
    else if (subprogramHeader && text === ';') subprogramHeader = false;
    else if (subprogramHeader && text === 'is') {
      subprogramHeader = false;
      depth++;
    } else if (text === 'end' && depth > 0 && !ENDS_WITHOUT_BEGIN.has(words[i + 1]?.text ?? '')) depth--;
    else if (text === 'begin' && depth === 0) return words[i].line;
  }
  return undefined;
}

/** The nearest line at or above `line` whose words include `opener` not right after `end`. */
function openerAbove(lines: readonly string[], line: number, openers: ReadonlySet<string>): Word | undefined {
  for (let above = line; above >= 1; above--) {
    const words = wordsOf(lines, above, above);
    const opener = [...words].reverse().find((w, i, rev) => openers.has(w.text) && rev[i + 1]?.text !== 'end');
    if (opener) return opener;
  }
  return undefined;
}

const ARCHITECTURE: ReadonlySet<string> = new Set(['architecture']);

const ARCHITECTURE_HEADER = /^\s*architecture\s+(?<name>\w+)\s+of\b/i;

/** The header of the architecture that is open above `line` (not counting `line` itself), and its name. */
export function architectureAbove(lines: readonly string[], line: number): { readonly line: number; readonly name: string } | undefined {
  for (let above = line - 1; above >= 1; above--) {
    const name = ARCHITECTURE_HEADER.exec(lines[above - 1] ?? '')?.groups?.name;
    if (name !== undefined) return { line: above, name };
  }
  return undefined;
}
const STATEMENT_OPENERS: ReadonlySet<string> = new Set(['process', 'function', 'procedure', 'architecture']);
/** Between the architecture's `begin` and the error, these open a region with a `begin` of its own. */
const NESTED_CONCURRENT: ReadonlySet<string> = new Set(['generate', 'block']);

/** The `begin` of the architecture around `line`, when nothing in between opens a region of its own. */
export function architectureBegin(lines: readonly string[], line: number): number | undefined {
  const header = openerAbove(lines, line, ARCHITECTURE);
  if (header === undefined) return undefined;
  const words = wordsOf(lines, header.line, line - 1);
  const begin = firstBegin(words.slice(words.findIndex((w) => w.text === 'architecture') + 1));
  if (begin === undefined) return undefined;
  const between = words.filter((w) => w.line > begin);
  return between.some((w) => NESTED_CONCURRENT.has(w.text)) ? undefined : begin;
}

/**
 * Where a declaration that GHDL found among sequential statements belongs: the
 * process or subprogram it was written in, and that region's `begin`.
 */
export function statementRegionHome(lines: readonly string[], line: number): DeclarationHome | undefined {
  const opener = openerAbove(lines, line, STATEMENT_OPENERS);
  if (opener === undefined || opener.text === 'architecture') return undefined;
  const words = wordsOf(lines, opener.line, line - 1);
  const start = words.map((w) => w.text).lastIndexOf(opener.text) + 1;
  const region: Region = opener.text === 'process' ? 'process' : 'subprogram';
  // A subprogram's own `is` comes before its declarations: start after it.
  const afterIs = region === 'subprogram' ? words.findIndex((w, i) => i >= start && w.text === 'is') + 1 : start;
  const beginLine = afterIs > 0 ? firstBegin(words.slice(afterIs)) : undefined;
  return { region, ...(beginLine !== undefined && { beginLine }) };
}

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
  if (groups.kind === undefined && groups.name !== undefined && ENDS_A_STATEMENT.has(groups.name)) return undefined;
  return { kind: groups.kind?.replace(/\s+/, ' ') };
}
