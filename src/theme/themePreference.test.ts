// SPDX-License-Identifier: GPL-2.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadThemePreference, parseThemePreference, resolveTheme, saveThemePreference, THEME_STORAGE_KEY,
} from './themePreference';

afterEach(() => vi.unstubAllGlobals());

function stubStorage(values = new Map<string, string>()) {
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  return values;
}

describe('parseThemePreference', () => {
  it.each([null, '', 'black', 'DARK', ' dark'])('reads %j as Light', (value) => {
    expect(parseThemePreference(value)).toBe('light');
  });

  it.each(['light', 'dark', 'system'])('keeps %s', (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });
});

describe('resolveTheme', () => {
  it('follows the OS in System mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the OS for an explicit choice', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('stored preference', () => {
  it('round-trips through localStorage under its own key', () => {
    const values = stubStorage();
    expect(loadThemePreference()).toBe('light');
    expect(saveThemePreference('dark')).toBe(true);
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(loadThemePreference()).toBe('dark');
    saveThemePreference('system');
    expect(loadThemePreference()).toBe('system');
  });

  it('is Light when the stored value is invalid', () => {
    stubStorage(new Map([[THEME_STORAGE_KEY, 'neon']]));
    expect(loadThemePreference()).toBe('light');
  });

  it('is Light when reading storage throws', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); } } });
    expect(loadThemePreference()).toBe('light');
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(loadThemePreference()).toBe('light');
  });

  it('reports a failed save instead of throwing', () => {
    vi.stubGlobal('window', { localStorage: { setItem: () => { throw new Error('quota'); } } });
    expect(saveThemePreference('dark')).toBe(false);
  });
});
