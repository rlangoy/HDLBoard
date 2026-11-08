// SPDX-License-Identifier: GPL-2.0-only
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from './themePreference';

interface StoreOptions {
  readonly stored?: string;
  readonly saveThrows?: boolean;
}

interface Environment {
  readonly html: { dataset: Record<string, string> };
  readonly values: Map<string, string>;
  setSystemDark(dark: boolean): void;
}

/** An OS dark-mode query whose change listener the test can fire. */
function systemQuery() {
  let listener: (() => void) | undefined;
  const query = {
    matches: false,
    addEventListener: (_: string, callback: () => void) => { listener = callback; },
    removeEventListener: vi.fn(),
  };
  const setSystemDark = (dark: boolean) => { query.matches = dark; listener?.(); };
  return { query, setSystemDark };
}

function storage(values: Map<string, string>, saveThrows: boolean) {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (saveThrows) throw new Error('blocked');
      values.set(key, value);
    },
  };
}

/** A fresh, started store module over stubbed storage, OS preference and <html>. */
async function startedStore(options: StoreOptions = {}) {
  const values = new Map<string, string>(options.stored === undefined ? [] : [[THEME_STORAGE_KEY, options.stored]]);
  const { query, setSystemDark } = systemQuery();
  const html = { dataset: {} as Record<string, string> };
  vi.stubGlobal('document', { documentElement: html });
  vi.stubGlobal('window', { matchMedia: () => query, localStorage: storage(values, options.saveThrows ?? false) });
  const store = await import('./themeStore');
  store.startTheme();
  const environment: Environment = { html, values, setSystemDark };
  return { store, environment };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it('starts in Light with nothing stored', async () => {
  const { store } = await startedStore();
  expect(store.getThemeState()).toEqual({ preference: 'light', resolved: 'light', saveFailed: false });
});

it.each(['light', 'dark'])('applies the stored %s theme at start', async (stored) => {
  const { environment } = await startedStore({ stored });
  expect(environment.html.dataset.theme).toBe(stored);
});

it('applies a choice', async () => {
  const { store, environment } = await startedStore();
  store.chooseTheme('dark');
  expect(environment.html.dataset.theme).toBe('dark');
});

it('stores a choice', async () => {
  const { store, environment } = await startedStore();
  store.chooseTheme('dark');
  expect(environment.values.get(THEME_STORAGE_KEY)).toBe('dark');
});

it('announces a choice to listeners', async () => {
  const { store } = await startedStore();
  const listener = vi.fn();
  store.subscribeTheme(listener);
  store.chooseTheme('dark');
  expect(listener).toHaveBeenCalledTimes(1);
});

it('still switches when the choice cannot be stored', async () => {
  const { store, environment } = await startedStore({ saveThrows: true });
  store.chooseTheme('dark');
  expect(environment.html.dataset.theme).toBe('dark');
});

it('reports a choice that could not be stored', async () => {
  const { store } = await startedStore({ saveThrows: true });
  store.chooseTheme('dark');
  expect(store.getThemeState().saveFailed).toBe(true);
});

it('follows the OS live in System mode', async () => {
  const { environment } = await startedStore({ stored: 'system' });
  environment.setSystemDark(true);
  expect(environment.html.dataset.theme).toBe('dark');
});

it('ignores the OS after an explicit choice', async () => {
  const { store, environment } = await startedStore({ stored: 'system' });
  store.chooseTheme('light');
  environment.setSystemDark(true);
  expect(environment.html.dataset.theme).toBe('light');
});

it('does not announce the current, stored theme chosen again', async () => {
  const { store } = await startedStore({ stored: 'dark' });
  const listener = vi.fn();
  store.subscribeTheme(listener);
  store.chooseTheme('dark');
  expect(listener).not.toHaveBeenCalled();
});

it('does not store the current, stored theme again', async () => {
  const { store, environment } = await startedStore({ stored: 'dark' });
  environment.values.delete(THEME_STORAGE_KEY);
  store.chooseTheme('dark');
  expect(environment.values.has(THEME_STORAGE_KEY)).toBe(false);
});

it('retries storing a choice whose last save failed', async () => {
  const { store } = await startedStore({ saveThrows: true });
  store.chooseTheme('dark');
  const listener = vi.fn();
  store.subscribeTheme(listener);
  store.chooseTheme('dark');
  expect(listener).toHaveBeenCalledTimes(1);
});

it('stops notifying a listener after it unsubscribes', async () => {
  const { store } = await startedStore();
  const listener = vi.fn();
  store.subscribeTheme(listener)();
  store.chooseTheme('dark');
  expect(listener).not.toHaveBeenCalled();
});
