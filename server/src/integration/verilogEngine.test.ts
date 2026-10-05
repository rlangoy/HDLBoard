// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog engine on its own (docs/Verilog_implementation_plan.md step E4): given
 * files, it must decide which stage an error belongs to, whether the design is a board
 * design or a standalone testbench, and say how to run it. Runs the real `iverilog`.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, test, type TestContext } from 'node:test';
import { TIMING_WITHOUT_CLOCK_50, TIMING_WITH_CLOCK_50 } from '../engines/boardTiming.js';
import { selectEngine } from '../engines/selectEngine.js';
import type { PrepareResult, RunPlan } from '../engines/types.js';
import { verilogEngine } from '../engines/verilogEngine.js';
import { icarusForTests } from '../testSupport/icarus.js';
import { readFixture } from '../testSupport/fixture.js';
import { makeTempDir } from '../testSupport/sessionDir.js';
import { setToolPaths } from '../verilog/tools.js';

const icarus = icarusForTests();

type Files = Array<{ name: string; content: string }>;

const SYNTAX_ERROR = 'module bad(input a;\nendmodule\n';
const TWO_MODULES = 'module first(input CLOCK_50);\nendmodule\nmodule second(input CLOCK_50);\nendmodule\n';
const UNCONNECTED_WIDTH = 'module narrow(output [3:0] LEDR);\n  assign LEDR = 4\'b1010;\nendmodule\n';
const HEADER_USER = '`include "defs.vh"\nmodule uses_header(output [9:0] LEDR);\n  assign LEDR = `ALL_ON;\nendmodule\n';
const HEADER = '`define ALL_ON 10\'h3ff\n';
const SLOW_CLOCK_ONLY = 'module slow(input CLOCK_500Hz, output [9:0] LEDR);\n  assign LEDR = 10\'d0;\nendmodule\n';

function newDir(t: TestContext): string {
  const dir = makeTempDir('hdlboard-verilog-engine-');
  t.after(() => dir.cleanup());
  return dir.path;
}

async function prepare(t: TestContext, files: Files, topFile: string | undefined = files[0]?.name): Promise<PrepareResult> {
  return verilogEngine.prepare({ dir: newDir(t), files, topFile });
}

const fixtureFile = (name: string) => ({ name, content: readFixture('verilog', name) });

