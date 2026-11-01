// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, expect, it, vi } from 'vitest';
import { bouncyEnabled, loadBouncyChoice, saveBouncyChoice, subscribeBouncyChoice } from './useBouncyOption';

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

it('is off until the start-up default is known, and the student\'s choice wins over it', () => {
  expect(bouncyEnabled(null, null)).toBe(false);
  expect(bouncyEnabled(null, true)).toBe(true);
  expect(bouncyEnabled(null, false)).toBe(false);
  expect(bouncyEnabled(true, false)).toBe(true);
  expect(bouncyEnabled(false, true)).toBe(false);
  expect(bouncyEnabled(true, null)).toBe(true);
});

it('follows a choice made in another tab, and stops when unsubscribed', () => {
  let stored: string | null = 'off';
  let listener: ((event: StorageEvent) => void) | undefined;
  const removeEventListener = vi.fn();
  vi.stubGlobal('window', {
    localStorage: { getItem: () => stored, setItem: vi.fn() },
    addEventListener: (_: string, callback: (event: StorageEvent) => void) => { listener = callback; },
    removeEventListener,
  });
  const changed = vi.fn();
  const unsubscribe = subscribeBouncyChoice(changed);
  listener?.({ key: 'some.other.key' } as StorageEvent);
  expect(changed).not.toHaveBeenCalled();
  stored = 'on';
  listener?.({ key: 'hdlboard.pushbuttons.bouncy' } as StorageEvent);
  expect(changed).toHaveBeenLastCalledWith(true);
  stored = null;
  listener?.({ key: null } as StorageEvent);
  expect(changed).toHaveBeenLastCalledWith(null);
  unsubscribe();
  expect(removeEventListener).toHaveBeenCalledWith('storage', listener);
});
