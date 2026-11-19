// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../tbDetect/types';
import { BOARD_PORTS, checkOf, source, vhdlDesign } from './simOnly.testSupport';

/**
 * The design check on whole files (docs/impl_sim_only_warnings.md), by topic: cases that
 * code reviews found, each checked against Quartus, GHDL or Icarus, and what the check
 * says now.
 */

type Files = [string, string][];
const check = (files: Files, overrides: TestbenchOverrides = EMPTY_OVERRIDES) => checkOf(files.map(([n, c]) => source(n, c)), overrides);
const findingsIn = (files: Files, overrides?: TestbenchOverrides) =>
  check(files, overrides).findings.filter((f) => f.tier !== 'quiet').map((f) => `${f.fileId}:${f.construct}@${f.line}`);
const driversIn = (name: string, content: string) => check([[name, content]]).driverConflicts.map((c) => `${c.signal}@${c.line}`);
const marked = (fileId: string): TestbenchOverrides => ({ ...EMPTY_OVERRIDES, roles: { [fileId]: 'tb' } });

const vlog = (body: string) => `module top(input CLOCK_50, input [9:0] SW, output reg [9:0] LEDR);\n${body}\nendmodule\n`;
const vhdl = (body: string, declarations = '') => vhdlDesign('top', BOARD_PORTS, body).replace('\n\nbegin\n', `\n${declarations}\nbegin\n`);
const P = (body: string) => `process\nbegin\n${body}\nend process;`;
const latchIn = (body: string) => findingsIn([['top.v', vlog(body)]]);

describe('which code is checked', () => {
  const COUNTER = vhdlDesign('counter', 'q : out std_logic', "process begin\n  q <= '1';\n  wait for 1 ms;\nend process;");
  const COUNTER_TB = 'entity counter_tb is\nend entity;\narchitecture sim of counter_tb is\n  signal q : bit;\nbegin\n  dut : entity work.counter port map (q => q);\n  process begin wait for 10 ns; wait; end process;\nend architecture;\n';
  const ENTITY = "library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (LEDR : out std_logic_vector(9 downto 0));\nend entity;\n";
  const ARCHITECTURE = "architecture rtl of top is\nbegin\nprocess begin\n  LEDR(0) <= '1';\n  wait for 1 ms;\nend process;\nend architecture;\n";

  test('a testbench marked by hand still has its DUT checked', () => {
    const files: Files = [['counter.vhd', COUNTER], ['counter_tb.vhd', COUNTER_TB]];
    expect(check(files, marked('counter_tb.vhd')).groups.byFile.get('counter.vhd')).toBe('sim-only');
  });

  test('an architecture in a file marked Treat as testbench is not checked, though its entity is hardware', () => {
    expect(findingsIn([['top.vhd', ENTITY], ['rtl.vhd', ARCHITECTURE]], marked('rtl.vhd'))).toEqual([]);
  });

  test('and that file is TB, not SIM-only', () => {
    expect(check([['top.vhd', ENTITY], ['rtl.vhd', ARCHITECTURE]], marked('rtl.vhd')).groups.byFile.get('rtl.vhd')).toBe('tb');
  });

  test('an architecture marked Treat as testbench pulls no child into the hardware', () => {
    const architecture = "architecture sim of top is\nbegin\nm : entity work.monitor port map (a => '0');\nend architecture;\n";
    const monitor = 'entity monitor is\n  port (a : in bit);\nend entity;\narchitecture sim of monitor is\nbegin\nprocess begin\n  wait for 1 ms;\nend process;\nend architecture;\n';
    const files: Files = [['top.vhd', ENTITY], ['sim.vhd', architecture], ['monitor.vhd', monitor]];
    expect(check(files, marked('sim.vhd')).groups.byFile.get('monitor.vhd')).not.toBe('sim-only');
  });

  test('an always inside translate_off is no second clock', () => {
    const body = 'reg [7:0] c = 0;\n// synthesis translate_off\nalways @(posedge SW[1]) c <= 0;\n// synthesis translate_on\nalways @(posedge CLOCK_50) c <= c + 1;';
    expect(latchIn(body)).toEqual([]);
  });

  test('a write inside translate_off in a clocked block is no second clock', () => {
    const body = 'reg [7:0] c = 0;\nalways @(posedge SW[1]) begin\n// synthesis translate_off\n  c <= 0;\n// synthesis translate_on\nend\nalways @(posedge CLOCK_50) c <= c + 1;';
    expect(latchIn(body)).toEqual([]);
  });

  test('a debug write inside translate_off in a combinational block is no latch', () => {
    const body = 'reg dbg;\nalways @* begin\n  LEDR = SW;\n// synthesis translate_off\n  if (SW[0]) dbg = 1;\n// synthesis translate_on\nend';
    expect(latchIn(body)).toEqual([]);
  });
});

