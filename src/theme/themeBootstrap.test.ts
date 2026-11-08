// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY } from './themePreference';

it('the index.html bootstrap reads the same storage key as the app', () => {
  expect(indexHtml).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
});

it('the index.html bootstrap runs before any stylesheet or module script', () => {
  const bootstrap = indexHtml.indexOf('dataset.theme');
  expect(bootstrap).toBeGreaterThan(0);
  expect(indexHtml.indexOf('<link')).toBe(-1);
  expect(bootstrap).toBeLessThan(indexHtml.indexOf('<script type="module"'));
});

/** Runs the inline script of index.html with the given storage and OS preference. */
function bootstrapTheme(stored: string | null, systemIsDark: boolean): string | undefined {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';
  const html = { dataset: {} as Record<string, string> };
  const window = { matchMedia: () => ({ matches: systemIsDark }) };
  const localStorage = { getItem: () => stored };
  new Function('window', 'localStorage', 'document', script)(window, localStorage, { documentElement: html });
  return html.dataset.theme;
}

it.each([null, '', 'light', 'dark', 'system', 'DARK', 'black'])('the bootstrap resolves %j as the app does', (stored) => {
  for (const systemIsDark of [false, true]) {
    expect(bootstrapTheme(stored, systemIsDark)).toBe(resolveTheme(parseThemePreference(stored), systemIsDark));
  }
});
