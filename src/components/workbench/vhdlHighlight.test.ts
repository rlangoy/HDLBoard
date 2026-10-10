// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { markRanges, tokenizeVhdlLine } from './vhdlHighlight';

const LINE = '    signal counter : integer rttange 0 to 9 := 0;';
const TYPO = { start: LINE.indexOf('rttange'), end: LINE.indexOf('rttange') + 'rttange'.length };

describe('tokenizeVhdlLine', () => {
  test("an attribute tick is not a character literal: clk'event and clk = '1'", () => {
    const tokens = tokenizeVhdlLine("if clk'event and clk = '1' then");
    expect(tokens.filter((t) => t.type === 'identifier').map((t) => t.text)).toEqual(['clk', 'event', 'clk']);
    expect(tokens.filter((t) => t.type === 'string').map((t) => t.text)).toEqual(["'1'"]);
  });
});

describe('markRanges', () => {
  test('marks exactly the characters of the range', () => {
    const marked = markRanges(tokenizeVhdlLine(LINE), [TYPO]).filter((piece) => piece.marked);
    expect(marked.map((piece) => piece.text)).toEqual(['rttange']);
  });

  test('the pieces put together are the line', () => {
    expect(markRanges(tokenizeVhdlLine(LINE), [TYPO]).map((piece) => piece.text).join('')).toBe(LINE);
  });

  test('a range inside a token splits it, and each piece keeps its colour', () => {
    const pieces = markRanges(tokenizeVhdlLine('counter'), [{ start: 2, end: 4 }]);
    expect(pieces).toEqual([
      { text: 'co', type: 'identifier', marked: false },
      { text: 'un', type: 'identifier', marked: true },
      { text: 'ter', type: 'identifier', marked: false },
    ]);
  });

  test('no ranges: the tokens, unmarked', () => {
    expect(markRanges(tokenizeVhdlLine('a <= b;'), []).some((piece) => piece.marked)).toBe(false);
  });
});
