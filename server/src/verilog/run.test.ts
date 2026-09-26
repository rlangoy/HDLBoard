// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { BoardFiles, BoardTiming } from '../engines/types.js';
import { batchRunArguments, boardRunArguments } from './run.js';
import type { ToolPaths } from './toolPaths.js';

const SYSTEM_INSTALL: ToolPaths = { iverilog: 'iverilog', vvp: 'vvp' };
const BUNDLED: ToolPaths = { iverilog: 'C:\\t\\iverilog.exe', vvp: 'C:\\t\\vvp.exe', bundledDir: 'C:\\t' };
const FILES: BoardFiles = { input: 'input.txt', output: 'output.txt', heartbeat: 'heartbeat-3.txt' };
const TIMING: BoardTiming = { pollIntervalNs: 10_000, minDwellNs: 4_000_000 };

describe('boardRunArguments (§ 5.4 step 3, the persistent run)', () => {
  test('runs the compiled simulation non-interactively with unbuffered output, and passes its settings as plusargs', () => {
    assert.deepEqual(boardRunArguments(SYSTEM_INSTALL, FILES, TIMING), [
      '-n',
      '-i',
      'sim.vvp',
      '+input_file=input.txt',
      '+output_file=output.txt',
      '+heartbeat_file=heartbeat-3.txt',
      '+poll_interval_ns=10000',
      '+min_dwell_ns=4000000',
    ]);
  });

  test('points a bundled tree at its modules with -M, first', () => {
    assert.equal(boardRunArguments(BUNDLED, FILES, TIMING)[0], '-MC:\\t');
  });

  test('always asks for unbuffered output: without it a design’s $display never arrives while it runs (M4)', () => {
    assert.ok(boardRunArguments(SYSTEM_INSTALL, FILES, TIMING).includes('-i'));
  });

  test('always makes $stop a plain end of simulation, never an interactive prompt', () => {
    assert.ok(boardRunArguments(SYSTEM_INSTALL, FILES, TIMING).includes('-n'));
  });
});

describe('batchRunArguments (a standalone testbench)', () => {
  test('runs the compiled simulation with no plusargs', () => {
    assert.deepEqual(batchRunArguments(SYSTEM_INSTALL), ['-n', '-i', 'sim.vvp']);
  });

  test('points a bundled tree at its modules with -M, first', () => {
    assert.deepEqual(batchRunArguments(BUNDLED), ['-MC:\\t', '-n', '-i', 'sim.vvp']);
  });
});
