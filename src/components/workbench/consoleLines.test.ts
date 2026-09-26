// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { appendCapped, MAX_CONSOLE_LINES } from './consoleLines';

describe('appendCapped', () => {
  test('C-1: 5 000 appended lines leave the newest 2 000, in order', () => {
    let lines: number[] = [];
    for (let index = 0; index < 5000; index += 1) lines = appendCapped(lines, index);
    expect(lines).toHaveLength(MAX_CONSOLE_LINES);
    expect(lines[0]).toBe(5000 - MAX_CONSOLE_LINES);
    expect(lines[lines.length - 1]).toBe(4999);
  });

  test('C-2: fewer lines than the cap are left unchanged', () => {
    expect(appendCapped(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  test('does not modify the list it was given', () => {
    const before = ['a'];
    appendCapped(before, 'b');
    expect(before).toEqual(['a']);
  });
});
