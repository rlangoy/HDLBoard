// SPDX-License-Identifier: GPL-2.0-only
import { afterEach, expect, it, vi } from 'vitest';
import { loadBoardLayout, saveBoardLayout, subscribeBoardLayout } from './boardLayoutPreference';

afterEach(() => vi.unstubAllGlobals());

it('stores a layout preference independently of projects', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  expect(loadBoardLayout()).toBe('two-columns');
  saveBoardLayout('single-column');
  expect(loadBoardLayout()).toBe('single-column');
  saveBoardLayout('two-columns');
  expect(loadBoardLayout()).toBe('two-columns');
});

it('follows preference changes from another tab without writing them back', () => {
  let value: string | null = 'single-column';
  let listener: ((event: StorageEvent) => void) | undefined;
  const localStorage = { getItem: () => value, setItem: vi.fn() };
  const removeEventListener = vi.fn();
  vi.stubGlobal('window', {
    localStorage,
    addEventListener: (_: string, callback: (event: StorageEvent) => void) => { listener = callback; },
    removeEventListener,
  });
  const changed = vi.fn();
  const unsubscribe = subscribeBoardLayout(changed);
  listener!({ key: 'hdlboard.board-layout.v1', storageArea: localStorage } as unknown as StorageEvent);
  expect(changed).toHaveBeenLastCalledWith('single-column');
  listener!({ key: 'unrelated', storageArea: localStorage } as unknown as StorageEvent);
  expect(changed).toHaveBeenCalledTimes(1);
  value = null;
  listener!({ key: null, storageArea: localStorage } as unknown as StorageEvent);
  expect(changed).toHaveBeenLastCalledWith('two-columns');
  expect(localStorage.setItem).not.toHaveBeenCalled();
  unsubscribe();
  expect(removeEventListener).toHaveBeenCalledWith('storage', listener);
});

it('falls back safely when storage is unavailable or invalid', () => {
  vi.stubGlobal('window', { localStorage: { getItem: () => 'invalid', setItem: () => { throw new Error('blocked'); } } });
  expect(loadBoardLayout()).toBe('two-columns');
  expect(() => saveBoardLayout('single-column')).not.toThrow();
  vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
  expect(loadBoardLayout()).toBe('two-columns');
});