describe('`ifdef SYNTHESIS', () => {
  test('`ifdef SYNTHESIS … `else: the else branch is what synthesis skips', () => {
    expect(latchIn('`ifdef SYNTHESIS\nalways @(posedge CLOCK_50) LEDR <= SW;\n`else\ninitial begin #2 LEDR = 0; end\n`endif')).toEqual([]);
  });

  test('`ifndef SYNTHESIS is still simulation only', () => {
    expect(latchIn('`ifndef SYNTHESIS\ninitial begin #2 LEDR = 0; end\n`endif')).toEqual([]);
  });

  test('the branch synthesis reads is checked', () => {
    const body = '`ifdef SYNTHESIS\nalways @(posedge CLOCK_50) LEDR <= SW;\nalways @(posedge CLOCK_50) LEDR <= ~SW;\n`else\nalways @(posedge CLOCK_50) LEDR <= SW;\n`endif';
    expect(driversIn('top.v', vlog(body))).toEqual(['LEDR@3', 'LEDR@4']);
  });

  const TOP = vlog('`ifdef SYNTHESIS\nchild c (.clk(CLOCK_50), .q(LEDR[0]));\n`endif');

  test('a module that exists only inside it is checked when the hardware uses it', () => {
    const child = '`ifdef SYNTHESIS\nmodule child(input clk, output reg q);\nalways @(posedge clk) q <= 1\'b0;\nalways @(posedge clk) q <= 1\'b1;\nendmodule\n`endif\n';
    expect(check([['top.v', TOP], ['child.v', child]]).driverConflicts.map((c) => `${c.fileId}:${c.signal}`)).toEqual(['child.v:q', 'child.v:q']);
  });

  test('and its file is SIM-only when its finding is, so the badge agrees with the line', () => {
    const child = '`ifdef SYNTHESIS\nmodule child(input clk, output reg q);\nalways @(posedge clk) #1 q <= 1\'b1;\nendmodule\n`endif\n';
    expect(check([['top.v', TOP], ['child.v', child]]).groups.byFile.get('child.v')).toBe('sim-only');
  });

  const COUNTER = 'module counter(output reg q);\ninitial begin #5 q = 1; end\nendmodule\n';

  test('a DUT instance inside `ifndef SYNTHESIS still pairs the testbench with its design', () => {
    const tb = 'module counter_tb;\nwire q;\n`ifndef SYNTHESIS\ncounter dut (.q(q));\n`endif\ninitial begin #10 $finish; end\nendmodule\n';
    expect(check([['counter.v', COUNTER], ['counter_tb.v', tb]]).groups.byFile.get('counter.v')).toBe('sim-only');
  });

  test('an instance only synthesis reads does not pair the testbench: the simulated one does', () => {
    const other = 'module other(output reg q);\ninitial begin #5 q = 1; end\nendmodule\n';
    const tb = 'module counter_tb;\nwire q;\n`ifdef SYNTHESIS\ncounter c (.q(q));\n`else\nother dut (.q(q));\n`endif\ninitial begin #10 $finish; end\nendmodule\n';
    expect(check([['counter.v', COUNTER], ['other.v', other], ['counter_tb.v', tb]]).groups.byFile.get('other.v')).toBe('sim-only');
  });
});

