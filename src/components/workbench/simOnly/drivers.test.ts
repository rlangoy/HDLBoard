// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../tbDetect/types';
import { driverConflicts } from './drivers';
import { checkDiagnostics } from './findingDiagnostics';
import { driverSummaries } from './simOnlyReport';
import { BOARD_PORTS, checkOf, source, vhdlDesign, vhdlDesignWith, viewOf } from './simOnly.testSupport';

/** docs/impl_sim_only_warnings.md § 8.1: one signal, one source. */

/** `signal@line` of every warned driver, in file order. */
function warned(files: [string, string][], overrides: TestbenchOverrides = EMPTY_OVERRIDES): string[] {
  const view = viewOf(files.map(([name, content]) => source(name, content)), overrides);
  return driverConflicts(view).map((c) => `${c.signal}@${c.line}`);
}

/** The board design, statements on line 9 onwards. */
const top = (body: string) => vhdlDesign('top', BOARD_PORTS, body);
const PROCESS_LEDR0 = "process (CLOCK_50)\nbegin\n  if rising_edge(CLOCK_50) then\n    LEDR(0) <= SW(0);\n  end if;\nend process;";

const VHDL_CLASHES: [string, string, string[]][] = [
  ['a concurrent statement and a process on the same bit', `LEDR <= SW;\n${PROCESS_LEDR0}`, ['LEDR@9', 'LEDR@13']],
  ['two concurrent statements', 'LEDR(0) <= SW(0);\nLEDR(0) <= SW(1);', ['LEDR@9', 'LEDR@10']],
  ['two processes', `${PROCESS_LEDR0}\n${PROCESS_LEDR0}`, ['LEDR@12', 'LEDR@18']],
  ['overlapping ranges', 'LEDR(3 downto 0) <= SW(3 downto 0);\nLEDR(5 downto 2) <= SW(5 downto 2);', ['LEDR@9', 'LEDR@10']],
  ['the whole signal and an index known only while running', "LEDR <= SW;\nprocess (SW) begin\n  for i in 0 to 9 loop LEDR(i) <= '0'; end loop;\nend process;", ['LEDR@9', 'LEDR@11']],
  ['a selected assignment and a concurrent one', "with SW(0) select LEDR(1) <= '1' when '1', '0' when others;\nLEDR(1) <= SW(1);", ['LEDR@9', 'LEDR@10']],
];

const VHDL_FINE: [string, string][] = [
  ['different bits', 'LEDR(0) <= SW(0);\nLEDR(1) <= SW(1);'],
  ['ranges side by side', 'LEDR(3 downto 0) <= SW(3 downto 0);\nLEDR(9 downto 4) <= SW(9 downto 4);'],
  ['one process assigning a signal twice', "process (SW) begin\n  LEDR(0) <= '0';\n  if SW(0) = '1' then LEDR(0) <= '1'; end if;\nend process;"],
  ['a comparison with <=', "process (SW) begin\n  if unsigned(SW) <= 3 then LEDR(0) <= '1'; else LEDR(0) <= '0'; end if;\nend process;"],
  ['a tri-state bus', "LEDR(0) <= SW(1) when SW(0) = '1' else 'Z';\nLEDR(0) <= SW(2) when SW(0) = '0' else 'Z';"],
  ['if-generate alternatives', "g1 : if true generate\n  LEDR(0) <= SW(0);\nend generate;\ng2 : if false generate\n  LEDR(0) <= SW(1);\nend generate;"],
  ['a driver hidden from synthesis', 'LEDR <= SW;\n-- synthesis translate_off\nLEDR(0) <= SW(1);\n-- synthesis translate_on'],
  ['a variable', "process (SW)\n  variable v : integer;\nbegin\n  v := 1;\n  v := 2;\n  LEDR(0) <= SW(0);\nend process;"],
];

describe('VHDL: clashes', () => {
  test.each(VHDL_CLASHES)('%s', (_label, body, expected) => {
    expect(warned([['top.vhd', top(body)]])).toEqual(expected);
  });
});

describe('VHDL: one driver each', () => {
  test.each(VHDL_FINE)('%s', (_label, body) => {
    expect(warned([['top.vhd', top(body)]])).toEqual([]);
  });
});

test('a declared signal is checked like a port', () => {
  const design = vhdlDesignWith('signal s : std_logic;', top("s <= SW(0);\ns <= SW(1);\nLEDR(0) <= s;"));
  expect(warned([['top.vhd', design]])).toEqual(['s@9', 's@10']);
});

test('two architectures of one entity are alternatives, never each other\'s drivers', () => {
  const second = 'architecture other of top is\nbegin\n  LEDR <= not SW;\nend architecture;\n';
  expect(warned([['top.vhd', top('LEDR <= SW;') + second]])).toEqual([]);
});

test('an architecture in another file is checked where it is, with its entity\'s ports (§ 4.1)', () => {
  const entity = `library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (${BOARD_PORTS});\nend entity;\n`;
  const architecture = 'architecture rtl of top is\nbegin\n  LEDR <= SW;\n  LEDR(0) <= SW(1);\nend architecture;\n';
  expect(warned([['top.vhd', entity], ['top_rtl.vhd', architecture]])).toEqual(['LEDR@3', 'LEDR@4']);
});

