// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The synthesis check's command lines (docs/impl_sim_only_warnings.md § 7). */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ghdlSynthCommand } from './ghdlEngine.js';
import { verilogEngine } from './verilogEngine.js';

describe('ghdlSynthCommand', () => {
  const inputs = { flags: ['--std=08', '-fsynopsys'], order: ['pkg.vhd', 'counter.vhd', 'counter_tb.vhd'] };

  test("reads the page's files in the order they analysed, with the run's flags, and elaborates the top", () => {
    const command = ghdlSynthCommand(inputs, { top: 'counter', files: ['counter.vhd', 'pkg.vhd'] });
    assert.deepEqual(command.args, ['--synth', '--std=08', '-fsynopsys', '--out=none', '-Wno-pragma', 'pkg.vhd', 'counter.vhd', '-e', 'counter']);
  });

  test('never reads a file the page left out', () => {
    const command = ghdlSynthCommand(inputs, { top: 'counter', files: ['counter.vhd'] });
    assert.equal(command.args.includes('counter_tb.vhd'), false);
  });
});

describe('the Verilog engine', () => {
  test('has no synthesis check: Icarus refuses legal Quartus code (docs/impl_sim_only_warnings.md § 7.1)', () => {
    assert.equal(verilogEngine.synthCommand, undefined);
  });
});
