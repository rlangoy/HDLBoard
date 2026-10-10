// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The names a Verilog file declares, found by pattern rather than by parsing
 * (docs/editor_diagnostics_verilog_research.md § 6, step 1). Rule B uses them to
 * leave a student's own names alone; Rules C and G offer them as suggestions.
 * Comments (also `/* … *\/` across lines) and strings are skipped. Pure.
 *
 * Like the VHDL version (declaredNames.ts), the patterns may find a little more
 * than Verilog would. That is the safe direction: an extra name can only keep
 * Rule B quiet, and every name found here is one the student wrote.
 */

import { tokenizeVerilog, VERILOG_TYPES } from './verilogHighlight';
import type { Token } from './vhdlHighlight';
import { isVerilogReservedWord } from './verilogWords';

/**
 * The names after each of these are declared: `input wire [9:0] SW, KEY`,
 * `reg [3:0] a = 0, b;`, `localparam N = 4;`, `module blinkTest (`. The net and
 * variable types (`wire`, `reg`, `integer`, …) declare too: VERILOG_TYPES.
 */
const DECLARING_KEYWORDS: ReadonlySet<string> = new Set([
  'input', 'output', 'inout', 'parameter', 'localparam', 'specparam', 'event',
  'module', 'macromodule', 'primitive', 'function', 'task',
]);

/** Words that may sit between a declaring keyword and its names: `input wire signed [7:0] x`. */
const DECLARATION_MODIFIERS: ReadonlySet<string> = new Set(['signed', 'unsigned', 'scalared', 'vectored', 'automatic']);

/** Words after which a `:` introduces a block label: `begin : blink`. */
const LABELLED_BLOCKS: ReadonlySet<string> = new Set(['begin', 'fork']);

const OPENING = new Set(['(', '[', '{']);
const CLOSING = new Set([')', ']', '}']);

/** The least a token needs for the name-list rules; symbols/verilogSymbols.ts shares them. */
export type WordToken = Pick<Token, 'text' | 'type'>;

interface Significant extends WordToken {
  /** 0-based line of the file. */
  readonly line: number;
}

/** Every name the file declares, as written, once each. */
export function verilogDeclaredNames(source: string): string[] {
  const tokens = significantTokens(source);
  const names = [
    ...tokens.flatMap((_, i) => declaredAfterKeyword(tokens, i)),
    ...tokens.flatMap((_, i) => instanceName(tokens, i)),
    ...tokens.flatMap((_, i) => blockLabel(tokens, i)),
    ...namesOnDirectiveLines(tokens),
  ];
  return [...new Set(names)];
}

/** The tokens of the whole file, without whitespace and comments, each with its line. */
function significantTokens(source: string): Significant[] {
  return tokenizeVerilog(source.split('\n')).flatMap((line, index) =>
    line.filter((token) => token.type !== 'whitespace' && token.type !== 'comment').map((token) => ({ ...token, line: index })),
  );
}

/** A name the student chose: an identifier that is not a reserved word. */
function isName<T extends WordToken>(token: T | undefined): token is T {
  return token?.type === 'identifier' && !isVerilogReservedWord(token.text);
}

function isDeclaringWord(text: string): boolean {
  return DECLARING_KEYWORDS.has(text) || VERILOG_TYPES.has(text);
}

/** A reserved word that ends a declaration's name list: anything but a type or a modifier. */
function endsDeclaration(text: string): boolean {
  return isVerilogReservedWord(text) && !VERILOG_TYPES.has(text) && !DECLARATION_MODIFIERS.has(text);
}

/** What may follow a declared name, after its array dimensions: `a,` `a;` `a)` `a = 0` `m (` `m #(`. */
const AFTER_A_NAME: ReadonlySet<string> = new Set([',', ';', ')', '=', '(', '#']);

/** Skips any `[ … ]` groups starting at `j`; returns the index after them. */
function afterDimensions(tokens: readonly WordToken[], j: number): number {
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

/**
 * A name is declared only where a name can end. This keeps a misspelled keyword
 * out: in `input wire CLOCK, inptu wire [9:0] SW` the typo sits where a second
 * name of the list could, but a name is never followed by another word.
 */
function isDeclaredName(tokens: readonly WordToken[], j: number): boolean {
  const next = tokens[afterDimensions(tokens, j + 1)];
  return isName(tokens[j]) && (next === undefined || AFTER_A_NAME.has(next.text));
}

function declaredAfterKeyword(tokens: readonly Significant[], i: number): string[] {
  if (!isDeclaringWord(tokens[i].text)) return [];
  return declaredNameIndices(tokens, i).map((j) => tokens[j].text);
}

/**
 * The comma-separated names after the declaring word at `i`, as token indices, up
 * to the `;` that ends the declaration, the `)` that ends a port list, or the next
 * keyword. Ranges, parentheses and initial values (`= 4'b0`) are skipped.
 */
export function declaredNameIndices(tokens: readonly WordToken[], i: number): number[] {
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

/** Skips a balanced `( … )` starting at `open`; returns the index after it. */
function afterParentheses(tokens: readonly Significant[], open: number): number {
  let depth = 0;
  for (let j = open; j < tokens.length; j++) {
    if (tokens[j].text === '(') depth++;
    else if (tokens[j].text === ')' && --depth === 0) return j + 1;
  }
  return tokens.length;
}

/** `counter u0 (` and `counter #(8) u0 (`: the instance name `u0`. */
function instanceName(tokens: readonly Significant[], i: number): string[] {
  if (!isName(tokens[i]) || !startsStatement(tokens, i)) return [];
  let next = i + 1;
  if (tokens[next]?.text === '#' && tokens[next + 1]?.text === '(') next = afterParentheses(tokens, next + 1);
  return isName(tokens[next]) && tokens[next + 1]?.text === '(' ? [tokens[next].text] : [];
}

/** The start of a statement: the first token, or the one after a `;`. */
function startsStatement(tokens: readonly Significant[], i: number): boolean {
  return i === 0 || tokens[i - 1].text === ';';
}

/** `begin : blink`. */
function blockLabel(tokens: readonly Significant[], i: number): string[] {
  const labelled = LABELLED_BLOCKS.has(tokens[i].text) && tokens[i + 1]?.text === ':';
  return labelled && isName(tokens[i + 2]) ? [tokens[i + 2].text] : [];
}

/** `` `define WIDTH 4 ``, `` `ifdef SIM ``: every name on a line that starts with a compiler directive. */
function namesOnDirectiveLines(tokens: readonly Significant[]): string[] {
  const directiveLines = new Set(
    tokens.filter((token, i) => token.type === 'directive' && tokens[i - 1]?.line !== token.line).map((token) => token.line),
  );
  return tokens.filter((token) => directiveLines.has(token.line) && isName(token)).map((token) => token.text);
}
