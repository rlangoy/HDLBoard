// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { APP_DEFAULTS_FILE, parseAppDefaults } from '../appDefaults';
import { parseOverridesForTest } from './simOnly.testSupport';
import {
  DEFAULT_DESIGN_CHECK, DESIGN_CHECK_STORAGE_KEY, designCheckInEffect, loadDesignCheckChoice, saveDesignCheckChoice,
} from './designCheckMode';
import { withSimModel, withoutSimModel } from './simModels';
import { DEFAULT_SYNTHESIS_TOOL_CHECK, synthesisToolCheckInEffect } from './useSynthesisToolCheck';
import { EMPTY_OVERRIDES } from '../tbDetect/types';
import { withoutFile } from '../splitModel';

/** docs/impl_sim_only_warnings.md § 9, Settings; and the Simulation model mark. */

/** A Storage that keeps its items in a Map, or throws on every call when `blocked`. */
function memoryStorage(blocked = false): () => Storage {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as Storage;
  return () => {
    if (blocked) throw new Error('blocked');
    return storage;
  };
}

describe('the mode in effect', () => {
  test('is Synthesis on a fresh install', () => {
    expect(designCheckInEffect(null, DEFAULT_DESIGN_CHECK)).toBe('synthesis');
  });

  test('follows settings.json', () => {
    expect(designCheckInEffect(null, 'simulation')).toBe('simulation');
  });

  test("is the student's own choice over the file", () => {
    expect(designCheckInEffect('synthesis', 'simulation')).toBe('synthesis');
  });

  test('is the quiet one while settings.json loads', () => {
    expect(designCheckInEffect(null, null)).toBe('simulation');
  });
});

describe('the stored choice', () => {
  test('round-trips', () => {
    const storage = memoryStorage();
    saveDesignCheckChoice('simulation', storage);
    expect(loadDesignCheckChoice(storage)).toBe('simulation');
  });

  test('is null when none was made', () => {
    expect(loadDesignCheckChoice(memoryStorage())).toBeNull();
  });

  test('ignores a value it does not know', () => {
    const storage = memoryStorage();
    storage().setItem(DESIGN_CHECK_STORAGE_KEY, 'strict');
    expect(loadDesignCheckChoice(storage)).toBeNull();
  });

  test('never throws when storage is blocked', () => {
    expect(() => saveDesignCheckChoice('synthesis', memoryStorage(true))).not.toThrow();
  });
});

describe('settings.json', () => {
  test('sets the mode', () => {
    expect(parseAppDefaults('{ "designCheck": "simulation" }').defaults.designCheck).toBe('simulation');
  });

  test('leaves it out when the file does not say', () => {
    expect(parseAppDefaults('{}').defaults.designCheck).toBeUndefined();
  });

  test('warns about a value it does not know', () => {
    expect(parseAppDefaults('{ "designCheck": "strict" }').warnings).toEqual([
      `${APP_DEFAULTS_FILE}: designCheck must be "synthesis" or "simulation".`,
    ]);
  });
});

describe('the Simulation model mark', () => {
  test('is set', () => {
    expect(withSimModel(EMPTY_OVERRIDES, 'a.vhd').simModels).toEqual({ 'a.vhd': true });
  });

  test('is dropped, and with the last one the field', () => {
    expect(withoutSimModel(withSimModel(EMPTY_OVERRIDES, 'a.vhd'), 'a.vhd')).toEqual(EMPTY_OVERRIDES);
  });

  test('goes with its deleted file', () => {
    const both = withSimModel(withSimModel(EMPTY_OVERRIDES, 'a.vhd'), 'b.vhd');
    expect(withoutFile(both, 'a.vhd').simModels).toEqual({ 'b.vhd': true });
  });

  test('survives a saved workspace', () => {
    expect(parseOverridesForTest({ roles: {}, pairs: {}, simModels: { 'a.vhd': true } }).simModels).toEqual({ 'a.vhd': true });
  });

  test('an older workspace without it reads as no marks', () => {
    expect(parseOverridesForTest({ roles: {}, pairs: {} })).toEqual(EMPTY_OVERRIDES);
  });

  test('a mark on a file that is not there is dropped', () => {
    expect(parseOverridesForTest({ roles: {}, pairs: {}, simModels: { 'gone.vhd': true } }).simModels).toBeUndefined();
  });
});

/** Settings › Simulation › Design check › Synthesis: Quick check, or + GHDL check for VHDL (§ 7). */
describe('the synthesis tool check in effect', () => {
  test('is off on a fresh install, and while settings.json loads', () => {
    expect(synthesisToolCheckInEffect(null, null)).toBe(false);
    expect(synthesisToolCheckInEffect(null, DEFAULT_SYNTHESIS_TOOL_CHECK)).toBe(false);
  });

  test("follows settings.json, under the student's own choice", () => {
    expect(synthesisToolCheckInEffect(null, true)).toBe(true);
    expect(synthesisToolCheckInEffect(false, true)).toBe(false);
  });

  test('settings.json may set it, as a boolean only', () => {
    expect(parseAppDefaults('{ "synthesisToolCheck": true }')).toEqual({ defaults: { bouncyButtons: true, synthesisToolCheck: true }, warnings: [] });
    expect(parseAppDefaults('{ "synthesisToolCheck": "yes" }').warnings).toEqual([`${APP_DEFAULTS_FILE}: synthesisToolCheck must be true or false.`]);
  });
});

/** What a fresh install starts with: *Synthesis*, and under it *Quick check*. */
describe('the defaults of the Design check', () => {
  const shipped = parseAppDefaults(readFileSync(new URL('../../../../public/settings.json', import.meta.url), 'utf8'));

  test('are Synthesis without a settings.json', () => {
    expect(designCheckInEffect(null, DEFAULT_DESIGN_CHECK)).toBe('synthesis');
  });

  test('are the quick check alone without a settings.json', () => {
    expect(synthesisToolCheckInEffect(null, DEFAULT_SYNTHESIS_TOOL_CHECK)).toBe(false);
  });

  test("are Synthesis with the settings.json HDLBoard ships", () => {
    expect(shipped.defaults.designCheck).toBe('synthesis');
  });

  test('are the quick check alone with the settings.json HDLBoard ships', () => {
    expect(shipped.defaults.synthesisToolCheck).toBe(false);
  });
});
