// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { caretAtPointer, cellAtPointer, offsetAtColumn, type DrawnRow, type TextMetrics } from './pointerPosition';

const METRICS: TextMetrics = { paddingTop: 12, paddingLeft: 16, paddingRight: 16, lineHeight: 20, charWidth: 8, tabSize: 4 };
const LINES = ['signal a : bit;', '\tq <= a;'];
const at = (x: number, y: number, scrollLeft = 0, scrollTop = 0) =>
  cellAtPointer({ x, y, scrollLeft, scrollTop }, METRICS, { lines: LINES });

describe('offsetAtColumn', () => {
  it('maps columns one to one without tabs', () => {
    expect(offsetAtColumn('abc', 0, 4)).toBe(0);
    expect(offsetAtColumn('abc', 2, 4)).toBe(2);
    expect(offsetAtColumn('abc', 3, 4)).toBeUndefined();
  });

  it('lets a tab cover the columns up to the next tab stop', () => {
    expect(offsetAtColumn('\tq', 0, 4)).toBe(0);
    expect(offsetAtColumn('\tq', 3, 4)).toBe(0);
    expect(offsetAtColumn('\tq', 4, 4)).toBe(1);
    expect(offsetAtColumn('ab\tq', 3, 4)).toBe(2);
    expect(offsetAtColumn('ab\tq', 4, 4)).toBe(3);
  });
});

describe('cellAtPointer', () => {
  it('finds the character under the pointer', () => {
    expect(at(16 + 7 * 8 + 1, 12 + 1)).toEqual({ line: 0, offset: 7 }); // the `a`
    expect(at(16 + 4 * 8 + 1, 12 + 20 + 1)).toEqual({ line: 1, offset: 1 }); // the `q` after a tab
  });

  it('accounts for scrolling', () => {
    expect(at(16 + 1, 12 + 1, 7 * 8, 20)).toEqual({ line: 1, offset: 4 });
  });

  it('finds nothing over padding, past a line end or below the last line', () => {
    expect(at(5, 13)).toBeUndefined();
    expect(at(17, 5)).toBeUndefined();
    expect(at(16 + 40 * 8, 13)).toBeUndefined();
    expect(at(17, 12 + 2 * 20 + 1)).toBeUndefined();
  });
});

/** Line 0, then two extra rows under it (a message and a Quick Fix), then line 1. */
const WITH_EXTRA_ROWS: readonly DrawnRow[] = [
  { line: 0, extra: false },
  { line: 0, extra: true },
  { line: 0, extra: true },
  { line: 1, extra: false },
];
const ROWS = { lines: LINES, rows: WITH_EXTRA_ROWS };
const rowY = (row: number) => 12 + row * 20 + 1;

describe('cellAtPointer with extra rows', () => {
  it('finds nothing on an extra row', () => {
    expect(cellAtPointer({ x: 17, y: rowY(1), scrollLeft: 0, scrollTop: 0 }, METRICS, ROWS)).toBeUndefined();
  });

  it('finds the line below the extra rows where it is drawn, not where the textarea has it', () => {
    expect(cellAtPointer({ x: 16 + 4 * 8 + 1, y: rowY(3), scrollLeft: 0, scrollTop: 0 }, METRICS, ROWS)).toEqual({
      line: 1,
      offset: 1,
    });
  });
});

describe('caretAtPointer', () => {
  const caretAt = (x: number, row: number) => caretAtPointer({ x, y: rowY(row), scrollLeft: 0, scrollTop: 0 }, METRICS, ROWS);

  it('puts the caret on the character clicked, below extra rows too', () => {
    expect(caretAt(16 + 4 * 8 + 1, 3)).toEqual({ line: 1, offset: 1, extraRowsAbove: 2 });
  });

  it('puts the caret at the end of a line clicked past, or on its left padding at its start', () => {
    expect(caretAt(16 + 40 * 8, 0)).toEqual({ line: 0, offset: LINES[0].length, extraRowsAbove: 0 });
    expect(caretAt(5, 0)).toEqual({ line: 0, offset: 0, extraRowsAbove: 0 });
  });

  it('puts the caret at the end of the line above for a click on an extra row', () => {
    expect(caretAt(17, 2)).toEqual({ line: 0, offset: LINES[0].length, extraRowsAbove: 0 });
  });

  it('finds nothing below the last row', () => {
    expect(caretAt(17, 4)).toBeUndefined();
  });
});
