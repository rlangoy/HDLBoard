// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * A small VHDL tokenizer for the code editor's syntax colouring.
 *
 * Line-based on purpose: VHDL has no multi-line strings, and before
 * VHDL-2008 no block comments, so a whole file can be highlighted one
 * line at a time with no state carried across lines. VHDL-2008's
 * `/* … *\/` comments are therefore not coloured as comments. Verilog files use
 * verilogHighlight.ts instead (see highlight.ts), which does track them.
 * ------------------------------------------------------------------ */

export type TokenType =
  | 'keyword'
  | 'type'
  | 'comment'
  | 'string'
  | 'number'
  | 'directive'
  | 'system'
  | 'identifier'
  | 'punctuation'
  | 'whitespace';

export interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set([
  'library', 'use', 'entity', 'is', 'port', 'map', 'generic', 'in', 'out',
  'inout', 'end', 'architecture', 'begin', 'process', 'if', 'then', 'elsif',
  'else', 'case', 'when', 'others', 'downto', 'to', 'signal', 'variable',
  'constant', 'all', 'of', 'for', 'loop', 'wait', 'after', 'not', 'and',
  'or', 'xor', 'nand', 'nor', 'function', 'return', 'component', 'rising_edge',
  'falling_edge', 'open',
]);

const TYPES = new Set([
  'std_logic', 'std_logic_vector', 'integer', 'boolean', 'natural',
  'positive', 'unsigned', 'signed', 'bit', 'bit_vector', 'time', 'real',
]);

// One alternation, longest-first within each group, so e.g. a number is
// matched whole rather than digit by digit. A character literal is exactly one
// character ('1'), so the attribute tick in `clk'event and clk = '1'` is not
// taken for the start of a literal that runs to the next quote.
const TOKEN_RE =
  /(--[^\n]*)|("(?:[^"]|"")*"|'[^\n]')|(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\sA-Za-z0-9_]+)/g;

export function tokenizeVhdlLine(line: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(line))) {
    const [, comment, str, num, word, whitespace, punctuation] = match;
    if (comment) {
      tokens.push({ text: comment, type: 'comment' });
    } else if (str) {
      tokens.push({ text: str, type: 'string' });
    } else if (num) {
      tokens.push({ text: num, type: 'number' });
    } else if (word) {
      const lower = word.toLowerCase();
      tokens.push({
        text: word,
        type: KEYWORDS.has(lower) ? 'keyword' : TYPES.has(lower) ? 'type' : 'identifier',
      });
    } else if (whitespace) {
      tokens.push({ text: whitespace, type: 'whitespace' });
    } else if (punctuation) {
      tokens.push({ text: punctuation, type: 'punctuation' });
    }
  }
  return tokens;
}

/** A range of characters in one line: 0-based offsets, end exclusive. */
export interface CharRange {
  readonly start: number;
  readonly end: number;
}

/** A piece of a token, and whether it lies inside one of the ranges. */
export interface MarkedToken extends Token {
  readonly marked: boolean;
}

export function isInside(offset: number, ranges: readonly CharRange[]): boolean {
  return ranges.some((range) => range.start <= offset && offset < range.end);
}

/** Where marking starts or stops strictly inside the token that spans `from`..`to`. */
function cutsWithin(from: number, to: number, ranges: readonly CharRange[]): number[] {
  const cuts = ranges.flatMap((range) => [range.start, range.end]).filter((cut) => cut > from && cut < to);
  return [...new Set(cuts)].sort((a, b) => a - b);
}

/**
 * Splits a line's tokens where the ranges start and end, so an underline can wrap
 * exactly the marked characters while every piece keeps its token's colour. The
 * pieces put together are the line, unchanged.
 */
export function markRanges(tokens: readonly Token[], ranges: readonly CharRange[]): MarkedToken[] {
  const pieces: MarkedToken[] = [];
  let offset = 0;
  for (const token of tokens) {
    const end = offset + token.text.length;
    const cuts = [offset, ...cutsWithin(offset, end, ranges), end];
    for (let k = 0; k < cuts.length - 1; k++) {
      const text = token.text.slice(cuts[k] - offset, cuts[k + 1] - offset);
      pieces.push({ text, type: token.type, marked: isInside(cuts[k], ranges) });
    }
    offset = end;
  }
  return pieces;
}
