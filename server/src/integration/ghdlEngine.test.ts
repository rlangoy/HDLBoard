// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The GHDL engine on its own, before `Session` is switched over to it
 * (docs/Verilog_implementation_plan.md step E2): given files, it must decide what
 * today's `handleRun` decides — which stage an error belongs to, whether the design is
 * a board design or a standalone testbench — and say how to run it. The end-to-end
 * behaviour is pinned separately by the characterization tests.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, test, type TestContext } from 'node:test';
import { TIMING_WITHOUT_CLOCK_50, TIMING_WITH_CLOCK_50 } from '../engines/boardTiming.js';
import { ghdlEngine } from '../engines/ghdlEngine.js';
import type { PrepareResult } from '../engines/types.js';
import { setGhdlExe } from '../ghdl.js';
import { readFixture } from '../testSupport/fixture.js';
import { requireTool } from '../testSupport/requireTool.js';
import { makeTempDir } from '../testSupport/sessionDir.js';
import {
  INVERTER_VHDL,
  INVERTING_TOP_VHDL,
  NO_BOARD_PORTS_VHDL,
  PORTLESS_TESTBENCH_VHDL,
  SYNTAX_ERROR_VHDL,
  UNKNOWN_INPUT_PORT_VHDL,
} from '../testSupport/vhdlSources.js';

const ghdl = requireTool('ghdl');

/** The first line of `ghdl --version`, whichever GHDL this machine has: "GHDL 5.0.1 (…) [Dunoon edition]". */
const GHDL_BANNER = /^GHDL \d+\.\d+\.\d+\b/;
const EXPECTED_PACING = process.platform === 'win32' ? 'stdin' : 'fifo';

function newDir(t: TestContext): string {
  const dir = makeTempDir('hdlboard-ghdl-engine-');
  t.after(() => dir.cleanup());
  return dir.path;
}

async function prepare(t: TestContext, files: Array<{ name: string; content: string }>, topFile?: string): Promise<PrepareResult> {
  return ghdlEngine.prepare({ dir: newDir(t), files, topFile });
}

const fixtureFile = (name: string) => ({ name, content: readFixture('vhdl', name) });

