// SPDX-License-Identifier: GPL-2.0-only
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from './themePreference';

interface Environment {
  readonly html: { dataset: Record<string, string> };
  readonly values: Map<string, string>;
  setSystemDark(dark: boolean): void;
}

/** A fresh store module over stubbed storage, OS preference and <html>. */
async function loadStore(options: { stored?: string; systemDark?: boolean; saveThrows?: boolean } = {}) {
  const values = new Map<string, string>(options.stored === undefined ? [] : [[THEME_STORAGE_KEY, options.stored]]);
  let listener: (() => void) | undefined;
  const query = {
    matches: options.systemDark ?? false,
    addEventListener: (_: string, callback: () => void) => { listener = callback; },
    removeEventListener: vi.fn(),
  };
  const html = { dataset: {} as Record<string, string> };
  vi.stubGlobal('document', { documentElement: html });
  vi.stubGlobal('window', {
    matchMedia: () => query,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.saveThrows) throw new Error('blocked');
        values.set(key, value);
      },
    },
  });
  const environment: Environment = {
    html, values,
    setSystemDark(dark) { query.matches = dark; listener?.(); },
  };
  return { store: await import('./themeStore'), environment };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it('starts in Light with nothing stored', async () => {
  const { store, environment } = await loadStore();
  store.startTheme();
  expect(environment.html.dataset.theme).toBe('light');
  expect(store.getThemeState()).toEqual({ preference: 'light', resolved: 'light', saveFailed: false });
});

it('starts in the stored theme', async () => {
  const { store, environment } = await loadStore({ stored: 'dark' });
  store.startTheme();
  expect(environment.html.dataset.theme).toBe('dark');
});

it('applies, stores and announces a choice', async () => {
  const { store, environment } = await loadStore();
  store.startTheme();
  const listener = vi.fn();
  store.subscribeTheme(listener);
  store.chooseTheme('dark');
  expect(environment.html.dataset.theme).toBe('dark');
  expect(environment.values.get(THEME_STORAGE_KEY)).toBe('dark');
  expect(listener).toHaveBeenCalledTimes(1);
});

it('still switches when the choice cannot be stored, and says so', async () => {
  const { store, environment } = await loadStore({ saveThrows: true });
  store.startTheme();
  store.chooseTheme('dark');
  expect(environment.html.dataset.theme).toBe('dark');
  expect(store.getThemeState().saveFailed).toBe(true);
});

it('follows the OS live in System mode only', async () => {
  const { store, environment } = await loadStore({ stored: 'system' });
  store.startTheme();
  expect(environment.html.dataset.theme).toBe('light');
  environment.setSystemDark(true);
  expect(environment.html.dataset.theme).toBe('dark');
  store.chooseTheme('light');
  environment.setSystemDark(false);
  environment.setSystemDark(true);
  expect(environment.html.dataset.theme).toBe('light');
});

it('stops notifying a listener after it unsubscribes', async () => {
  const { store } = await loadStore();
  store.startTheme();
  const listener = vi.fn();
  const unsubscribe = store.subscribeTheme(listener);
  unsubscribe();
  store.chooseTheme('dark');
  expect(listener).not.toHaveBeenCalled();
});
