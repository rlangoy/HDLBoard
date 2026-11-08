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

it.each([true, false])('reads the OS dark preference %s', (dark) => {
  stubMatchMedia(dark);
  expect(systemPrefersDark()).toBe(dark);
});

it('is not dark when matchMedia is missing', () => {
  vi.stubGlobal('window', {});
  expect(systemPrefersDark()).toBe(false);
});

it('resolves System to Light when matchMedia is missing', () => {
  vi.stubGlobal('window', {});
  expect(resolveTheme('system', systemPrefersDark())).toBe('light');
});

it.each([
  ['matchMedia is missing', {}],
  ['MediaQueryList has no events (Safari < 14)', { matchMedia: () => ({ matches: false }) }],
])('returns a no-op unsubscribe when %s', (_, window) => {
  vi.stubGlobal('window', window);
  const unsubscribe = subscribeSystemTheme(() => undefined);
  expect(() => unsubscribe()).not.toThrow();
});

it('observes OS changes', () => {
  const query = stubMatchMedia(false);
  const onChange = vi.fn();
  subscribeSystemTheme(onChange);
  expect(query.addEventListener).toHaveBeenCalledWith('change', onChange);
});

it('stops observing OS changes after unsubscribing', () => {
  const query = stubMatchMedia(false);
  const onChange = vi.fn();
  subscribeSystemTheme(onChange)();
  expect(query.removeEventListener).toHaveBeenCalledWith('change', onChange);
});
