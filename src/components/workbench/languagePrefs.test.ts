// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { DEFAULT_LANGUAGES, parsePreferredLanguages, serializePreferredLanguages } from './languagePrefs';

describe('parsePreferredLanguages', () => {
  test.each([null, '', 'not json', '"vhdl"', '{}', '[]', '["cobol"]'])('%s falls back to both languages', (json) => {
    expect(parsePreferredLanguages(json)).toEqual(DEFAULT_LANGUAGES);
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
  });
});