describe('VHDL: wait until a clock edge', () => {
  const waitFindings = (wait: string) => findingsIn([['top.vhd', vhdl(P(`${wait}\nLEDR <= SW;`))]]);

  test.each([
    ['in parentheses', 'wait until (rising_edge(CLOCK_50));'],
    ['with an enable', "wait until rising_edge(CLOCK_50) and SW(0) = '1';"],
    ['with an enable that has an or inside parentheses', "wait until rising_edge(CLOCK_50) and (SW(0) = '1' or SW(1) = '1');"],
    ["written clk'event and clk = '1'", "wait until CLOCK_50'event and CLOCK_50 = '1';"],
  ])('%s is a clocked process', (_label, wait) => {
    expect(waitFindings(wait)).toEqual([]);
  });

  test.each([
    ['on two clocks', 'wait until rising_edge(SW(0)) or rising_edge(SW(1));'],
    ['with a timeout', 'wait until rising_edge(CLOCK_50) for 10 ns;'],
    ['with a level beside the edge', "wait until rising_edge(CLOCK_50) or SW(0) = '1';"],
    ['negated', "wait until not rising_edge(CLOCK_50) and SW(0) = '1';"],
  ])('%s is no clocked process', (_label, wait) => {
    expect(waitFindings(wait)).toEqual(['top.vhd:vhdl-wait-until@11']);
  });

  test('a second wait inside translate_off does not count', () => {
    expect(waitFindings('wait until rising_edge(CLOCK_50);\nLEDR <= SW;\n-- synthesis translate_off\nwait for 1 ns;\n-- synthesis translate_on')).toEqual([]);
  });
});

describe('two clocks on one register', () => {
  const kinds = (files: Files) => check(files).findings.map((f) => f.register?.kind);
  const twoIfs = (first: string, second: string) =>
    `process (SW)\nbegin\nif rising_edge(SW(0)) then\n${first}\nend if;\nif rising_edge(SW(1)) then\n${second}\nend if;\nend process;`;

  test('VHDL: two ifs on two clocks that assign one signal', () => {
    expect(kinds([['top.vhd', vhdl(twoIfs("LEDR(0) <= '1';", "LEDR(0) <= '0';"))]])).toEqual(['two-clocks']);
  });

  test('VHDL: two ifs on two clocks that assign two signals are two registers', () => {
    expect(findingsIn([['top.vhd', vhdl(twoIfs("LEDR(0) <= '1';", "q <= '0';"), 'signal q : std_logic;')]])).toEqual([]);
  });

  test('VHDL: two bits of a vector, each on its own clock, are two registers', () => {
    expect(findingsIn([['top.vhd', vhdl(twoIfs("LEDR(0) <= '1';", "LEDR(1) <= '0';"))]])).toEqual([]);
  });

  const TWO_BLOCKS = 'reg [7:0] c = 0;\nalways @(posedge SW[0]) c <= c + 1;\nalways @(posedge SW[1]) c <= c - 1;';

  test('Verilog: two always blocks on two clocks that assign one register', () => {
    expect(check([['top.v', vlog(TWO_BLOCKS)]]).findings.map((f) => `${f.register?.kind}@${f.line}`)).toEqual(['two-clocks@4']);
  });

  test('a Verilog finding carries its language, so its text shows the Verilog template', () => {
    expect(check([['top.v', vlog(TWO_BLOCKS)]]).findings[0].register?.language).toBe('verilog');
  });

  test('Verilog: two bits of a vector, each on its own clock, are two registers', () => {
    expect(latchIn('always @(posedge SW[0]) LEDR[0] <= 1\'b1;\nalways @(posedge SW[1]) LEDR[1] <= 1\'b0;')).toEqual([]);
  });

  test('Verilog: the same bit on two clocks is still one register with two clocks', () => {
    expect(kinds([['top.v', vlog('always @(posedge SW[0]) LEDR[0] <= 1\'b1;\nalways @(posedge SW[1]) LEDR[0] <= 1\'b0;')]])).toEqual(['two-clocks']);
  });

  test('Verilog q and Q are two registers', () => {
    expect(latchIn('reg q = 0, Q = 0;\nalways @(posedge SW[0]) q <= 1\'b1;\nalways @(posedge SW[1]) Q <= 1\'b0;')).toEqual([]);
  });

  test('SystemVerilog: always_ff is checked as always', () => {
    expect(latchIn('always_ff @(posedge CLOCK_50 or posedge SW[0]) if (SW[1]) LEDR <= 0; else LEDR <= SW;')).toEqual(['top.v:vlog-edge-template@2']);
  });
});

