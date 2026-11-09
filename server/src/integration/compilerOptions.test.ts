// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The project's compiler options on the real tools: GHDL's `-fsynopsys` (turned on by
 * itself for the legacy Synopsys packages, issue #37) and Icarus's `-g` and `-D`.
 */

import assert from 'node:assert/strict';
import { before, describe, test, type TestContext } from 'node:test';
import { DEFAULT_COMPILER_OPTIONS, VERILOG_GENERATIONS, type CompilerOptions } from '../compilerOptions.js';
import { DEFAULT_BOARD_IO } from '../engines/boardPorts.js';
import { ghdlEngine } from '../engines/ghdlEngine.js';
import type { PrepareResult, RunPlan, SimEngine } from '../engines/types.js';
import { verilogEngine } from '../engines/verilogEngine.js';
import { setGhdlExe } from '../ghdl.js';
import { readFixture } from '../testSupport/fixture.js';
import { icarusForTests } from '../testSupport/icarus.js';
import { requireTool } from '../testSupport/requireTool.js';
import { makeTempDir } from '../testSupport/sessionDir.js';
import { setToolPaths } from '../verilog/tools.js';

const ghdl = requireTool('ghdl');
const icarus = icarusForTests();

type Files = Array<{ name: string; content: string }>;

const TB_LIBRARIES = [{ name: 'tb_libraries.vhd', content: readFixture('vhdl', 'tb_libraries.vhd') }];
const SYNOPSYS_OFF: CompilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ghdl: { synopsys: false, relaxed: false } };
const withIverilog = (iverilog: CompilerOptions['iverilog']): CompilerOptions => ({ ...DEFAULT_COMPILER_OPTIONS, iverilog });

/** A board design counting with std_logic_unsigned's "+": the generated testbench is compiled with -fsynopsys too. */
const LEGACY_BOARD_COUNTER = `library ieee;
use ieee.std_logic_1164.all;
use ieee.std_logic_unsigned.all;

entity DE1_SoC is
  port (CLOCK_50 : in std_logic; LEDR : out std_logic_vector(9 downto 0));
end entity;

architecture rtl of DE1_SoC is
  signal count : std_logic_vector(9 downto 0) := (others => '0');
begin
  count <= count + 1 when rising_edge(CLOCK_50);
  LEDR <= count;
end architecture;
`;

const MODERN_BOARD_DESIGN = `library ieee;
use ieee.std_logic_1164.all;

entity DE1_SoC is
  port (SW : in std_logic_vector(9 downto 0); LEDR : out std_logic_vector(9 downto 0));
end entity;

architecture rtl of DE1_SoC is
begin
  LEDR <= SW;
end architecture;
`;

/** Compiles only as SystemVerilog: `typedef enum` is a syntax error to Icarus's default generation. */
const ENUM_TESTBENCH = `module enum_tb;
  typedef enum {IDLE, BUSY} state_t;
  state_t state = BUSY;
  initial begin
    $display("state=%0d", state);
    $finish;
  end
endmodule
`;

const MACRO_TESTBENCH = `module macro_tb;
  initial begin
\`ifdef SIMULATION
    $display("WIDTH=%0d", \`WIDTH);
\`endif
    $finish;
  end
endmodule
`;

/** Prepares a run on `engine`, its first file as the top, in a folder removed after the test. */
const preparerFor =
  (engine: SimEngine) =>
  (t: TestContext, files: Files, compilerOptions?: CompilerOptions): Promise<PrepareResult> => {
    const dir = makeTempDir('hdlboard-compiler-options-');
    t.after(() => dir.cleanup());
    return engine.prepare({ board: DEFAULT_BOARD_IO, dir: dir.path, files, topFile: files[0]?.name, compilerOptions });
  };

const prepareVhdl = preparerFor(ghdlEngine);
const prepareVerilog = preparerFor(verilogEngine);

async function batchOutput(engine: SimEngine, plan: RunPlan): Promise<string> {
  const lines: string[] = [];
  await engine.startBatchRun(plan, { onOutput: (line) => lines.push(line), timeoutMs: 20_000 }).done;
  return lines.join('\n');
}

