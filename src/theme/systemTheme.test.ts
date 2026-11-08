// SPDX-License-Identifier: GPL-2.0-only
import { afterEach, expect, it, vi } from 'vitest';
import { subscribeSystemTheme, systemPrefersDark } from './systemTheme';
import { resolveTheme } from './themePreference';

afterEach(() => vi.unstubAllGlobals());

function stubMatchMedia(matches: boolean) {
  const query = { matches, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('window', { matchMedia: vi.fn(() => query) });
  return query;
}

it('reads the OS dark preference', () => {
  stubMatchMedia(true);
  expect(systemPrefersDark()).toBe(true);
  stubMatchMedia(false);
  expect(systemPrefersDark()).toBe(false);
});

it('is not dark when matchMedia is missing, so System resolves to Light', () => {
  vi.stubGlobal('window', {});
  expect(systemPrefersDark()).toBe(false);
  expect(resolveTheme('system', systemPrefersDark())).toBe('light');
});

it('returns a no-op unsubscribe when matchMedia is missing', () => {
  vi.stubGlobal('window', {});
  const unsubscribe = subscribeSystemTheme(() => undefined);
  expect(() => unsubscribe()).not.toThrow();
});

it('observes and stops observing OS changes', () => {
  const query = stubMatchMedia(false);
  const onChange = vi.fn();
  const unsubscribe = subscribeSystemTheme(onChange);
  expect(query.addEventListener).toHaveBeenCalledWith('change', onChange);
  unsubscribe();
  expect(query.removeEventListener).toHaveBeenCalledWith('change', onChange);
});
