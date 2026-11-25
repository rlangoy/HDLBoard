// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, describe, expect, it, vi } from 'vitest';
import { followOtherTabs, storedSwitch } from './useStoredSetting';

const KEY = 'hdlboard.test.switch';
const SWITCH = storedSwitch({ key: KEY, startupDefaultOf: () => undefined, inEffect: (choice) => choice ?? false });

afterEach(() => vi.unstubAllGlobals());

function stubStorage(values: Map<string, string>): void {
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
}

function stubBlockedStorage(): void {
  const blocked = () => { throw new Error('blocked'); };
  vi.stubGlobal('window', { localStorage: { getItem: blocked, setItem: blocked } });
}

describe('a stored switch', () => {
  it('has no choice until the student makes one', () => {
    stubStorage(new Map());
    expect(SWITCH.load()).toBeNull();
  });

  it('keeps the choice made', () => {
    stubStorage(new Map());
    SWITCH.save(false);
    expect(SWITCH.load()).toBe(false);
  });

  it('is stored as on or off', () => {
    const values = new Map<string, string>();
    stubStorage(values);
    SWITCH.save(true);
    expect(values.get(KEY)).toBe('on');
  });

  it('has no choice when storage is blocked', () => {
    stubBlockedStorage();
    expect(SWITCH.load()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    stubBlockedStorage();
    expect(() => SWITCH.save(false)).not.toThrow();
  });
});

describe('following other tabs', () => {
  let stored: string | null;
  let listener: ((event: StorageEvent) => void) | undefined;
  const removeEventListener = vi.fn();
  const changed = vi.fn();

  function follow(): () => void {
    stored = 'off';
    changed.mockClear();
    vi.stubGlobal('window', {
      localStorage: { getItem: () => stored, setItem: vi.fn() },
      addEventListener: (_: string, callback: (event: StorageEvent) => void) => { listener = callback; },
      removeEventListener,
    });
    return followOtherTabs(SWITCH, changed);
  }

  it("ignores another setting's change", () => {
    follow();
    listener?.({ key: 'some.other.key' } as StorageEvent);
    expect(changed).not.toHaveBeenCalled();
  });

  it("hands on this setting's new choice", () => {
    follow();
    stored = 'on';
    listener?.({ key: KEY } as StorageEvent);
    expect(changed).toHaveBeenLastCalledWith(true);
  });

  it('hands on no choice when the other tab cleared the storage', () => {
    follow();
    stored = null;
    listener?.({ key: null } as StorageEvent);
    expect(changed).toHaveBeenLastCalledWith(null);
  });

  it('stops when unsubscribed', () => {
    follow()();
    expect(removeEventListener).toHaveBeenCalledWith('storage', listener);
  });
});
