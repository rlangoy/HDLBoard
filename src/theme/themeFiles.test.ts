// SPDX-License-Identifier: GPL-2.0-only
import { describe, expect, it } from 'vitest';
import darkCss from './themes/dark.css?raw';
import lightCss from './themes/light.css?raw';
import { DARK_PREFIX, parseThemeBlocks, type ThemeBlocks } from './themeCss.testSupport';

const COLOUR_VALUE = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([\d.,\s/%]+\))$/i;
const CHANNEL_TRIPLE = /^\d{1,3}, \d{1,3}, \d{1,3}$/;

const light = parseThemeBlocks(lightCss);
const dark = parseThemeBlocks(darkCss, DARK_PREFIX);

function namesOf(blocks: ThemeBlocks): Record<string, string[]> {
  return Object.fromEntries([...blocks].map(([selector, declarations]) => [selector, [...declarations.keys()].sort()]));
}

function isAllowedDeclaration(name: string, value: string): boolean {
  if (name === 'color-scheme') return value === 'light' || value === 'dark';
  if (!name.startsWith('--')) return false;
  return name.endsWith('-glow') ? CHANNEL_TRIPLE.test(value) : COLOUR_VALUE.test(value);
}

describe('theme profiles', () => {
  it('define the same variables for the same selectors', () => {
    expect(namesOf(dark)).toEqual(namesOf(light));
  });

  it.each([['light', light], ['dark', dark]])('%s holds colours only', (_, blocks) => {
    const invalid = [...blocks.values()].flatMap((declarations) =>
      [...declarations].filter(([name, value]) => !isAllowedDeclaration(name, value)).map(([name, value]) => `${name}: ${value}`));
    expect(invalid).toEqual([]);
  });
});