describe('GHDL -fsynopsys (issue #37)', { skip: ghdl.skip }, () => {
  before(() => {
    if (ghdl.exe) setGhdlExe(ghdl.exe);
  });

  test('compiles the legacy-package test file without any option set', async (t) => {
    const result = await prepareVhdl(t, TB_LIBRARIES);
    assert.ok(result.ok, result.ok ? '' : result.text);
  });

  test('runs it with -fsynopsys as well, to the end of its checks', async (t) => {
    const result = await prepareVhdl(t, TB_LIBRARIES);
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.match(await batchOutput(ghdlEngine, result.plan), /All library tests passed\./);
  });

  test('passes -fsynopsys on to the run step', async (t) => {
    const result = await prepareVhdl(t, TB_LIBRARIES);
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.deepEqual(result.plan.runFlags, ['--std=08', '-fsynopsys']);
  });

  test('warns at each legacy package, where GHDL itself would point', async (t) => {
    const result = await prepareVhdl(t, TB_LIBRARIES);
    assert.ok(result.ok, result.ok ? '' : result.text);
    const places = result.plan.messages.filter((line) => line.includes(':warning: Legacy')).map((line) => line.split(':warning:')[0]);
    assert.deepEqual(places, ['tb_libraries.vhd:14:10', 'tb_libraries.vhd:17:10', 'tb_libraries.vhd:18:10']);
  });

  test('leaves -fsynopsys off for a design without legacy packages', async (t) => {
    const result = await prepareVhdl(t, [{ name: 'DE1_SoC.vhdl', content: MODERN_BOARD_DESIGN }]);
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.deepEqual(result.plan.runFlags, ['--std=08']);
  });

  test('builds a board design that uses a legacy package, generated testbench included', async (t) => {
    const result = await prepareVhdl(t, [{ name: 'DE1_SoC.vhdl', content: LEGACY_BOARD_COUNTER }]);
    assert.ok(result.ok && result.plan.mode === 'board', result.ok ? result.plan.mode : result.text);
  });

  test('turned off in the project file, it leaves GHDL’s own error', async (t) => {
    const result = await prepareVhdl(t, TB_LIBRARIES, SYNOPSYS_OFF);
    assert.ok(!result.ok && /needs the -fsynopsys option/.test(result.text), result.ok ? 'compiled' : result.text);
  });
});

describe('Icarus options', { skip: icarus.skip }, () => {
  before(() => setToolPaths(icarus.tools));

  test('without a generation, SystemVerilog’s typedef enum does not compile', async (t) => {
    const result = await prepareVerilog(t, [{ name: 'enum_tb.v', content: ENUM_TESTBENCH }]);
    assert.equal(result.ok, false);
  });

  test('generation 2012 compiles and runs it', async (t) => {
    const result = await prepareVerilog(t, [{ name: 'enum_tb.v', content: ENUM_TESTBENCH }], withIverilog({ generation: '2012', defines: {} }));
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.match(await batchOutput(verilogEngine, result.plan), /state=1/);
  });

  test('defines reach the source as macros', async (t) => {
    const options = withIverilog({ defines: { SIMULATION: '', WIDTH: '8' } });
    const result = await prepareVerilog(t, [{ name: 'macro_tb.v', content: MACRO_TESTBENCH }], options);
    assert.ok(result.ok, result.ok ? '' : result.text);
    assert.match(await batchOutput(verilogEngine, result.plan), /WIDTH=8/);
  });

  for (const generation of VERILOG_GENERATIONS) {
    test(`the generated board testbench compiles as Verilog ${generation}`, async (t) => {
      const files = [{ name: 'DE1_SoC.v', content: readFixture('verilog', 'DE1_SoC.v') }];
      const result = await prepareVerilog(t, files, withIverilog({ generation, defines: {} }));
      assert.ok(result.ok && result.plan.mode === 'board', result.ok ? result.plan.mode : result.text);
    });
  }
});
