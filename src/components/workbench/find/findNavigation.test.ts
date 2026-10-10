// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { findMatches } from './findMatches';
import { anchorAfterReplace, firstAtOrAfter, stepIndex } from './findNavigation';

const m = (start: number, end = start + 1) => ({ start, end });

describe('firstAtOrAfter', () => {
  const matches = [m(2), m(5), m(9)];

  it('picks the first match at or after the offset (D10)', () => {
    expect(firstAtOrAfter(matches, 0)).toBe(0);
    expect(firstAtOrAfter(matches, 5)).toBe(1);
    expect(firstAtOrAfter(matches, 6)).toBe(2);
  });

  it('wraps to the first match past the last one', () => {
    expect(firstAtOrAfter(matches, 10)).toBe(0);
  });

  it('is -1 with no matches', () => {
    expect(firstAtOrAfter([], 3)).toBe(-1);
  });

  it('keeps the current match close after an edit in the code (D14)', () => {
    // Current match at 5. Text inserted before it shifts it to 8: the next at or after 5 is the old one.
    expect(firstAtOrAfter([m(2), m(8), m(12)], 5)).toBe(1);
    // The current match was deleted: the next one becomes current.
    expect(firstAtOrAfter([m(2), m(9)], 5)).toBe(1);
  });
});

describe('stepIndex', () => {
  it('wraps both ways', () => {
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(1, 3, 1)).toBe(2);
  });

  it('is -1 with no matches', () => {
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });
});

describe('anchorAfterReplace', () => {
  it('skips a replacement that contains the query (D8)', () => {
    const before = 'ledr ledr';
    const replaced = findMatches(before, 'ledr').matches[0];
    const after = 'LEDR_x ledr';
    const next = firstAtOrAfter(findMatches(after, 'ledr').matches, anchorAfterReplace(replaced, 'LEDR_x'.length));
    expect(findMatches(after, 'ledr').matches[next].start).toBe(7);
  });
});
