// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseAppDefaults } from './appDefaults';
import { DEFAULT_TOP_FILE_HINT, topFileHintInEffect } from './useTopFileHint';

describe('Suggest the Top-File in effect', () => {
  test('is on on a fresh install', () => {
    expect(topFileHintInEffect(null, DEFAULT_TOP_FILE_HINT)).toBe(true);
  });

  test('is on while settings.json loads', () => {
    expect(topFileHintInEffect(null, null)).toBe(true);
  });

  test('follows settings.json', () => {
    expect(topFileHintInEffect(null, false)).toBe(false);
  });

  test("is the student's own choice over the file", () => {
    expect(topFileHintInEffect(true, false)).toBe(true);
  });
});

describe('settings.json', () => {
  test('sets it', () => {
    expect(parseAppDefaults('{ "topFileHint": false }').defaults.topFileHint).toBe(false);
  });

  test('leaves it out when the file does not say', () => {
    expect(parseAppDefaults('{}').defaults.topFileHint).toBeUndefined();
  });

  test('warns about a value that is not true or false', () => {
    expect(parseAppDefaults('{ "topFileHint": "yes" }').warnings).toEqual(['settings.json: topFileHint must be true or false.']);
  });

  test('HDLBoard ships with it on', () => {
    const shipped = parseAppDefaults(readFileSync(new URL('../../../public/settings.json', import.meta.url), 'utf8'));
    expect(shipped.defaults.topFileHint).toBe(true);
  });
});
