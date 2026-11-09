// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_COMPILER_OPTIONS } from '../compilerOptions.js';
import { iverilogFlags } from './optionFlags.js';

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
