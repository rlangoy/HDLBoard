// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { WaveRunNumbers } from './waveRunNumbers';

/** Numbers that have seen run 1 of one session, then run 1 of the next. */
function afterTwoSessions(): { numbers: WaveRunNumbers; first: number; second: number } {
  const numbers = new WaveRunNumbers();
  const first = numbers.offered(1);
  numbers.newSession();
  const second = numbers.offered(1);
  return { numbers, first, second };
}

describe('WaveRunNumbers', () => {
  test('the same server run in two sessions gets two page numbers', () => {
    const { first, second } = afterTwoSessions();
    expect(second).not.toBe(first);
  });

  test('a page run of this session goes back to its server run', () => {
    const { numbers, second } = afterTwoSessions();
    expect(numbers.serverRun(second)).toBe(1);
  });

  test('a page run of an earlier session has no server run', () => {
    const { numbers, first } = afterTwoSessions();
    expect(numbers.serverRun(first)).toBeUndefined();
  });

  test('a server run of this session has its page number', () => {
    const { numbers, second } = afterTwoSessions();
    expect(numbers.pageRun(1)).toBe(second);
  });

  test('a server run never offered has no page number', () => {
    expect(new WaveRunNumbers().pageRun(2)).toBeUndefined();
  });
});
