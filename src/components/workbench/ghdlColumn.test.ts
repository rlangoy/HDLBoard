// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { ghdlColumnToIndex } from './ghdlColumn';

const TAIL = 'signal counter : integer rttange 0 to 9 := 0;';
/** Where `rttange` ends in TAIL: GHDL's column points just after it. */
const AFTER_TYPO = TAIL.indexOf('rttange') + 'rttange'.length;

/** The measured columns of Appendix A.13 (GHDL 4.1.0, 5.0.1 and 6.0.0 agree). */
describe('ghdlColumnToIndex', () => {
  test.each([
    { name: '4 spaces', line: `    ${TAIL}`, column: 37, index: 4 + AFTER_TYPO },
    { name: '1 tab', line: `\t${TAIL}`, column: 41, index: 1 + AFTER_TYPO },
    { name: '2 tabs', line: `\t\t${TAIL}`, column: 49, index: 2 + AFTER_TYPO },
    { name: '2 spaces and a tab', line: `  \t${TAIL}`, column: 41, index: 3 + AFTER_TYPO },
    { name: 'an ASCII string earlier on the line', line: `    constant S : string := "o"; ${TAIL}`, column: 65, index: 32 + AFTER_TYPO },
    { name: 'a 2-byte character earlier on the line', line: `    constant S : string := "ø"; ${TAIL}`, column: 66, index: 32 + AFTER_TYPO },
  ])('$name', ({ line, column, index }) => {
    expect(ghdlColumnToIndex(line, column)).toBe(index);
  });

  test('a column past the end of the line gives the line length', () => {
    expect(ghdlColumnToIndex('abc', 9)).toBe(3);
  });

  test('a column inside a 3-byte character rounds to that character', () => {
    expect(ghdlColumnToIndex('a—b', 3)).toBe(1);
  });

  test('the column after a 3-byte character is the next character', () => {
    expect(ghdlColumnToIndex('a—b', 5)).toBe(2);
  });

  test('a column inside a tab rounds to the tab', () => {
    expect(ghdlColumnToIndex('\tx', 4)).toBe(0);
  });
});
