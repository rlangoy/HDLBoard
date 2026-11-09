// SPDX-License-Identifier: GPL-2.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadThemePreference, parseThemePreference, resolveTheme, saveThemePreference, THEME_STORAGE_KEY,
  type ThemePreference,
} from './themePreference';

afterEach(() => vi.unstubAllGlobals());

function stubStorage(values = new Map<string, string>()): Map<string, string> {
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  return values;
}

function blocked(): never {
  throw new Error('blocked');
}

describe('parseThemePreference', () => {
  it.each([null, '', 'black', 'DARK', ' dark'])('reads %j as System', (value) => {
    expect(parseThemePreference(value)).toBe('system');
  });

  it.each(['light', 'dark', 'system'])('keeps %s', (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });
});

describe('resolveTheme', () => {
  it.each([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ] as const)('resolves %s with the OS dark = %s to %s', (preference, systemIsDark, expected) => {
    expect(resolveTheme(preference, systemIsDark)).toBe(expected);
  });
});

describe('stored preference', () => {
  it('is System when nothing is stored', () => {
    stubStorage();
    expect(loadThemePreference()).toBe('system');
  });

  it('is saved under its own key', () => {
    const values = stubStorage();
    saveThemePreference('dark');
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('reports a successful save', () => {
    stubStorage();
    expect(saveThemePreference('dark')).toBe(true);
  });

  it.each<ThemePreference>(['light', 'dark', 'system'])('loads %s after it was saved', (preference) => {
    stubStorage();
    saveThemePreference(preference);
    expect(loadThemePreference()).toBe(preference);
  });

  it('is System when the stored value is invalid', () => {
    stubStorage(new Map([[THEME_STORAGE_KEY, 'neon']]));
    expect(loadThemePreference()).toBe('system');
  });

  it.each([
    ['getItem throws', { localStorage: { getItem: blocked } }],
    ['localStorage itself throws', { get localStorage() { return blocked(); } }],
  ])('is System when %s', (_, window) => {
    vi.stubGlobal('window', window);
    expect(loadThemePreference()).toBe('system');
  });

  it('reports a failed save instead of throwing', () => {
    vi.stubGlobal('window', { localStorage: { setItem: blocked } });
    expect(saveThemePreference('dark')).toBe(false);
  });
});
