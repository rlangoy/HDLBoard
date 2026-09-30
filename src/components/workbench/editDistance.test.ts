// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { osaDistance } from './editDistance';

describe('osaDistance', () => {
  test.each([
    { name: 'two neighbouring letters swapped', a: 'rnage', b: 'range', distance: 1 },
    { name: 'a swap in the middle', a: 'dwonto', b: 'downto', distance: 1 },
    { name: 'one letter left out', a: 'signl', b: 'signal', distance: 1 },
    { name: 'one letter added', a: 'entitiy', b: 'entity', distance: 1 },
    { name: 'one letter replaced', a: 'than', b: 'then', distance: 1 },
    { name: 'two letters added', a: 'rttange', b: 'range', distance: 2 },
    { name: 'equal words', a: 'range', b: 'range', distance: 0 },
    { name: 'case is ignored', a: 'RaNgE', b: 'range', distance: 0 },
  ])('$name: $a → $b', ({ a, b, distance }) => {
    expect(osaDistance(a, b, 2)).toBe(distance);
  });

  test('a distance above max is reported as max + 1', () => {
    expect(osaDistance('counter', 'range', 1)).toBe(2);
  });

  test('a length difference above max exits before any work', () => {
    expect(osaDistance('a', 'architecture', 2)).toBe(3);
  });

  test('a swap is one edit, not two', () => {
    expect(osaDistance('ab', 'ba', 1)).toBe(1);
  });
});
