// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, expect, it, vi } from 'vitest';
import { loadBouncyChoice, saveBouncyChoice } from './useBouncyOption';

afterEach(() => vi.unstubAllGlobals());

it('has no choice until the student makes one, then keeps it', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  expect(loadBouncyChoice()).toBeNull();
  saveBouncyChoice(false);
  expect(loadBouncyChoice()).toBe(false);
  saveBouncyChoice(true);
  expect(loadBouncyChoice()).toBe(true);
});

it('falls back to no choice when storage is blocked', () => {
  vi.stubGlobal('window', { localStorage: {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  } });
  expect(loadBouncyChoice()).toBeNull();
  expect(() => saveBouncyChoice(false)).not.toThrow();
});
