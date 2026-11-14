// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { evaluateStatic, type StaticNames } from './staticInteger';

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
});
