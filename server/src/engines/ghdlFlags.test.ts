// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_COMPILER_OPTIONS, type GhdlOptions } from '../compilerOptions.js';
import { ghdlFlags, planGhdlFlags } from './ghdlFlags.js';

const LEGACY_FILE = { name: 'counter.vhd', content: 'library ieee;\nuse ieee.std_logic_unsigned.all;\n' };
const MODERN_FILE = { name: 'counter.vhd', content: 'library ieee;\nuse ieee.numeric_std.all;\n' };
const AUTO = DEFAULT_COMPILER_OPTIONS.ghdl;
const withGhdl = (options: Partial<GhdlOptions>): GhdlOptions => ({ ...AUTO, ...options });

describe('ghdlFlags', () => {
  test('is the VHDL-2008 standard alone with every switch off', () => {
    assert.deepEqual(ghdlFlags({ synopsys: false, relaxed: false }), ['--std=08']);
  });

  test('adds -fsynopsys', () => {
    assert.deepEqual(ghdlFlags({ synopsys: true, relaxed: false }), ['--std=08', '-fsynopsys']);
  });

  test('adds -frelaxed', () => {
    assert.deepEqual(ghdlFlags({ synopsys: false, relaxed: true }), ['--std=08', '-frelaxed']);
  });

  test('adds both, in a fixed order', () => {
    assert.deepEqual(ghdlFlags({ synopsys: true, relaxed: true }), ['--std=08', '-fsynopsys', '-frelaxed']);
  });
});

describe('planGhdlFlags', () => {
  test('auto turns -fsynopsys on for a file using a legacy package', () => {
    assert.deepEqual(planGhdlFlags(AUTO, [LEGACY_FILE]).flags, ['--std=08', '-fsynopsys']);
  });

  test('auto leaves -fsynopsys off without a legacy package', () => {
    assert.deepEqual(planGhdlFlags(AUTO, [MODERN_FILE]).flags, ['--std=08']);
  });

  test('auto warns at the first reference of each legacy package, where GHDL points', () => {
    assert.deepEqual(
      planGhdlFlags(AUTO, [LEGACY_FILE]).warnings.map((warning) => warning.split(':warning:')[0]),
      ['counter.vhd:2:10'],
    );
  });

  test('auto says nothing without a legacy package', () => {
    assert.deepEqual(planGhdlFlags(AUTO, [MODERN_FILE]).warnings, []);
  });

  test('true turns -fsynopsys on without a legacy package', () => {
    assert.deepEqual(planGhdlFlags(withGhdl({ synopsys: true }), [MODERN_FILE]).flags, ['--std=08', '-fsynopsys']);
  });

  test('false keeps -fsynopsys off even with a legacy package', () => {
    assert.deepEqual(planGhdlFlags(withGhdl({ synopsys: false }), [LEGACY_FILE]).flags, ['--std=08']);
  });

  test('false gives no warning: GHDL’s own error names the package', () => {
    assert.deepEqual(planGhdlFlags(withGhdl({ synopsys: false }), [LEGACY_FILE]).warnings, []);
  });

  test('passes relaxed through', () => {
    assert.deepEqual(planGhdlFlags(withGhdl({ relaxed: true }), [MODERN_FILE]).flags, ['--std=08', '-frelaxed']);
  });
});
