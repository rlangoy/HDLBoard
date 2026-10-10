// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { tokenizeSource } from '../highlight';
import { caretOfSelection, cellAtCaret, symbolAtCaret } from './caretPosition';
import { buildSymbolIndex } from './symbolIndex';

const SOURCE = [
  'architecture sim of tb is', //                 0
  '  signal a : std_logic;', //                   1
  'begin', //                                     2
  "  report std_logic'image(a) severity note;", // 3
  'end;', //                                      4
].join('\n');
const INDEX = buildSymbolIndex('vhdl', tokenizeSource('vhdl', SOURCE.split('\n')));
const caretAt = (line: number, offset: number) =>
  SOURCE.split('\n').slice(0, line).reduce((sum, text) => sum + text.length + 1, 0) + offset;

describe('cellAtCaret', () => {
  it('turns a character index into a line and offset', () => {
    expect(cellAtCaret('ab\ncd', 0)).toEqual({ line: 0, offset: 0 });
    expect(cellAtCaret('ab\ncd', 3)).toEqual({ line: 1, offset: 0 });
    expect(cellAtCaret('ab\ncd', 5)).toEqual({ line: 1, offset: 2 });
  });
});

describe('caretOfSelection', () => {
  const LINE = "signal a : std_logic := '0';";
  const a = LINE.indexOf(' a ') + 1;

  it('a cursor without a selection stays where it is', () => {
    expect(caretOfSelection(LINE, a, a)).toBe(a);
  });

  it('a double-click on Windows selects the word and its trailing space; the word counts', () => {
    expect(caretOfSelection(LINE, a, a + 2)).toBe(a); // "a "
    expect(caretOfSelection(LINE, a - 1, a + 1)).toBe(a); // " a"
  });

  it('a selection across names, or of blanks only, points nowhere', () => {
    expect(caretOfSelection(LINE, a, a + 4)).toBeUndefined(); // "a : "
    expect(caretOfSelection(LINE, a - 1, a)).toBeUndefined(); // " "
  });
});

describe('symbolAtCaret', () => {
  const aInImage = SOURCE.split('\n')[3].indexOf('(a)') + 1;

  it("finds the name the cursor is in, here inside std_logic'image(a)", () => {
    expect(symbolAtCaret(INDEX, SOURCE, caretAt(3, aInImage))?.name).toBe('a');
  });

  it('finds the name the cursor sits just after', () => {
    expect(symbolAtCaret(INDEX, SOURCE, caretAt(3, aInImage + 1))?.name).toBe('a');
  });

  it('finds nothing away from a name', () => {
    expect(symbolAtCaret(INDEX, SOURCE, caretAt(2, 0))).toBeUndefined();
  });
});
