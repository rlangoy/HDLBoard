// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { CONSTRUCTS } from './catalogue';
import { CONSTRUCT_TEXT } from './simOnlyText';
import { BOARD_PORTS, checkOf, source, vhdlDesign, vhdlDesignWith } from './simOnly.testSupport';
import type { SimOnlyConstructId } from './types';

/** docs/impl_sim_only_warnings.md § 9: one positive and one negative snippet per construct, and § 3.3. */

const constructsIn = (name: string, content: string): SimOnlyConstructId[] => [
  ...new Set(checkOf([source(name, content)]).findings.map((f) => f.construct)),
];

const P = (body: string) => `process\nbegin\n${body}\nend process;`;
const CLOCKED = (body: string) => `process (CLOCK_50)\nbegin\nif rising_edge(CLOCK_50) then\n${body}\nend if;\nend process;`;
const vhdl = (body: string, declarations = '') => {
  const design = vhdlDesign('top', BOARD_PORTS, body);
  return declarations === '' ? design : vhdlDesignWith(declarations, design);
};
const withContext = (context: string, design: string) => design.replace('library ieee;', `library ieee;\n${context}`);

const VHDL_CASES: Record<string, [positive: string, negative: string]> = {
  'vhdl-wait-for': [vhdl(P("LEDR(0) <= '1';\nwait for 1 ms;")), vhdl(P("-- wait for 1 ms;\nwait until rising_edge(CLOCK_50);\nLEDR(0) <= '1';"))],
  'vhdl-wait-forever': [vhdl(P("LEDR(0) <= '1';\nwait;")), vhdl(CLOCKED("LEDR(0) <= '1';"))],
  'vhdl-wait-until': [vhdl(P("wait until SW(0) = '1';\nLEDR(0) <= '1';")), vhdl(P("wait until rising_edge(CLOCK_50);\nLEDR(0) <= SW(0);"))],
  'vhdl-clock-gen': [vhdl('c <= not c after 10 ns;', 'signal c : std_logic := \'0\';'), vhdl('c <= not SW(0);', 'signal c : std_logic;')],
  'vhdl-file-io': [
    withContext('use std.textio.all;', vhdl(P('write(l, 1);\nwriteline(output, l);\nwait;').replace('process\n', 'process\nvariable l : line;\n'))),
    withContext('use std.textio.all;', vhdl("LEDR(0) <= '1';")),
  ],
  'vhdl-end-sim': [vhdl(P('std.env.finish;')), withContext('use std.env.all;', vhdl("LEDR(0) <= '1';"))],
  'vhdl-now': [vhdl(P("if now > 1 ms then LEDR(0) <= '1'; end if;\nwait on SW;")), vhdl("LEDR(0) <= SW(0); -- now")],
  'vhdl-access': [vhdl("LEDR(0) <= '1';", 'type ptr is access integer;'), vhdl("LEDR(0) <= '1';", 'type word is array (0 to 3) of std_logic;')],
  'vhdl-protected': [vhdl("LEDR(0) <= '1';", 'type counter is protected\nprocedure inc;\nend protected;'), vhdl("LEDR(0) <= '1';", 'type counter is range 0 to 9;')],
  'vhdl-random': [vhdl(P('uniform(s1, s2, r);\nwait for 1 ns;')), vhdl("LEDR(0) <= '1'; -- uniform(s1, s2, r)")],
  'vhdl-real-signal': [vhdl("LEDR(0) <= '1';", 'signal level : real;'), vhdl("LEDR(0) <= '1';", 'constant SCALE : real := 2.5;')],
  'vhdl-edge-template': [
    vhdl(P("if falling_edge(SW(1)) then\nLEDR(0) <= '0';\nelsif falling_edge(SW(0)) then\nLEDR(0) <= '1';\nend if;").replace('process\n', 'process (SW)\n')),
    vhdl(P("if SW(1) = '0' then\nLEDR(0) <= '0';\nelsif falling_edge(SW(0)) then\nLEDR(0) <= '1';\nend if;").replace('process\n', 'process (SW)\n')),
  ],
  'vhdl-after': [vhdl("LEDR(0) <= SW(0) after 10 ns;"), vhdl("LEDR(0) <= SW(0);")],
  'vhdl-report': [vhdl(CLOCKED("report \"tick\";")), vhdl(CLOCKED("LEDR(0) <= SW(0); -- report"))],
};

const vlog = (body: string) => `module top(output reg [9:0] LEDR, input [9:0] SW, input CLOCK_50);\n${body}\nendmodule\n`;

