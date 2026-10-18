// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { CURSOR_UNITS, cursorUnitFor, formatCursorFs, formatCursorIn, parseTimeIn, type TimeUnit } from './timeAxis';

const NS: TimeUnit = ['ns', 1e6];
const US: TimeUnit = ['µs', 1e9];
/** A resolution of 0.1 ns: one decimal in nanoseconds. */
const TENTH_NS_FS = 1e5;

describe('cursor time units', () => {
  it('offers s, ms, µs, ns and ps', () => {
    expect(CURSOR_UNITS.map(([symbol]) => symbol)).toEqual(['s', 'ms', 'µs', 'ns', 'ps']);
  });

  it.each([
    [0, 'ns'],
    [24.7e6, 'ns'],
    [3e9, 'µs'],
    [500, 'ps'],
  ])('reads %d fs in %s, never below picoseconds', (fs, unit) => {
    expect(cursorUnitFor(fs)[0]).toBe(unit);
  });
});

describe('cursor time as text', () => {
  it('writes the decimals the resolution allows', () => {
    expect(formatCursorIn(24.7e6, NS, TENTH_NS_FS)).toBe('24.7');
  });

  it('writes the same time in a larger unit', () => {
    expect(formatCursorIn(24.7e6, US, TENTH_NS_FS)).toBe('0.0247');
  });

  it('adds the unit when writing a readout', () => {
    expect(formatCursorFs(24.7e6, TENTH_NS_FS)).toBe('24.7 ns');
  });
});

describe('a typed cursor time', () => {
  it.each([
    ['25', NS, 25e6],
    [' 2,5 ', US, 2.5e9],
  ] as const)('reads %j as a number in the chosen unit', (text, unit, fs) => {
    expect(parseTimeIn(text, unit)).toBe(fs);
  });

  it.each([
    ['3 us', NS, 3e9],
    ['1500ps', US, 1.5e6],
  ] as const)('reads %j in its own unit, whatever unit is chosen', (text, unit, fs) => {
    expect(parseTimeIn(text, unit)).toBe(fs);
  });

  it.each(['', 'abc', '-5', '-5 ns'])('refuses %j', (text) => {
    expect(parseTimeIn(text, NS)).toBeUndefined();
  });
});
