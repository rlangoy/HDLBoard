// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY } from './themePreference';

it('the index.html bootstrap reads the same storage key as the app', () => {
  expect(indexHtml).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
});

it('the index.html bootstrap runs before the module script', () => {
  expect(indexHtml.indexOf('dataset.theme')).toBeLessThan(indexHtml.indexOf('<script type="module"'));
});

it('index.html loads no stylesheet ahead of the bootstrap', () => {
  expect(indexHtml).not.toContain('<link');
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

const STORED_VALUES = [null, '', 'light', 'dark', 'system', 'DARK', 'black'];
const CASES = STORED_VALUES.flatMap((stored) => [false, true].map((systemIsDark) => ({ stored, systemIsDark })));

it.each(CASES)('the bootstrap resolves $stored (OS dark: $systemIsDark) as the app does', ({ stored, systemIsDark }) => {
  expect(bootstrapTheme(stored, systemIsDark)).toBe(resolveTheme(parseThemePreference(stored), systemIsDark));
});