const VERILOG_CASES: Record<string, [positive: string, negative: string]> = {
  'vlog-delay': [vlog('initial begin LEDR = 0; #10 LEDR = 1; end'), vlog('always @(posedge CLOCK_50) LEDR <= SW;')],
  'vlog-event-wait': [vlog('always begin @(posedge CLOCK_50); LEDR <= SW; end'), vlog('always @(posedge CLOCK_50) LEDR <= SW;')],
  'vlog-clock-gen': [vlog('reg clk = 0;\nalways #5 clk = ~clk;'), vlog('wire clk = CLOCK_50;')],
  'vlog-file-io': [vlog('initial $dumpfile("x.vcd");'), vlog('initial $readmemh("rom.hex", LEDR);')],
  'vlog-end-sim': [vlog('initial $finish;'), vlog('always @(posedge CLOCK_50) LEDR <= SW; // $finish')],
  'vlog-time': [vlog('always @(posedge CLOCK_50) if ($time > 100) LEDR <= SW;'), vlog('always @(posedge CLOCK_50) LEDR <= SW;')],
  'vlog-random': [vlog('always @(posedge CLOCK_50) LEDR <= $random;'), vlog('always @(posedge CLOCK_50) LEDR <= {LEDR[8:0], LEDR[9] ^ LEDR[6]};')],
  'vlog-verification': [vlog('initial force LEDR = 0;'), vlog('always @(posedge CLOCK_50) LEDR <= SW; // force')],
  'vlog-real': [vlog('real level;\nalways @(posedge CLOCK_50) LEDR <= SW;'), vlog('parameter real SCALE = 2.5;\nalways @(posedge CLOCK_50) LEDR <= SW;')],
  'vlog-edge-template': [
    vlog('always @(posedge CLOCK_50 or posedge SW[1]) if (SW[0]) LEDR <= 0; else LEDR <= SW;'),
    vlog('always @(posedge CLOCK_50 or posedge SW[1]) if (SW[1]) LEDR <= 0; else LEDR <= SW;'),
  ],
  'vlog-level-storage': [vlog('always @(SW[0]) if (SW[0]) LEDR <= LEDR + 1;'), vlog('always @(SW) LEDR <= SW;')],
  'vlog-assign-delay': [vlog('wire [9:0] y;\nassign #5 y = SW;'), vlog('wire [9:0] y;\nassign y = SW;')],
  'vlog-display': [vlog('always @(posedge CLOCK_50) $display("%b", SW);'), vlog('always @(posedge CLOCK_50) LEDR <= SW;')],
  'vlog-clocked-delay': [vlog('always @(posedge CLOCK_50) LEDR <= #1 SW;'), vlog('always @(posedge CLOCK_50) LEDR <= SW;')],
};

describe('every construct is tested and has its text', () => {
  test.each(Object.values(CONSTRUCTS).flat().map((c) => c.id))('%s', (id) => {
    expect(Object.keys({ ...VHDL_CASES, ...VERILOG_CASES })).toContain(id);
  });

  test.each(Object.values(CONSTRUCTS).flat().map((c) => c.id))('%s has a headline and an explanation', (id) => {
    expect([CONSTRUCT_TEXT[id].headline, CONSTRUCT_TEXT[id].explanation].every((t) => t.length > 0)).toBe(true);
  });
});

describe.each([
  ['top.vhd', VHDL_CASES],
  ['top.v', VERILOG_CASES],
])('%s', (name, cases) => {
  test.each(Object.entries(cases))('%s matches its positive', (id, [positive]) => {
    expect(constructsIn(name, positive)).toContain(id);
  });

  test.each(Object.entries(cases))('%s does not match its negative', (id, [, negative]) => {
    expect(constructsIn(name, negative)).not.toContain(id);
  });
});

/** Quartus' true dual-port RAM template: a shared variable of an array type, written from two clocked processes. */
const DUAL_PORT_RAM = vhdl(
  'process (CLOCK_50)\nbegin\nif rising_edge(CLOCK_50) then\nram(0) := SW(0);\nend if;\nend process;\nprocess (CLOCK_50)\nbegin\nif rising_edge(CLOCK_50) then\nLEDR(0) <= ram(1);\nend if;\nend process;',
  "type memory is array (0 to 3) of std_logic;\nshared variable ram : memory;",
);

/** § 3.3: code that looks simulation-only but runs on the FPGA. */
const NOT_SIM_ONLY: [string, string, string][] = [
  ['the dual-port RAM template', 'top.vhd', DUAL_PORT_RAM],
  ['use std.textio.all; alone', 'top.vhd', withContext('use std.textio.all;', vhdl("LEDR(0) <= '1';"))],
  ['wait until rising_edge as the only wait', 'top.vhd', vhdl(P("wait until rising_edge(CLOCK_50);\nLEDR(0) <= SW(0);"))],
  ["wait until clk'event and clk = '1'", 'top.vhd', vhdl(P("wait until CLOCK_50'event and CLOCK_50 = '1';\nLEDR(0) <= SW(0);"))],
  ['signal initial values', 'top.vhd', vhdl('LEDR(3 downto 0) <= c;', "signal c : std_logic_vector(3 downto 0) := (others => '0');")],
  ['real in a constant', 'top.vhd', vhdl("LEDR(0) <= '1';", 'constant N : natural := integer(ceil(log2(real(10))));')],
  ['an initial ROM in Verilog', 'top.v', vlog('reg [9:0] rom [0:3];\ninitial begin rom[0] = 10\'h3ff; rom[1] = 0; end\nalways @(posedge CLOCK_50) LEDR <= rom[SW[1:0]];')],
  ['a clocked always block', 'top.v', vlog('always @(posedge CLOCK_50) begin\n  LEDR <= SW;\nend')],
  ['a <= #1 delay in a clocked block (Quartus drops the delay)', 'top.v', vlog('always @(posedge CLOCK_50 or negedge SW[9])\n  if (~SW[9]) LEDR <= 0;\n  else LEDR <= #1 SW;')],
  ['$time printed by $write (Quartus Warning 10175: ignored)', 'top.v', vlog('always @(posedge CLOCK_50) begin\n  LEDR <= SW;\n  if (SW[0]) $write($time);\nend')],
];

describe('code that runs on the FPGA gets no finding (§ 3.3)', () => {
  test.each(NOT_SIM_ONLY)('%s', (_label, name, content) => {
    expect(checkOf([source(name, content)]).findings.filter((f) => f.tier !== 'quiet')).toEqual([]);
  });
});