describe('Verilog latches: a value some path keeps without a clock', () => {
  test.each([
    ['an if without else', 2, 'always @(*) if (SW[0]) LEDR <= SW;'],
    ['a case without default', 2, "always @(*) case (SW[1:0])\n  2'b00: LEDR <= 0;\n  2'b01: LEDR <= SW;\nendcase"],
    ['each path assigning another bit', 2, 'always @(*) if (SW[0]) LEDR[0] = SW[1]; else LEDR[1] = SW[2];'],
    ['a loop that may run no time', 3, 'integer i;\nalways @(*) for (i = 0; i < SW[3:0]; i = i + 1) LEDR = SW;'],
  ])('%s', (_label, line, body) => {
    expect(latchIn(body)).toEqual([`top.v:vlog-level-storage@${line}`]);
  });

  test('a value that decides the block, kept without a clock', () => {
    expect(latchIn('reg p = 0;\nalways @(SW[0]) begin if (p && !SW[0]) LEDR <= 0; p <= SW[0]; end')).toEqual(['top.v:vlog-level-storage@3']);
  });

  test.each([
    ['if with else', 'always @(*) if (SW[0]) LEDR <= SW; else LEDR <= 0;'],
    ['a default before the if', 'always @(*) begin LEDR <= 0; if (SW[0]) LEDR <= SW; end'],
    ['a case with default', "always @(*) case (SW[1:0])\n  2'b00: LEDR <= 0;\n  default: LEDR <= SW;\nendcase"],
    ['a one-bit case naming 0 and 1', "always @(*) case (SW[0])\n  1'b0: LEDR = 0;\n  1'b1: LEDR = SW;\nendcase"],
    ['a case naming every value of a declared selector', "wire [1:0] s = SW[1:0];\nalways @(*) case (s)\n  0: LEDR = 0;\n  1, 2: LEDR = SW;\n  2'b11: LEDR = ~SW;\nendcase"],
    ['a loop with constant bounds over every bit', 'integer i;\nalways @(*) for (i = 0; i < 10; i = i + 1) LEDR[i] = SW[i];'],
    ['every bit assigned one by one', 'always @(*) begin LEDR[0] = SW[0]; LEDR[9:1] = SW[9:1]; end'],
  ])('%s assigns on every path: no latch', (_label, body) => {
    expect(latchIn(body)).toEqual([]);
  });

  test.each([
    ['reading another output', 'reg x;\nalways @(*) begin x <= SW[0]; LEDR[0] <= x; end'],
    ['a variable assigned before it decides the block', 'reg x;\nalways @(*) begin x <= SW[0]; if (x) LEDR[0] <= SW[1]; else LEDR[0] <= SW[2]; end'],
    ['a variable read before its unconditional assignment', 'reg x;\nalways @(*) begin LEDR[0] <= x; x <= SW[0]; end'],
  ])('%s is no latch', (_label, body) => {
    expect(latchIn(body)).toEqual([]);
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

  test('a casez wildcard is no ternary: the second driver is found', () => {
    const body = "always @(posedge CLOCK_50) casez (SW[1:0])\n  2'b?1: LEDR <= SW;\n  default: ;\nendcase\nalways @(posedge CLOCK_50) LEDR <= ~SW;";
    expect(driversIn('top.v', vlog(body)).length).toBe(2);
  });

  test('a ternary in a case selector hides no second driver', () => {
    const body = "always @(posedge CLOCK_50) case (SW[0] ? SW[2:1] : SW[4:3])\n  2'b01: LEDR <= SW;\n  default: ;\nendcase\nalways @(posedge CLOCK_50) LEDR <= ~SW;";
    expect(driversIn('top.v', vlog(body)).length).toBe(2);
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