describe('GhdlEngine.prepare', { skip: ghdl.skip }, () => {
  before(() => {
    if (ghdl.exe) setGhdlExe(ghdl.exe);
  });

  test('is the VHDL engine', () => {
    assert.equal(ghdlEngine.language, 'vhdl');
  });

  test('plans a board run of the generated testbench for a design with board ports', async (t) => {
    const result = await prepare(t, [fixtureFile('DE1_SoC.vhdl')], 'DE1_SoC.vhdl');
    assert.ok(result.ok);
    assert.equal(result.plan.mode, 'board');
    assert.equal(result.plan.runTarget, 'hdl_board_tb');
    assert.equal(result.plan.pacing, EXPECTED_PACING);
    assert.equal(result.plan.messages.length, 1);
    assert.match(result.plan.messages[0] ?? '', GHDL_BANNER);
    // The real version, not a fixed string: it is what `ghdl --version` says.
    const version = spawnSync(ghdl.exe as string, ['--version'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0]?.trim();
    assert.equal(result.plan.messages[0], version);
  });

  test('polls finely when the design declares CLOCK_50', async (t) => {
    const result = await prepare(t, [fixtureFile('DE1_SoC.vhdl')], 'DE1_SoC.vhdl');
    assert.ok(result.ok);
    assert.deepEqual(result.plan.timing, TIMING_WITH_CLOCK_50);
  });

  test('polls coarsely when the design has only slow clocks', async (t) => {
    const result = await prepare(t, [fixtureFile('blinkTest.vhdl')], 'blinkTest.vhdl');
    assert.ok(result.ok);
    assert.deepEqual(result.plan.timing, TIMING_WITHOUT_CLOCK_50);
  });

  test('plans a batch run of the design itself when it declares no ports at all', async (t) => {
    const result = await prepare(t, [{ name: 'tb_hello.vhdl', content: PORTLESS_TESTBENCH_VHDL }], 'tb_hello.vhdl');
    assert.ok(result.ok);
    assert.equal(result.plan.mode, 'batch');
    assert.equal(result.plan.runTarget, 'tb_hello');
    assert.deepEqual(result.plan.messages, []);
  });

  test('writes the project’s files into the session directory', async (t) => {
    const dir = newDir(t);
    await ghdlEngine.prepare({ dir, files: [fixtureFile('DE1_SoC.vhdl')], topFile: 'DE1_SoC.vhdl' });
    assert.ok(existsSync(join(dir, 'DE1_SoC.vhdl')));
  });

  test('reports a syntax error as an analyze failure naming the file', async (t) => {
    const result = await prepare(t, [{ name: 'bad.vhdl', content: SYNTAX_ERROR_VHDL }], 'bad.vhdl');
    assert.ok(!result.ok);
    assert.equal(result.stage, 'analyze');
    assert.match(result.text, /bad\.vhdl:\d+/);
  });

  test('reports a project with no board design as an elaborate failure naming the entities', async (t) => {
    const result = await prepare(t, [{ name: 'aloof.vhdl', content: NO_BOARD_PORTS_VHDL }]);
    assert.ok(!result.ok);
    assert.equal(result.stage, 'elaborate');
    assert.match(result.text, /None of the declared entities \(aloof\)/);
  });

  test('runs a design with an extra input, held at 0, and warns on its declaration', async (t) => {
    const result = await prepare(t, [{ name: 'lonely.vhdl', content: UNKNOWN_INPUT_PORT_VHDL }], 'lonely.vhdl');
    assert.ok(result.ok);
    assert.equal(result.plan.mode, 'board');
    assert.equal(result.plan.messages[1]?.split('\n')[0], 'lonely.vhdl:7:5:warning: `BTN` is not a board input, so it is held at 0.');
  });

  const typoTop = (portType: string): string => `library ieee;
use ieee.std_logic_1164.all;

entity typo is
  port (
    SdsW : in  ${portType};
    LEDR : out std_logic_vector(9 downto 0)
  );
end entity;

architecture rtl of typo is
begin
  LEDR <= (others => '1');
end architecture;
`;

  test('suggests the board input a misspelled port was meant to be', async (t) => {
    const result = await prepare(t, [{ name: 'typo.vhdl', content: typoTop('std_logic_vector(9 downto 0)') }], 'typo.vhdl');
    assert.ok(result.ok);
    assert.match(result.plan.messages[1] ?? '', /^typo\.vhdl:6:5:warning: `SdsW` is not a board input — did you mean `SW`\?/);
  });

  test('reports an extra input it cannot hold at 0 on its own declaration', async (t) => {
    const result = await prepare(t, [{ name: 'typo.vhdl', content: typoTop('integer') }], 'typo.vhdl');
    assert.ok(!result.ok);
    assert.equal(result.stage, 'elaborate');
    assert.match(result.text, /^typo\.vhdl:6:5:error: `SdsW` is not a board input — did you mean `SW`\?/);
    assert.doesNotMatch(result.text, /^hdl_board_tb/m);
  });

  test('analyzes a project that spans two files whichever order it arrives in', async (t) => {
    const top = { name: 'top.vhdl', content: INVERTING_TOP_VHDL };
    const inverter = { name: 'inverter.vhdl', content: INVERTER_VHDL };
    assert.ok((await prepare(t, [top, inverter], 'top.vhdl')).ok);
    assert.ok((await prepare(t, [inverter, top], 'top.vhdl')).ok);
  });

  test('reports every failing file when none of them can be analyzed', async (t) => {
    const broken = [
      { name: 'one.vhdl', content: SYNTAX_ERROR_VHDL },
      { name: 'two.vhdl', content: SYNTAX_ERROR_VHDL.replace('bad', 'bad2') },
    ];
    const result = await prepare(t, broken);
    assert.ok(!result.ok);
    assert.match(result.text, /one\.vhdl/);
    assert.match(result.text, /two\.vhdl/);
  });
});
