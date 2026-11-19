// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../tbDetect/types';
import { BOARD_PORTS, checkOf, source, vhdlDesign } from './simOnly.testSupport';
import { registerText } from './simOnlyText';

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
    ['a constant loop that runs no time', 3, 'integer i;\nalways @(*) for (i = 0; i < 0; i = i + 1) LEDR = SW;'],
  ])('%s', (_label, line, body) => {
    expect(latchIn(body)).toEqual([`top.v:vlog-level-storage@${line}`]);
  });

  test.each([
    ['bounded by a signal', 'integer i;\nalways @(*) for (i = 0; i < SW[3:0]; i = i + 1) LEDR = SW;'],
    ['bounded by $clog2', 'localparam L = $clog2(10);\ninteger i;\nalways @* for (i = 0; i < (1 << L); i = i + 1) LEDR[i] = SW[i];'],
    ['indexed through a function', 'integer i;\nfunction integer rev(input integer k); rev = 9 - k; endfunction\nalways @* for (i = 0; i < 10; i = i + 1) LEDR[rev(i)] = SW[i];'],
  ])('a loop the check cannot run, %s, is unsure: no latch warning', (_label, body) => {
    expect(latchIn(body)).toEqual([]);
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

describe('a reset tested at the level of its edge, and the two edges of one clock', () => {
  test.each([
    ['negedge tested high', 'always @(posedge CLOCK_50 or negedge SW[0]) if (SW[0]) LEDR <= 0; else LEDR <= SW;'],
    ['posedge tested low', "always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0] == 1'b0) LEDR <= 0; else LEDR <= SW;"],
  ])('Verilog: a reset %s is no register template', (_label, body) => {
    expect(check([['top.v', vlog(body)]]).findings.map((f) => f.register?.kind)).toEqual(['reset-polarity']);
  });

  test.each([
    ['negedge with !', 'always @(posedge CLOCK_50 or negedge SW[0]) if (!SW[0]) LEDR <= 0; else LEDR <= SW;'],
    ['negedge with == 0', "always @(posedge CLOCK_50 or negedge SW[0]) if (SW[0] == 1'b0) LEDR <= 0; else LEDR <= SW;"],
    ['posedge tested high', 'always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= 0; else LEDR <= SW;'],
  ])('Verilog: a reset %s is the template', (_label, body) => {
    expect(latchIn(body)).toEqual([]);
  });

  test('VHDL: two ifs on the rising and the falling edge of one clock assign one signal', () => {
    const body = "process (CLOCK_50)\nbegin\nif rising_edge(CLOCK_50) then\nLEDR(0) <= '1';\nend if;\nif falling_edge(CLOCK_50) then\nLEDR(0) <= '0';\nend if;\nend process;";
    expect(check([['top.vhd', vhdl(body)]]).findings.map((f) => f.register?.kind)).toEqual(['both-edges']);
  });

  test('Verilog: two blocks on the two edges of one clock assign one register', () => {
    const body = "always @(posedge CLOCK_50) LEDR[0] <= 1'b1;\nalways @(negedge CLOCK_50) LEDR[0] <= 1'b0;";
    expect(check([['top.v', vlog(body)]]).findings.map((f) => f.register?.kind)).toEqual(['both-edges']);
  });
});

describe('VHDL: more wait until shapes', () => {
  const waitFindings = (wait: string) => findingsIn([['top.vhd', vhdl(P(`${wait}\nLEDR <= SW;`))]]);

  test("VHDL: wait until clk'event alone is no clocked process", () => {
    expect(waitFindings("wait until CLOCK_50'event;")).toEqual(['top.vhd:vhdl-wait-until@11']);
  });

  test('VHDL: an edge inside a parenthesized and is still the one clock', () => {
    expect(waitFindings("wait until (rising_edge(CLOCK_50) and SW(0) = '1') and SW(1) = '1';")).toEqual([]);
  });
});

describe('Verilog latches bit by bit', () => {
  test.each([
    ['a write to a bit known only while running', 2, 'always @* LEDR[SW[3:0]] = SW[9];'],
    ['a conditional write to a concatenation', 2, 'always @* if (SW[0]) {LEDR[3:2], LEDR[1:0]} = SW[3:0];'],
    ['a case whose labels do not fit a one-bit selector', 2, "always @* case (SW[0])\n  2'd0: LEDR = 0;\n  2'd2: LEDR = SW;\nendcase"],
  ])('Verilog latch: %s', (_label, line, body) => {
    expect(latchIn(body)).toEqual([`top.v:vlog-level-storage@${line}`]);
  });

  test('Verilog: the reset branch reads every assignment to its semicolon', () => {
    const body = "reg [3:0] q = 0;\nalways @(posedge CLOCK_50 or posedge SW[0])\n  if (SW[0]) begin q[0] <= 0; q[3:1] <= q[3:1] - 1'b1; end\n  else q <= SW[3:0];";
    expect(check([['top.v', vlog(body)]]).findings.map((f) => f.register?.kind)).toEqual(['two-clocks']);
  });

  test('Verilog: a full-width default covers a later write to one bit', () => {
    expect(latchIn('reg [3:0] q;\nalways @* begin q[3:0] = SW[3:0]; if (SW[4]) q[0] = SW[5]; end')).toEqual([]);
  });
});

describe('tri-state drivers', () => {
  test('a Z on one bit hides no second driver of another bit', () => {
    const body = "always @(posedge CLOCK_50) begin LEDR[0] <= 1'bz; LEDR[1] <= SW[1]; end\nalways @(posedge CLOCK_50) LEDR[1] <= SW[2];";
    expect(driversIn('top.v', vlog(body))).toEqual(['LEDR@2', 'LEDR@3']);
  });

  test('a bus that drives a value or Z on the same bits is still no conflict', () => {
    const body = "assign LEDR[0] = SW[0] ? SW[1] : 1'bz;\nassign LEDR[0] = SW[2] ? SW[3] : 1'bz;";
    expect(driversIn('top.v', vlog(body).replace('output reg [9:0] LEDR', 'output [9:0] LEDR'))).toEqual([]);
  });

  test("a 'Z' inside a concatenated value is a bus on its own bits only", () => {
    const body = "always @(posedge CLOCK_50) LEDR[1:0] <= {1'bz, SW[0]};\nalways @(posedge CLOCK_50) LEDR[0] <= SW[1];";
    expect(driversIn('top.v', vlog(body))).toEqual(['LEDR@2', 'LEDR@3']);
  });

  test('each target of a concatenation is a driver of its own', () => {
    const body = "always @(posedge CLOCK_50) {LEDR[1], LEDR[0]} <= SW[1:0];\nalways @(posedge CLOCK_50) LEDR[0] <= SW[2];";
    expect(driversIn('top.v', vlog(body))).toEqual(['LEDR@2', 'LEDR@3']);
  });

  test("a concatenation target with 'Z' on one item drives the other", () => {
    const body = "always @(posedge CLOCK_50) {LEDR[1], LEDR[0]} <= {1'bz, SW[0]};\nalways @(posedge CLOCK_50) LEDR[1] <= SW[1];";
    expect(driversIn('top.v', vlog(body))).toEqual([]);
  });
});

describe('the text says the language', () => {
  /** The register problem of the file's first finding: a test that finds none fails here. */
  const firstRegister = (body: string) => {
    const register = check([['top.v', vlog(body)]]).findings[0]?.register;
    if (!register) throw new Error('no register finding');
    return register;
  };

  test('Verilog both edges: the fix names posedge and negedge, not rising_edge', () => {
    const register = firstRegister("always @(posedge CLOCK_50) LEDR[0] <= 1'b1;\nalways @(negedge CLOCK_50) LEDR[0] <= 1'b0;");
    expect(registerText(register).explanation).toMatch(/`posedge` or `negedge`/);
  });

  test('a reset polarity finding keeps the signal in clocks and its edge apart', () => {
    const register = firstRegister('always @(posedge CLOCK_50 or negedge SW[0]) if (SW[0]) LEDR <= 0; else LEDR <= SW;');
    const says = registerText(register).explanation.includes('`negedge SW[0]` needs `if (!SW[0])`');
    expect([register.clocks, register.resetEdge, says]).toEqual([['SW[0]'], 'falling', true]);
  });
});

describe('Verilog loops with index arithmetic', () => {
  test.each([
    ['a reversed index', 'integer i;\nalways @* for (i = 0; i < 10; i = i + 1) LEDR[9 - i] = SW[i];'],
    ['an index plus one, with bit 0 set apart', "integer i;\nalways @* begin LEDR[0] = 1'b0; for (i = 0; i < 9; i = i + 1) LEDR[i + 1] = SW[i]; end"],
    ['a step of two', 'integer i;\nalways @* for (i = 0; i < 10; i = i + 2) begin LEDR[i] = SW[i]; LEDR[i + 1] = SW[i + 1]; end'],
    ['an indexed part-select', 'integer i;\nalways @* for (i = 0; i < 2; i = i + 1) LEDR[5*i +: 5] = SW[5*i +: 5];'],
  ])('%s that covers every bit is no latch', (_label, body) => {
    expect(latchIn(body)).toEqual([]);
  });

  test('a loop beside a bit that one path leaves unassigned is a latch', () => {
    const body = "integer i;\nalways @* begin if (SW[9]) LEDR[0] = 1'b0; for (i = 0; i < 9; i = i + 1) LEDR[i + 1] = SW[i]; end";
    expect(latchIn(body)).toEqual(['top.v:vlog-level-storage@3']);
  });
});

describe('Verilog: every reset of the chain', () => {
  test('a set tested at the other level than its edge is found too', () => {
    const body = 'always @(posedge CLOCK_50 or negedge SW[0] or posedge SW[1])\n  if (!SW[0]) LEDR <= 0;\n  else if (!SW[1]) LEDR <= 10\'h3FF;\n  else LEDR <= SW;';
    expect(check([['top.v', vlog(body)]]).findings.map((f) => f.register?.kind)).toEqual(['reset-polarity']);
  });

  test('a reset and a set, both at the level of their edges, are the template', () => {
    expect(latchIn('always @(posedge CLOCK_50 or negedge SW[0] or posedge SW[1])\n  if (!SW[0]) LEDR <= 0;\n  else if (SW[1]) LEDR <= 10\'h3FF;\n  else LEDR <= SW;')).toEqual([]);
  });
});

describe("VHDL: an if on clk'event", () => {
  const processWith = (condition: string) => `process (CLOCK_50)\nbegin\nif ${condition} then\nLEDR <= SW;\nend if;\nend process;`;

  test("clk'event alone takes both edges", () => {
    expect(check([['top.vhd', vhdl(processWith("CLOCK_50'event"))]]).findings.map((f) => f.register?.kind)).toEqual(['both-edges']);
  });

  test("clk'event and clk = '1' is the template", () => {
    expect(findingsIn([['top.vhd', vhdl(processWith("CLOCK_50'event and CLOCK_50 = '1'"))]])).toEqual([]);
  });
});

describe('Verilog: the clocked branch after the resets', () => {
  test('an enable that also reads the reset is no second clock', () => {
    const body = 'reg [3:0] c = 0;\nalways @(posedge CLOCK_50 or negedge SW[0])\n  if (!SW[0]) c <= 0;\n  else if (SW[0] && SW[1]) c <= c + 1;';
    expect(latchIn(body)).toEqual([]);
  });
});

describe('Verilog: constants the check can work out', () => {
  test.each([
    ['a localparam bound', 'localparam N = 10;\ninteger i;\nalways @* for (i = 0; i < N; i = i + 1) LEDR[i] = SW[i];'],
    ['a parameter expression and a sized number', "parameter W = 5;\ninteger i;\nalways @* for (i = 0; i < 2 * W; i = i + 4'd1) LEDR[i] = SW[i];"],
    ['a declared range of parameters', "localparam N = 4;\nreg [N-1:0] q;\nalways @* begin q[N-1:0] = SW[3:0]; if (SW[4]) q[0] = SW[5]; end"],
  ])('%s: no latch', (_label, body) => {
    expect(latchIn(body)).toEqual([]);
  });

  test('a module parameter list in #( … ) counts too', () => {
    const top = 'module top #(parameter N = 10) (input CLOCK_50, input [9:0] SW, output reg [9:0] LEDR);\ninteger i;\nalways @* for (i = 0; i < N; i = i + 1) LEDR[i] = SW[i];\nendmodule\n';
    expect(findingsIn([['top.v', top]])).toEqual([]);
  });
});

describe('Verilog case items', () => {
  test('a default without its colon is still the default', () => {
    expect(latchIn("always @* case (SW[1:0])\n  2'b00: LEDR = 0;\n  default LEDR = SW;\nendcase")).toEqual([]);
  });
});

describe('Verilog: loops the check follows', () => {
  test('a loop of more than 256 runs over a wide vector is no latch', () => {
    expect(latchIn('reg [511:0] m;\ninteger i;\nalways @* for (i = 0; i < 512; i = i + 1) m[i] = SW[0];')).toEqual([]);
  });

  test('three nested loops of 200 runs are not followed, and the check stays quick', () => {
    const body = 'reg [7:0] m;\ninteger i, j, k;\nalways @* for (i = 0; i < 200; i = i + 1) for (j = 0; j < 200; j = j + 1) for (k = 0; k < 200; k = k + 1) m[0] = SW[0];';
    const started = performance.now();
    latchIn(body);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('Verilog: what a reset branch may do', () => {
  const kindOf = (body: string) => check([['top.v', vlog(body)]]).findings.map((f) => `${f.register?.kind}:${f.register?.registers.join(',')}`);

  test('an edge that no reset tests, beside the clock, is a second clock', () => {
    expect(kindOf("reg [3:0] q = 0;\nalways @(posedge CLOCK_50 or posedge SW[0] or posedge SW[1]) if (SW[0]) q <= 0; else q <= q + 1'b1;")).toEqual(['two-clocks:q']);
  });

  test('a reset that loads a signal is an asynchronous load', () => {
    expect(kindOf('always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= SW; else LEDR <= ~SW;')).toEqual(['async-load:LEDR']);
  });

  test.each([
    ['a replication', "localparam W = 10;\nalways @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= {W{1'b0}}; else LEDR <= SW;"],
    ['a parameter', "localparam [9:0] INIT = 10'h2A5;\nalways @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= INIT; else LEDR <= SW;"],
    ['a fill literal', "always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= '1; else LEDR <= SW;"],
    ['a concatenation of numbers', "always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= {5'd0, 5'h1F}; else LEDR <= SW;"],
  ])('a reset to %s is a constant', (_label, body) => {
    expect(latchIn(body)).toEqual([]);
  });
});

describe('Verilog: bits and labels from declarations', () => {
  test('a case on parameter labels that names every state is complete', () => {
    const body = "localparam A = 2'd0, B = 2'd1, C = 2'd2, D = 2'd3;\nreg [1:0] s = A;\nalways @* case (s)\n  A: LEDR = 0;\n  B: LEDR = SW;\n  C: LEDR = ~SW;\n  D: LEDR = 10'h3FF;\nendcase";
    expect(latchIn(body)).toEqual([]);
  });

  test('a case on parameter labels that leaves a state out keeps the value: a latch', () => {
    const body = "localparam A = 2'd0, B = 2'd1, C = 2'd2;\nreg [1:0] s = A;\nalways @* case (s)\n  A: LEDR = 0;\n  B: LEDR = SW;\n  C: LEDR = ~SW;\nendcase";
    expect(latchIn(body)).toEqual(['top.v:vlog-level-storage@4']);
  });

  test('a carry chain over an array of bits reads other bits, not its own', () => {
    const body = "reg c [9:-1];\ninteger j;\nalways @* begin\n  c[-1] = 1'b1;\n  for (j = 0; j < 10; j = j + 1) c[j] = c[j-1] & SW[j];\n  for (j = 0; j < 10; j = j + 1) LEDR[j] = c[j];\nend";
    expect(latchIn(body)).toEqual([]);
  });

  test('a bit that reads itself keeps its value: a latch', () => {
    expect(latchIn("reg [1:0] x;\nalways @* begin x[1] = SW[1]; x[0] <= x[0] ^ SW[0]; end")).toEqual(['top.v:vlog-level-storage@3']);
  });
});

describe('Verilog: register shapes that build from latches are quiet', () => {
  const quietKinds = (body: string) => {
    const result = check([['top.v', vlog(body)]]);
    return { kinds: result.findings.map((f) => `${f.register?.kind}:${f.tier}`), group: result.groups.byFile.get('top.v') };
  };

  test.each([
    ['a nonblocking load', 'always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= SW; else LEDR <= ~SW;'],
    ['a blocking load', 'always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR = SW; else LEDR = ~SW;'],
    ['a load of a concatenation', 'always @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) {LEDR[9:5], LEDR[4:0]} <= SW; else LEDR <= ~SW;'],
  ])('an asynchronous load (%s) is noted, and the design stays RTL', (_label, body) => {
    expect(quietKinds(body)).toEqual({ kinds: ['async-load:quiet'], group: 'rtl' });
  });

  test('an asynchronous reset and set of one register is noted, and the design stays RTL', () => {
    const body = "always @(posedge CLOCK_50 or posedge SW[0] or posedge SW[1]) if (SW[0]) LEDR <= 0; else if (SW[1]) LEDR <= 10'h3FF; else LEDR <= SW;";
    expect(quietKinds(body)).toEqual({ kinds: ['set-and-reset:quiet'], group: 'rtl' });
  });

  test.each([
    ['a parameter replication', "parameter [9:0] RESET_VALUE = {10{1'b0}};\nalways @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= RESET_VALUE; else LEDR <= SW;"],
    ['a system function of a parameter', "localparam N = 10;\nalways @(posedge CLOCK_50 or posedge SW[0]) if (SW[0]) LEDR <= $clog2(N); else LEDR <= SW;"],
  ])('a reset to %s is a constant: no note', (_label, body) => {
    expect(quietKinds(body).kinds).toEqual([]);
  });
});

describe('Verilog: unsure is per bit', () => {
  test('a loop the check cannot run writes q[1]; q[0], kept on one path, is still a latch', () => {
    const body = "integer i;\nalways @* begin\n  if (SW[9]) LEDR[0] = SW[0];\n  for (i = 0; i < SW[3:0]; i = i + 1) LEDR[1] = SW[1];\n  LEDR[9:2] = SW[9:2];\nend";
    expect(latchIn(body)).toEqual(['top.v:vlog-level-storage@3']);
  });
});

describe('Verilog: case labels outside the selector', () => {
  test('a negative label names no value of the selector: the case is not complete', () => {
    const body = "localparam NEG = -1;\nalways @* case (SW[0])\n  NEG: LEDR = 0;\n  0: LEDR = SW;\nendcase";
    expect(latchIn(body)).toEqual(['top.v:vlog-level-storage@3']);
  });
});

describe('Verilog: clocked blocks that assign with =', () => {
  test('two blocks on two clocks that write one register with = are two clocks', () => {
    const body = "always @(posedge SW[0]) LEDR[0] = 1'b1;\nalways @(posedge SW[1]) LEDR[0] = 1'b0;";
    expect(check([['top.v', vlog(body)]]).findings.map((f) => f.register?.kind)).toEqual(['two-clocks']);
  });

  test('a loop variable in two clocked blocks is no register shared by them', () => {
    const body = "integer i;\nalways @(posedge SW[0]) for (i = 0; i < 5; i = i + 1) LEDR[i] <= SW[i];\nalways @(posedge SW[1]) for (i = 5; i < 10; i = i + 1) LEDR[i] <= SW[i];";
    expect(latchIn(body)).toEqual([]);
  });
});

describe('VHDL: register shapes that build from latches are quiet', () => {
  const quiet = (body: string, declarations = '') => {
    const result = check([['top.vhd', vhdl(body, declarations)]]);
    return { kinds: result.findings.map((f) => `${f.register?.kind}:${f.tier}`), group: result.groups.byFile.get('top.vhd') };
  };
  const registerWith = (reset: string) => `process (CLOCK_50, SW)\nbegin\n${reset}\nelsif rising_edge(CLOCK_50) then\nLEDR <= SW;\nend if;\nend process;`;

  test('a reset that loads a signal is an asynchronous load, and the design stays RTL', () => {
    expect(quiet(registerWith("if SW(0) = '1' then\nLEDR <= not SW;"))).toEqual({ kinds: ['async-load:quiet'], group: 'rtl' });
  });

  test('an asynchronous reset and set of one signal is noted, and the design stays RTL', () => {
    const reset = "if SW(0) = '1' then\nLEDR <= (others => '0');\nelsif SW(1) = '1' then\nLEDR <= (others => '1');";
    expect(quiet(registerWith(reset))).toEqual({ kinds: ['set-and-reset:quiet'], group: 'rtl' });
  });

  test.each([
    ['an aggregate', "if SW(0) = '1' then\nLEDR <= (others => '0');"],
    ['a constant', "if SW(0) = '1' then\nLEDR <= INIT;"],
    ['a conversion of an attribute', "if SW(0) = '1' then\nLEDR <= std_logic_vector(to_unsigned(0, LEDR'length));"],
  ])('a reset to %s is no note', (_label, reset) => {
    expect(quiet(registerWith(reset), 'constant INIT : std_logic_vector(9 downto 0) := (others => \'1\');').kinds).toEqual([]);
  });
});

describe('a branch that counts is a second clock before any quiet note', () => {
  test('Verilog: two level branches, one that counts, are two clocks, not a set and reset', () => {
    const body = "reg [3:0] q = 0;\nalways @(posedge CLOCK_50 or posedge SW[0] or posedge SW[1])\n  if (SW[0]) q <= q + 1'b1;\n  else if (SW[1]) q <= 0;\n  else q <= q - 1'b1;";
    const result = check([['top.v', vlog(body)]]);
    expect([result.findings.map((f) => `${f.register?.kind}:${f.tier}`), result.groups.byFile.get('top.v')]).toEqual([['two-clocks:never'], 'sim-only']);
  });

  test('VHDL: a reset branch that counts is a second clock', () => {
    const body = "process (CLOCK_50, SW)\nbegin\nif SW(0) = '1' then\nc <= c + 1;\nelsif rising_edge(CLOCK_50) then\nc <= c - 1;\nend if;\nend process;";
    const result = check([['top.vhd', vhdl(body, 'signal c : integer range 0 to 15 := 0;')]]);
    expect([result.findings.map((f) => f.register?.kind), result.groups.byFile.get('top.vhd')]).toEqual([['two-clocks'], 'sim-only']);
  });

  test('Verilog: a concatenation in one clocked block and its item in another are two clocks', () => {
    const body = "reg [1:0] hi = 0, lo = 0;\nalways @(posedge SW[0]) {hi, lo} <= SW[3:0];\nalways @(posedge SW[1]) lo <= SW[5:4];";
    expect(check([['top.v', vlog(body)]]).findings.map((f) => f.register?.kind)).toEqual(['two-clocks']);
  });
});

describe('VHDL: an architecture in another file than its entity', () => {
  const ENTITY = "library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (clk, reset : in std_logic; data, d : in std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0));\nend entity;\n";
  const ARCHITECTURE = "architecture rtl of top is\nbegin\nprocess (clk, reset)\nbegin\nif reset = '1' then\nq <= data;\nelsif rising_edge(clk) then\nq <= d;\nend if;\nend process;\nend architecture;\n";

  test("reads with its entity's ports: a reset that loads a port is an asynchronous load", () => {
    expect(check([['top.vhd', ENTITY], ['rtl.vhd', ARCHITECTURE]]).findings.map((f) => `${f.fileId}:${f.register?.kind}:${f.tier}`)).toEqual(['rtl.vhd:async-load:quiet']);
  });
});

describe('a reset that loads another register is an asynchronous load, not a second clock', () => {
  test('VHDL: q <= d; d <= (others => 0) in the reset branch', () => {
    const body = "process (CLOCK_50, SW)\nbegin\nif SW(0) = '1' then\nq <= d;\nd <= (others => '0');\nelsif rising_edge(CLOCK_50) then\nd <= SW(3 downto 0);\nq <= d;\nend if;\nend process;";
    const result = check([['top.vhd', vhdl(body, 'signal q, d : std_logic_vector(3 downto 0);')]]);
    expect([result.findings.map((f) => `${f.register?.kind}:${f.tier}`), result.groups.byFile.get('top.vhd')]).toEqual([['async-load:quiet'], 'rtl']);
  });

  test('Verilog: q <= d; d <= 0 in the reset branch', () => {
    const body = "reg [3:0] q = 0, d = 0;\nalways @(posedge CLOCK_50 or posedge SW[0])\n  if (SW[0]) begin q <= d; d <= 0; end\n  else begin d <= SW[3:0]; q <= d; end";
    const result = check([['top.v', vlog(body)]]);
    expect([result.findings.map((f) => `${f.register?.kind}:${f.tier}`), result.groups.byFile.get('top.v')]).toEqual([['async-load:quiet'], 'rtl']);
  });
});

describe('Verilog declarations with initial values', () => {
  test('reg [1:0] a = 0, b = 0; gives b its two bits: a part-select default covers a whole write', () => {
    expect(latchIn('reg [1:0] a = 0, b = 0;\nalways @* begin b[1:0] = SW[1:0]; if (SW[2]) b = SW[3:2]; LEDR[1:0] = b; end')).toEqual([]);
  });
});

describe('a reset that reads another bit of its own vector is no counting', () => {
  test('Verilog: q[0] <= q[1] is an asynchronous load', () => {
    const body = "reg [1:0] q = 0;\nalways @(posedge CLOCK_50 or posedge SW[0])\n  if (SW[0]) q[0] <= q[1];\n  else q <= SW[1:0];";
    expect(check([['top.v', vlog(body)]]).findings.map((f) => `${f.register?.kind}:${f.tier}`)).toEqual(['async-load:quiet']);
  });

  test('VHDL: q(0) <= q(1) is an asynchronous load', () => {
    const body = "process (CLOCK_50, SW)\nbegin\nif SW(0) = '1' then\nq(0) <= q(1);\nelsif rising_edge(CLOCK_50) then\nq <= SW(1 downto 0);\nend if;\nend process;";
    expect(check([['top.vhd', vhdl(body, 'signal q : std_logic_vector(1 downto 0);')]]).findings.map((f) => `${f.register?.kind}:${f.tier}`)).toEqual(['async-load:quiet']);
  });

  test.each([
    ['Verilog, the same bit', 'v', "reg [1:0] q = 0;\nalways @(posedge CLOCK_50 or posedge SW[0])\n  if (SW[0]) q[0] <= ~q[0];\n  else q <= SW[1:0];"],
    ['VHDL, the same bit', 'vhd', "process (CLOCK_50, SW)\nbegin\nif SW(0) = '1' then\nq(0) <= not q(0);\nelsif rising_edge(CLOCK_50) then\nq <= SW(1 downto 0);\nend if;\nend process;"],
  ])('%s that reads itself is still a second clock', (_label, ext, body) => {
    const file = ext === 'v' ? vlog(body) : vhdl(body, 'signal q : std_logic_vector(1 downto 0);');
    expect(check([[`top.${ext}`, file]]).findings.map((f) => f.register?.kind)).toEqual(['two-clocks']);
  });
});

describe('overlapping selects in a reset branch', () => {
  const kinds = (name: string, file: string) => check([[name, file]]).findings.map((f) => `${f.register?.kind}:${f.tier}`);
  const vhdlReset = (assignment: string) => vhdl(`process (CLOCK_50, SW)\nbegin\nif SW(0) = '1' then\n${assignment}\nelsif rising_edge(CLOCK_50) then\nq <= SW(3 downto 0);\nend if;\nend process;`, 'signal q : unsigned(3 downto 0);');
  const vlogReset = (assignment: string) => vlog(`reg [3:0] q = 0;\nalways @(posedge CLOCK_50 or posedge SW[0])\n  if (SW[0]) ${assignment}\n  else q <= SW[3:0];`);

  test.each([
    ['Verilog', 'top.v', vlogReset("q[3:0] <= q[2:0] + 1'b1;")],
    ['VHDL', 'top.vhd', vhdlReset("q(3 downto 0) <= ('0' & q(2 downto 0)) + 1;")],
  ])('%s: bits that overlap inside an expression feed back: a second clock', (_label, name, file) => {
    expect(kinds(name, file)).toEqual(['two-clocks:never']);
  });

  test.each([
    ['Verilog', 'top.v', vlogReset('q[2:0] <= q[3:1];')],
    ['VHDL', 'top.vhd', vhdlReset('q(2 downto 0) <= q(3 downto 1);')],
  ])('%s: a plain shifted copy has no bit reading itself: an asynchronous load', (_label, name, file) => {
    expect(kinds(name, file)).toEqual(['async-load:quiet']);
  });
});

describe('bitwise operators keep each bit in its place', () => {
  test('a combinational bitwise chain over a shifted select is no latch', () => {
    expect(latchIn('reg [9:0] q;\nalways @* begin q[9:3] <= SW[9:3]; q[2:0] <= ~q[3:1]; LEDR <= q; end')).toEqual([]);
  });

  test('a combinational bitwise read of the same bits keeps the value: a latch', () => {
    expect(latchIn('reg [9:0] q;\nalways @* begin q[9:3] <= SW[9:3]; q[2:0] <= ~q[2:0]; LEDR <= q; end')).toEqual(['top.v:vlog-level-storage@3']);
  });

  test('a reduction mixes the bits: it feeds back', () => {
    expect(latchIn('reg [9:0] q;\nalways @* begin q[9:3] <= SW[9:3]; q[2:0] <= {2\'b0, &q[3:1]}; LEDR <= q; end')).toEqual(['top.v:vlog-level-storage@3']);
  });

  test.each([
    ['Verilog', 'top.v', "reg [3:0] q = 0;\nalways @(posedge CLOCK_50 or posedge SW[0])\n  if (SW[0]) q[2:0] <= ~q[3:1] & SW[2:0];\n  else q <= SW[3:0];"],
    ['VHDL', 'top.vhd', "process (CLOCK_50, SW)\nbegin\nif SW(0) = '1' then\nq(2 downto 0) <= not q(3 downto 1);\nelsif rising_edge(CLOCK_50) then\nq <= SW(3 downto 0);\nend if;\nend process;"],
  ])('%s: a shifted bitwise reset is an asynchronous load, not a second clock', (_label, name, body) => {
    const file = name.endsWith('.v') ? vlog(body) : vhdl(body, 'signal q : std_logic_vector(3 downto 0);');
    expect(check([[name, file]]).findings.map((f) => `${f.register?.kind}:${f.tier}`)).toEqual(['async-load:quiet']);
  });
});
