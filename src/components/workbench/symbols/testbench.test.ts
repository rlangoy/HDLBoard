// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { tokenizeSource } from '../highlight';
import { caretOfSelection, symbolAtCaret } from './caretPosition';
import { occurrencesByLine } from './occurrences';
import { buildSymbolIndex } from './symbolIndex';
import TESTBENCH from '../../../../tests/fixtures/symbols/and_gate_truthtable_tb.vhd?raw';

// A student's testbench: signals used in port maps, `'image(…)`, reports and asserts.
const LINES = TESTBENCH.replace(/\r/g, '').split('\n');
const INDEX = buildSymbolIndex('vhdl', tokenizeSource('vhdl', LINES));

/** Hovers the `nth` (0-based) whole-word `name` on 1-based `line`; returns the 1-based lines painted. */
function linesLitBy(line: number, name: string, nth = 0): number[] {
  const matches = [...LINES[line - 1].matchAll(new RegExp(`\\b${name}\\b`, 'g'))];
  const occurrences = occurrencesByLine(INDEX.symbolAt(line - 1, matches[nth].index!));
  return [...occurrences.entries()].flatMap(([l, list]) => list.map(() => l + 1)).sort((a, b) => a - b);
}

describe('and_gate_truthtable_tb.vhd', () => {
  it("links a signal to its uses inside std_logic'image(…)", () => {
    const uses = [11, 20, 42, 49, 53, 62];
    expect(linesLitBy(11, 'a')).toEqual(uses);
    expect(linesLitBy(53, 'a')).toEqual(uses);
    expect(linesLitBy(62, 'a')).toEqual(uses);
  });

  it('links the other signals and the process variables', () => {
    expect(linesLitBy(12, 'b')).toEqual([12, 21, 43, 49, 54, 63]);
    expect(linesLitBy(13, 'y')).toEqual([13, 22, 55, 59, 66]);
    expect(linesLitBy(28, 'expected')).toEqual([28, 49, 59, 64]);
    expect(linesLitBy(27, 'pattern')).toEqual([27, 40, 42, 43]);
  });

  it('does not take a port-map formal or the attribute name for a use', () => {
    expect(linesLitBy(20, 'a', 0)).toEqual([]);
    expect(linesLitBy(53, 'image')).toEqual([]);
  });

  it('a double-click on the declaration (Windows selects "a ") lights the port map use on line 20', () => {
    const text = LINES.join('\n');
    const start = LINES.slice(0, 10).join('\n').length + 1 + LINES[10].indexOf(' a ') + 1;
    const caret = caretOfSelection(text, start, start + 2)!;
    const occurrences = occurrencesByLine(symbolAtCaret(INDEX, text, caret));
    expect([...occurrences.keys()].map((l) => l + 1).sort((a, b) => a - b)).toEqual([11, 20, 42, 49, 53, 62]);
  });
});
