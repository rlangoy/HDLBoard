// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_COMPILER_OPTIONS } from '../compilerOptions.js';
import { iverilogFlags, predefinedMacros } from './optionFlags.js';

describe('iverilogFlags', () => {
  test('is empty for the defaults: Icarus runs as it always has', () => {
    assert.deepEqual(iverilogFlags(DEFAULT_COMPILER_OPTIONS.iverilog), []);
  });

  test('names the generation', () => {
    assert.deepEqual(iverilogFlags({ generation: '2012', defines: {} }), ['-g2012']);
  });

  test('defines a macro with a value', () => {
    assert.deepEqual(iverilogFlags({ defines: { WIDTH: '8' } }), ['-DWIDTH=8']);
  });

  test('defines a macro with no value by its name alone', () => {
    assert.deepEqual(iverilogFlags({ defines: { SIMULATION: '' } }), ['-DSIMULATION']);
  });

  test('puts the generation before the macros', () => {
    assert.deepEqual(iverilogFlags({ generation: '2009', defines: { A: '1', B: '2' } }), ['-g2009', '-DA=1', '-DB=2']);
  });
});

describe('predefinedMacros', () => {
  test('holds the macros Icarus defines itself', () => {
    assert.deepEqual(predefinedMacros(DEFAULT_COMPILER_OPTIONS.iverilog), ['__ICARUS__', '__FILE__', '__LINE__']);
  });

  test("adds the project's macros by name, whatever their value", () => {
    assert.deepEqual(predefinedMacros({ defines: { WIDTH: '8', SIMULATION: '' } }).slice(-2), ['WIDTH', 'SIMULATION']);
  });
});