describe('VerilogEngine.prepare', { skip: icarus.skip }, () => {
  before(() => setToolPaths(icarus.tools));

  test('is the Verilog engine, and the one chosen for a .v top file', () => {
    assert.equal(verilogEngine.language, 'verilog');
    assert.equal(selectEngine('DE1_SoC.v'), verilogEngine);
  });

  test('plans a board run for a design with board ports, behind a version banner', async (t) => {
    const result = await prepare(t, [fixtureFile('DE1_SoC.v')]);
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.equal(result.plan.mode, 'board');
    assert.equal(result.plan.pacing, 'stdin');
    assert.match(result.plan.messages[0] ?? '', /^Icarus Verilog version /);
  });

  test('polls finely when the design declares CLOCK_50', async (t) => {
    const result = await prepare(t, [fixtureFile('DE1_SoC.v')]);
    assert.ok(result.ok);
    assert.deepEqual(result.plan.timing, TIMING_WITH_CLOCK_50);
  });

  test('polls coarsely when the design has only slow clocks', async (t) => {
    const result = await prepare(t, [{ name: 'slow.v', content: SLOW_CLOCK_ONLY }]);
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.deepEqual(result.plan.timing, TIMING_WITHOUT_CLOCK_50);
  });

  test('plans a batch run of the design itself when it declares no ports at all', async (t) => {
    const files = [fixtureFile('tb_counter8.v'), fixtureFile('keyCouter2Led.v')];
    const result = await prepare(t, files, 'tb_counter8.v');
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.equal(result.plan.mode, 'batch');
    assert.equal(result.plan.runTarget, 'tb_counter8');
  });

  test('writes the project’s files and the timescale file into the session directory', async (t) => {
    const dir = newDir(t);
    await verilogEngine.prepare({ dir, files: [fixtureFile('DE1_SoC.v')], topFile: 'DE1_SoC.v' });
    assert.ok(existsSync(join(dir, 'DE1_SoC.v')));
    assert.ok(existsSync(join(dir, '_hdlboard_ts.v')));
  });

  test('finds a header through the session directory without compiling it as a source', async (t) => {
    const files = [{ name: 'uses_header.v', content: HEADER_USER }, { name: 'defs.vh', content: HEADER }];
    const result = await prepare(t, files, 'uses_header.v');
    assert.ok(result.ok, result.ok ? '' : result.text);
  });

  test('reports a syntax error as an analyze failure naming the file', async (t) => {
    const result = await prepare(t, [{ name: 'bad.v', content: SYNTAX_ERROR }]);
    assert.ok(!result.ok);
    assert.equal(result.stage, 'analyze');
    assert.match(result.text, /bad\.v:\d+/);
  });

  test('reports a top file with two unrelated modules as an elaborate failure listing them', async (t) => {
    const result = await prepare(t, [{ name: 'pair.v', content: TWO_MODULES }]);
    assert.ok(!result.ok);
    assert.equal(result.stage, 'elaborate');
    assert.match(result.text, /first, second/);
  });

  test('reports a top file that was not sent as an analyze failure', async (t) => {
    const result = await prepare(t, [fixtureFile('DE1_SoC.v')], 'missing.v');
    assert.ok(!result.ok);
    assert.equal(result.stage, 'analyze');
    assert.match(result.text, /missing\.v/);
  });

  test('rejects a file name that would collide with a generated file', async (t) => {
    const result = await prepare(t, [{ name: 'hdl_board_tb.v', content: HEADER }]);
    assert.ok(!result.ok);
    assert.match(result.text, /reserved/);
  });

  test('accepts a design that connects only some of the board ports', async (t) => {
    const result = await prepare(t, [{ name: 'narrow.v', content: UNCONNECTED_WIDTH }]);
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.equal(result.plan.mode, 'board');
  });

  test('runs the top file’s own module when another file declares one by the same name', async (t) => {
    // A copied testbench that kept its module name: both files declare dup_tb. Icarus
    // refuses a module declared twice, so neither could run before.
    const original = { name: 'dup_tb.v', content: displayingTestbench('dup_tb', 'from the original') };
    const copy = { name: 'mytest_tb.v', content: displayingTestbench('dup_tb', 'from my copy') };
    for (const files of [[copy, original], [original, copy]]) {
      const result = await verilogEngine.prepare({ dir: newDir(t), files, topFile: 'mytest_tb.v', runTarget: 'dup_tb' });
      assert.ok(result.ok, result.ok ? '' : result.text);
      const output = await batchOutput(result.plan);
      assert.match(output, /from my copy/);
      assert.doesNotMatch(output, /from the original/);
    }
  });

  test('says which file a run uses when another file declares the same module', async (t) => {
    const files = [
      { name: 'dup_tb.v', content: displayingTestbench('dup_tb', 'from the original') },
      { name: 'mytest_tb.v', content: displayingTestbench('dup_tb', 'from my copy') },
    ];
    const result = await verilogEngine.prepare({ dir: newDir(t), files, topFile: 'mytest_tb.v', runTarget: 'dup_tb' });
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.ok(
      result.plan.messages.includes(
        'Note: dup_tb is declared in mytest_tb.v and in dup_tb.v. This run uses the one in mytest_tb.v; ' +
          'give each its own module name to keep them apart.',
      ),
      result.plan.messages.join('\n'),
    );
  });
});

/** A portless testbench that only prints `text`. */
function displayingTestbench(module: string, text: string): string {
  return `module ${module};
  initial begin
    $display("${text}");
    $finish;
  end
endmodule
`;
}

/** Everything a batch run prints. */
async function batchOutput(plan: RunPlan): Promise<string> {
  const lines: string[] = [];
  await verilogEngine.startBatchRun(plan, (line) => lines.push(line), 20_000).done;
  return lines.join('\n');
}
