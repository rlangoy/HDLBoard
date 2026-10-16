// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { formatSimTime } from './simTime';

describe('formatSimTime', () => {
  test.each([
    [0, '0 ns'],
    [850, '850 ns'],
    [83495, '83.495 µs'],
    [1204000, '1.204 ms'],
    [3000179270, '3.000 s'],
  ])('%d ns -> %s', (ns, text) => {
    expect(formatSimTime(ns)).toBe(text);
  });
});
