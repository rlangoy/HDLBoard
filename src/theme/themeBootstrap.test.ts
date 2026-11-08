// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { THEME_STORAGE_KEY } from './themePreference';

it('the index.html bootstrap reads the same storage key as the app', () => {
  expect(indexHtml).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
});

it('the index.html bootstrap runs before any stylesheet or module script', () => {
  const bootstrap = indexHtml.indexOf('dataset.theme');
  expect(bootstrap).toBeGreaterThan(0);
  expect(indexHtml.indexOf('<link')).toBe(-1);
  expect(bootstrap).toBeLessThan(indexHtml.indexOf('<script type="module"'));
});
