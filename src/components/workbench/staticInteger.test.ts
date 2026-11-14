// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { constantDifference, evaluateStatic, type ChangingNames, type StaticNames } from './staticInteger';

const NAMES: StaticNames = {
  constant: (name) => ({ n: 8, width: 4 })[name],
  attribute: (name, attribute) => (name === 'v' && attribute === 'length' ? 16 : undefined),
};

const value = (text: string) => evaluateStatic(text, NAMES);

describe('evaluateStatic', () => {
  test.each<[string, number]>([
    ['7', 7],
    ['1_000', 1000],
    ['N - 1', 7],
    ['WIDTH*2 - 1', 7],
    ['2**N', 256],
    ['(N + 2) / 3', 3],
    ['-N + 1', -7],
    ['v\'length - 1', 15],
    ['10 mod 3', 1],
  ])('%s is %d', (text, expected) => {
    expect(value(text)).toBe(expected);
  });

  test.each(['x', 'f(3)', 'N +', '1.5', '(N', '8 / 0', '16#FF#'])('%s has no static value', (text) => {
    expect(value(text)).toBeUndefined();
  });

  test('a product with zero is zero', () => {
    expect(value('N * 0')).toBe(0);
  });
});

describe('constantDifference', () => {
  const CHANGING: ChangingNames = { ...NAMES, changes: (name) => ['i', 'j'].includes(name) };
  const difference = (left: string, right: string) => constantDifference(left, right, CHANGING);

  test.each<[string, string, number]>([
    ['i', 'i - 3', 3],
    ['i + N', 'i', 8],
    ['2 * i + 1', 'i + i', 1],
    ['(i + 3) * 2', '2 * i', 6],
    ['i - j + 4', '-j + i', 4],
    ['N - 1', '0', 7],
  ])('%s minus %s is always %d', (left, right, expected) => {
    expect(difference(left, right)).toBe(expected);
  });

  test.each<[string, string]>([
    ['i', 'j'],
    ['2 * i', 'i'],
    ['i / 1024 + 3', '0'],
    ['i * i', '0'],
    ['i mod 4', '0'],
    ['i', 'x'],
  ])('%s minus %s is not proved constant', (left, right) => {
    expect(difference(left, right)).toBeUndefined();
  });
});
