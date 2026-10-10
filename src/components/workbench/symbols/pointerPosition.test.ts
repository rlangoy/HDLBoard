// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { cellAtPointer, offsetAtColumn, type TextMetrics } from './pointerPosition';

const METRICS: TextMetrics = { paddingTop: 12, paddingLeft: 16, lineHeight: 20, charWidth: 8, tabSize: 4 };
const LINES = ['signal a : bit;', '\tq <= a;'];
const at = (x: number, y: number, scrollLeft = 0, scrollTop = 0) =>
  cellAtPointer({ x, y, scrollLeft, scrollTop }, METRICS, LINES);

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
