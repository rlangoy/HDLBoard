// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { DEFAULT_LANGUAGES, parsePreferredLanguages, serializePreferredLanguages, withLanguageToggled } from './languagePrefs';

describe('parsePreferredLanguages', () => {
  test.each([null, '', 'not json', '"vhdl"', '{}'])('%s falls back to both languages', (json) => {
    expect(parsePreferredLanguages(json)).toEqual(DEFAULT_LANGUAGES);
  });

  test.each(['[]', '["cobol"]'])('%s is a choice of no language, kept as it is', (json) => {
    expect(parsePreferredLanguages(json).size).toBe(0);
  });

  test('reads a stored choice', () => {
    expect([...parsePreferredLanguages('["verilog"]')]).toEqual(['verilog']);
  });

  test('drops unknown entries and duplicates', () => {
    expect([...parsePreferredLanguages('["vhdl", "cobol", "vhdl"]')]).toEqual(['vhdl']);
  });
});

describe('serializePreferredLanguages', () => {
  test('lists the languages in the Examples pane’s order, whatever order they were chosen in', () => {
    expect(serializePreferredLanguages(new Set(['verilog', 'vhdl']))).toBe('["vhdl","verilog"]');
  });

  test('round-trips through parsePreferredLanguages', () => {
    const verilogOnly = new Set(['verilog'] as const);
    expect(parsePreferredLanguages(serializePreferredLanguages(verilogOnly))).toEqual(verilogOnly);
    expect(parsePreferredLanguages(serializePreferredLanguages(new Set())).size).toBe(0);
  });
});

describe('withLanguageToggled', () => {
  test('clears a ticked language', () => {
    expect(withLanguageToggled(new Set(['vhdl', 'verilog']), 'vhdl')).toEqual(new Set(['verilog']));
  });

  test('ticks a cleared language', () => {
    expect(withLanguageToggled(new Set(), 'verilog')).toEqual(new Set(['verilog']));
  });

  test('leaves the set it was given unchanged', () => {
    const languages = new Set(['vhdl'] as const);
    withLanguageToggled(languages, 'vhdl');
    expect(languages).toEqual(new Set(['vhdl']));
  });
});
