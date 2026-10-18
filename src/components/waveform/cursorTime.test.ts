// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { CURSOR_UNITS, cursorUnitFor, formatCursorFs, formatCursorIn, parseTimeIn, type TimeUnit } from './timeAxis';

const NS: TimeUnit = ['ns', 1e6];
const US: TimeUnit = ['µs', 1e9];

describe('cursor time field', () => {
  it('offers s, ms, µs, ns and ps', () => {
    expect(CURSOR_UNITS.map(([symbol]) => symbol)).toEqual(['s', 'ms', 'µs', 'ns', 'ps']);
  });

  it('follows the time with its unit, never below picoseconds', () => {
    expect(cursorUnitFor(0)[0]).toBe('ns');
    expect(cursorUnitFor(24.7e6)[0]).toBe('ns');
    expect(cursorUnitFor(3e9)[0]).toBe('µs');
    expect(cursorUnitFor(500)[0]).toBe('ps');
  });

  it('writes the time in the chosen unit, with the decimals the resolution allows', () => {
    expect(formatCursorIn(24.7e6, NS, 1e5)).toBe('24.7');
    expect(formatCursorIn(24.7e6, US, 1e5)).toBe('0.0247');
    expect(formatCursorFs(24.7e6, 1e5)).toBe('24.7 ns');
  });

  it('reads a bare number in the chosen unit, with a decimal point or comma', () => {
    expect(parseTimeIn('25', NS)).toBe(25e6);
    expect(parseTimeIn(' 2,5 ', US)).toBe(2.5e9);
  });

  it('reads a number with its own unit, whatever unit is chosen', () => {
    expect(parseTimeIn('3 us', NS)).toBe(3e9);
    expect(parseTimeIn('1500ps', US)).toBe(1.5e6);
  });

  it('refuses what is not a time of zero or more', () => {
    expect(parseTimeIn('', NS)).toBeUndefined();
    expect(parseTimeIn('abc', NS)).toBeUndefined();
    expect(parseTimeIn('-5', NS)).toBeUndefined();
    expect(parseTimeIn('-5 ns', NS)).toBeUndefined();
  });
});