test('a testbench is not checked', () => {
  const tb = "entity t_tb is\nend entity;\narchitecture sim of t_tb is\n  signal s : bit;\nbegin\n  s <= '1';\n  process begin s <= '0'; wait for 1 ns; wait; end process;\nend architecture;\n";
  expect(warned([['t_tb.vhd', tb]])).toEqual([]);
});

const vlog = (body: string) => `module top(input CLOCK_50, input [9:0] SW, output reg [9:0] LEDR);\n${body}\nendmodule\n`;

const VERILOG_CLASHES: [string, string, string[]][] = [
  ['two always blocks', 'always @(posedge CLOCK_50) LEDR[0] <= SW[0];\nalways @(posedge CLOCK_50) LEDR[0] <= SW[1];', ['LEDR@2', 'LEDR@3']],
  ['two assigns', 'wire y;\nassign y = SW[0];\nassign y = SW[1];\nalways @(posedge CLOCK_50) LEDR[0] <= y;', ['y@3', 'y@4']],
  ['a whole vector and a part select', 'always @(posedge CLOCK_50) LEDR <= SW;\nalways @(posedge CLOCK_50) LEDR[7:4] <= 0;', ['LEDR@2', 'LEDR@3']],
  ['a wire with a value and an assign', 'wire y = SW[0];\nassign y = SW[1];\nalways @(posedge CLOCK_50) LEDR[0] <= y;', ['y@2', 'y@3']],
];

const VERILOG_FINE: [string, string][] = [
  ['an initial value and one always block', 'initial LEDR = 0;\nalways @(posedge CLOCK_50) LEDR <= SW;'],
  ['different bits', 'always @(posedge CLOCK_50) LEDR[0] <= SW[0];\nalways @(posedge CLOCK_50) LEDR[1] <= SW[1];'],
  ['one block assigning twice', 'always @(*) begin\n  LEDR = 0;\n  if (SW[0]) LEDR = SW;\nend'],
  ['a loop variable in two blocks', 'integer i;\nalways @(*) for (i = 0; i < 5; i = i + 1) LEDR[i] = SW[i];\nalways @(*) for (i = 5; i < 10; i = i + 1) LEDR[i] = 0;'],
  ['a comparison with <=', 'always @(posedge CLOCK_50) if (SW <= 10\'d3) LEDR <= 1; else LEDR <= 0;'],
  ['a tri-state bus', "wire y;\nassign y = SW[0] ? SW[1] : 1'bz;\nassign y = SW[0] ? 1'bz : SW[2];\nalways @(posedge CLOCK_50) LEDR[0] <= y;"],
  ['a case statement', "always @(*) case (SW[1:0])\n  2'd0: LEDR = 1;\n  default: LEDR = 0;\nendcase"],
];

describe('Verilog: clashes', () => {
  test.each(VERILOG_CLASHES)('%s', (_label, body, expected) => {
    expect(warned([['top.v', vlog(body)]])).toEqual(expected);
  });
});

describe('Verilog: one driver each', () => {
  test.each(VERILOG_FINE)('%s', (_label, body) => {
    expect(warned([['top.v', vlog(body)]])).toEqual([]);
  });
});

describe('in the design check', () => {
  const files = [source('top.vhd', top(`LEDR <= SW;\n${PROCESS_LEDR0}`))];
  const live = (mode: 'synthesis' | 'simulation', overrides: TestbenchOverrides = EMPTY_OVERRIDES) =>
    checkDiagnostics(checkOf(files, overrides, mode), { analysis: viewOf(files, overrides).raw, overrides, files: files.map((f) => ({ id: f.id, content: f.content })) });

  test('each driver gets a warning naming the others', () => {
    expect(live('synthesis').map((d) => [d.line, d.advice?.headline])).toEqual([
      [9, '`LEDR` has more than one driver.'],
      [13, '`LEDR` has more than one driver.'],
    ]);
  });

  test('the warning says where the other driver is', () => {
    expect(live('synthesis')[0].message).toMatch(/^`LEDR` is also driven on line 13\./);
  });

  test('Simulation only checks nothing', () => {
    expect(live('simulation')).toEqual([]);
  });

  test('a Simulation model gets no warning', () => {
    expect(live('synthesis', { ...EMPTY_OVERRIDES, simModels: { 'top.vhd': true } })).toEqual([]);
  });

  test('the label stays RTL', () => {
    expect(checkOf(files).groups.byFile.get('top.vhd')).toBe('rtl');
  });

  test('the console has one line for the signal, linked to its first driver', () => {
    expect(driverSummaries(checkOf(files), EMPTY_OVERRIDES, [{ id: 'top.vhd', name: 'top.vhd' }])).toEqual([
      { text: "top.vhd: LEDR has more than one driver (lines 9, 13); the board can't build that.", fileId: 'top.vhd', line: 9 },
    ]);
  });
});
