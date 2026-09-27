// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compileArguments, stubArguments } from './process.js';
import type { ToolPaths } from './toolPaths.js';

const SYSTEM_INSTALL: ToolPaths = { iverilog: 'iverilog', vvp: 'vvp' };
const BUNDLED: ToolPaths = { iverilog: 'C:\\t\\iverilog.exe', vvp: 'C:\\t\\vvp.exe', bundledDir: 'C:\\t' };
const REQUEST = { dir: 'unused', target: 'DE1_SoC', files: ['DE1_SoC.v'] };

describe('stubArguments (§ 5.4 step 1: ask Icarus what the top declares)', () => {
  test('elaborates the top and dumps it, quietly about timescales', () => {
    assert.deepEqual(stubArguments(SYSTEM_INSTALL, REQUEST), [
      '-Wno-timescale',
      '-I.',
      '-s',
      'DE1_SoC',
      '-tstub',
      '-o',
      'ports.stub',
      '_hdlboard_ts.v',
      'DE1_SoC.v',
    ]);
  });

  test('points a bundled tree at itself with -B, first', () => {
    assert.equal(stubArguments(BUNDLED, REQUEST)[0], '-BC:\\t');
  });

  test('passes the student files in the order given, after the timescale file', () => {
    const args = stubArguments(SYSTEM_INSTALL, { ...REQUEST, files: ['b.v', 'a.v', 'c.v'] });
    assert.deepEqual(args.slice(-4), ['_hdlboard_ts.v', 'b.v', 'a.v', 'c.v']);
  });
});

describe('compileArguments (§ 5.4 step 2: build what will run)', () => {
  test('shows the compiler warnings, minus the timescale one that fires on every design', () => {
    assert.deepEqual(compileArguments(SYSTEM_INSTALL, { ...REQUEST, target: 'hdl_board_tb', files: ['hdl_board_tb.v', 'DE1_SoC.v'] }), [
      '-Wall',
      '-Wno-timescale',
      '-I.',
      '-s',
      'hdl_board_tb',
      '-o',
      'sim.vvp',
      '_hdlboard_ts.v',
      'hdl_board_tb.v',
      'DE1_SoC.v',
    ]);
  });

  test('points a bundled tree at itself with -B, first', () => {
    assert.equal(compileArguments(BUNDLED, REQUEST)[0], '-BC:\\t');
  });

  test('uses only relative file names, so a non-ASCII session directory cannot break it (M11)', () => {
    const args = compileArguments(SYSTEM_INSTALL, REQUEST);
    assert.ok(!args.some((arg) => /[\\/]/.test(arg) && !arg.startsWith('-B')));
  });

  test('elaborates the requested target', () => {
    const args = compileArguments(SYSTEM_INSTALL, { ...REQUEST, target: 'tb_counter8' });
    assert.equal(args[args.indexOf('-s') + 1], 'tb_counter8');
  });
});
