// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../tbDetect/types';
import { BOARD_PORTS, checkOf, source, vhdlDesign } from './simOnly.testSupport';

/**
 * The code reviews of 2026-11-19 (docs/impl_sim_only_warnings.md): each case reproduces a
 * finding, and says what the check does now.
 */

type Files = [string, string][];
const check = (files: Files, overrides: TestbenchOverrides = EMPTY_OVERRIDES) => checkOf(files.map(([n, c]) => source(n, c)), overrides);
const findingsIn = (files: Files, overrides?: TestbenchOverrides) =>
  check(files, overrides).findings.filter((f) => f.tier !== 'quiet').map((f) => `${f.fileId}:${f.construct}@${f.line}`);
const driversIn = (name: string, content: string) => check([[name, content]]).driverConflicts.map((c) => `${c.signal}@${c.line}`);
const marked = (fileId: string): TestbenchOverrides => ({ ...EMPTY_OVERRIDES, roles: { [fileId]: 'tb' } });

const vlog = (body: string) => `module top(input CLOCK_50, input [9:0] SW, output reg [9:0] LEDR);\n${body}\nendmodule\n`;
const vhdl = (body: string, declarations = '') => vhdlDesign('top', BOARD_PORTS, body).replace('\n\nbegin\n', `\n${declarations}\nbegin\n`);

describe('which code is checked', () => {
  const COUNTER = vhdlDesign('counter', 'q : out std_logic', "process begin\n  q <= '1';\n  wait for 1 ms;\nend process;");
  const COUNTER_TB = 'entity counter_tb is\nend entity;\narchitecture sim of counter_tb is\n  signal q : bit;\nbegin\n  dut : entity work.counter port map (q => q);\n  process begin wait for 10 ns; wait; end process;\nend architecture;\n';

  test('a testbench marked by hand still has its DUT checked', () => {
    const files: Files = [['counter.vhd', COUNTER], ['counter_tb.vhd', COUNTER_TB]];
    expect(check(files, marked('counter_tb.vhd')).groups.byFile.get('counter.vhd')).toBe('sim-only');
  });

  const ENTITY = "library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (LEDR : out std_logic_vector(9 downto 0));\nend entity;\n";
  const ARCHITECTURE = "architecture rtl of top is\nbegin\nprocess begin\n  LEDR(0) <= '1';\n  wait for 1 ms;\nend process;\nend architecture;\n";

  test('an architecture in a file marked Treat as testbench is not checked, though its entity is hardware', () => {
    expect(findingsIn([['top.vhd', ENTITY], ['rtl.vhd', ARCHITECTURE]], marked('rtl.vhd'))).toEqual([]);
  });

  test('and that file is TB, not SIM-only', () => {
    expect(check([['top.vhd', ENTITY], ['rtl.vhd', ARCHITECTURE]], marked('rtl.vhd')).groups.byFile.get('rtl.vhd')).toBe('tb');
  });

  test('`ifdef SYNTHESIS … `else: the else branch is what synthesis skips', () => {
    const design = vlog('`ifdef SYNTHESIS\nalways @(posedge CLOCK_50) LEDR <= SW;\n`else\ninitial begin #2 LEDR = 0; end\n`endif');
    expect(findingsIn([['top.v', design]])).toEqual([]);
  });

  test('`ifndef SYNTHESIS is still simulation only', () => {
    expect(findingsIn([['top.v', vlog('`ifndef SYNTHESIS\ninitial begin #2 LEDR = 0; end\n`endif')]])).toEqual([]);
  });
});

describe('wait until a clock edge', () => {
  const P = (body: string) => `process\nbegin\n${body}\nend process;`;

  test('on two clocks is no clocked process', () => {
    expect(findingsIn([['top.vhd', vhdl(P('wait until rising_edge(SW(0)) or rising_edge(SW(1));\nLEDR <= SW;'))]])).toEqual(['top.vhd:vhdl-wait-until@11']);
  });

  test('a second wait inside translate_off does not count', () => {
    const body = P('wait until rising_edge(CLOCK_50);\nLEDR <= SW;\n-- synthesis translate_off\nwait for 1 ns;\n-- synthesis translate_on');
    expect(findingsIn([['top.vhd', vhdl(body)]])).toEqual([]);
  });
});

