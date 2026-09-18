// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * A small VHDL tokenizer for the code editor's syntax colouring.
 *
 * Line-based on purpose: VHDL has no block comments and no multi-line
 * strings, so a whole file can be highlighted one line at a time with
 * no state carried across lines.
 * ------------------------------------------------------------------ */

export type TokenType =
  | 'keyword'
  | 'type'
  | 'comment'
  | 'string'
  | 'number'
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
// matched whole rather than digit by digit.
const TOKEN_RE =
  /(--[^\n]*)|("(?:[^"]|"")*"|'(?:[^']|'')*')|(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\sA-Za-z0-9_]+)/g;

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
