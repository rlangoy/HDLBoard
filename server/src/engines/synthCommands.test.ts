// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The synthesis check's command lines (docs/impl_sim_only_warnings.md § 7). */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { TIMESCALE_FILE_NAME, TIMESCALE_SOURCE } from '../verilog/fileNames.js';
import { ghdlSynthCommand } from './ghdlEngine.js';
import { iverilogSynthCommand } from './verilogEngine.js';

describe('ghdlSynthCommand', () => {
  const inputs = { flags: ['--std=08', '-fsynopsys'], order: ['pkg.vhd', 'counter.vhd', 'counter_tb.vhd'] };

  test("reads the page's files in the order they analysed, with the run's flags, and elaborates the top", () => {
    const command = ghdlSynthCommand(inputs, { top: 'counter', files: ['counter.vhd', 'pkg.vhd'] });
    assert.deepEqual(command.args, ['--synth', '--std=08', '-fsynopsys', '--out=none', '-Wno-pragma', 'pkg.vhd', 'counter.vhd', '-e', 'counter']);
    assert.deepEqual(command.extraFiles, []);
  });

  test('never reads a file the page left out', () => {
    const command = ghdlSynthCommand(inputs, { top: 'counter', files: ['counter.vhd'] });
    assert.equal(command.args.includes('counter_tb.vhd'), false);
  });
});

describe('iverilogSynthCommand', () => {
  const inputs = { flags: ['-g2012', '-DWIDTH=8'], order: ['blink.v', 'blink_tb.v'] };
  const command = iverilogSynthCommand(inputs, { top: 'blink', files: ['blink.v', 'defs.vh'] });

  test("synthesizes to the null target with SYNTHESIS defined and the run's options", () => {
    for (const flag of ['-S', '-tnull', '-DSYNTHESIS', '-g2012', '-DWIDTH=8', '-I.']) assert.ok(command.args.includes(flag), flag);
    const root = command.args.indexOf('-s');
    assert.equal(command.args[root + 1], 'blink');
  });

  test('compiles the timescale file first, then the sources the page named; headers are only found', () => {
    assert.deepEqual(command.args.slice(-2), [TIMESCALE_FILE_NAME, 'blink.v']);
    assert.deepEqual(command.extraFiles, [{ name: TIMESCALE_FILE_NAME, content: TIMESCALE_SOURCE }]);
  });
});