describe('registers', () => {
  test('Verilog: reading another output in a combinational block is no latch', () => {
    expect(findingsIn([['top.v', vlog('reg x;\nalways @(*) begin x <= SW[0]; LEDR[0] <= x; end')]])).toEqual([]);
  });

  test('Verilog: a value that decides the block, kept without a clock, is a latch', () => {
    expect(findingsIn([['top.v', vlog('reg p = 0;\nalways @(SW[0]) begin if (p && !SW[0]) LEDR <= 0; p <= SW[0]; end')]])).toEqual(['top.v:vlog-level-storage@3']);
  });

  test('VHDL: two ifs on two clocks that assign one signal', () => {
    const body = "process (SW)\nbegin\nif rising_edge(SW(0)) then\nLEDR(0) <= '1';\nend if;\nif rising_edge(SW(1)) then\nLEDR(0) <= '0';\nend if;\nend process;";
    expect(check([['top.vhd', vhdl(body)]]).findings.map((f) => f.register?.kind)).toEqual(['two-clocks']);
  });

  test('VHDL: two ifs on two clocks that assign two signals are two registers', () => {
    const body = "process (SW)\nbegin\nif rising_edge(SW(0)) then\nLEDR(0) <= '1';\nend if;\nif rising_edge(SW(1)) then\nq <= '0';\nend if;\nend process;";
    expect(findingsIn([['top.vhd', vhdl(body, 'signal q : std_logic;')]])).toEqual([]);
  });

  test('Verilog: two always blocks on two clocks that assign one register', () => {
    const body = 'reg [7:0] c = 0;\nalways @(posedge SW[0]) c <= c + 1;\nalways @(posedge SW[1]) c <= c - 1;';
    expect(check([['top.v', vlog(body)]]).findings.map((f) => `${f.register?.kind}@${f.line}`)).toEqual(['two-clocks@4']);
  });

  test('SystemVerilog: always_ff is checked as always', () => {
    expect(findingsIn([['top.v', vlog('always_ff @(posedge CLOCK_50 or posedge SW[0]) if (SW[1]) LEDR <= 0; else LEDR <= SW;')]])).toEqual(['top.v:vlog-edge-template@2']);
  });

  test('a Verilog finding carries its language, so its text shows the Verilog template', () => {
    const body = 'reg [7:0] c = 0;\nalways @(posedge SW[0]) c <= c + 1;\nalways @(posedge SW[1]) c <= c - 1;';
    expect(check([['top.v', vlog(body)]]).findings[0].register?.language).toBe('verilog');
  });
});

describe('drivers', () => {
  test('a Verilog function with a reg local assigned twice has no second driver', () => {
    const body = 'function [9:0] rev(input [9:0] x);\n  reg [9:0] t; integer i;\n  begin\n    t = 0;\n    for (i = 0; i < 10; i = i + 1) t[i] = x[9 - i];\n    rev = t;\n  end\nendfunction\nalways @(posedge CLOCK_50) LEDR <= rev(SW);';
    expect(driversIn('top.v', vlog(body))).toEqual([]);
  });

  test('a Verilog task output assigned twice has no second driver', () => {
    expect(driversIn('top.v', vlog('task pick(input a, output reg y);\n  begin\n    y = 0;\n    if (a) y = 1;\n  end\nendtask\nalways @(posedge CLOCK_50) LEDR <= SW;'))).toEqual([]);
  });

  test('a comparison after a ternary colon is no assignment', () => {
    const body = 'reg [9:0] q = 0;\nwire cmp;\nalways @(posedge CLOCK_50) q <= SW;\nassign cmp = SW[0] ? 1\'b0 : q <= 10\'d5;\nalways @(posedge CLOCK_50) LEDR <= {9\'d0, cmp};';
    expect(driversIn('top.v', vlog(body))).toEqual([]);
  });
});

describe('the simulator clock', () => {
  const withClock = (body: string, declarations = '') => vhdl(body, declarations).replace('port (LEDR', 'port (CLOCK_500Hz : in std_logic; LEDR');

  test('a comma list in a component declaration is no read', () => {
    const component = 'component blink is\n  port (CLOCK_500Hz, DATA : in bit);\nend component;';
    expect(findingsIn([['top.vhd', withClock("LEDR(0) <= '1';", component)]])).toEqual([]);
  });

  test('a process sensitivity list alone is no read', () => {
    expect(findingsIn([['top.vhd', withClock('process (CLOCK_500Hz, SW)\nbegin\nLEDR <= SW;\nend process;')]])).toEqual([]);
  });
});
