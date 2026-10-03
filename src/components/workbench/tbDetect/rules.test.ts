// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { analyzeFile } from './analyzeProject';
import { RULES } from './rules';
import type { RuleId } from './types';

/** docs/impl_split_screen.md § 5.4: one positive and one negative snippet per rule, and the exclusions. */

const vhdlUnit = (ports: string, decls: string, body: string, name = 'u', context = '') =>
  `${context}\nentity ${name} is${ports}\nend entity;\narchitecture a of ${name} is\n${decls}\nbegin\n${body}\nend architecture;\n`;
const vlogUnit = (header: string, body: string, name = 'u') => `module ${name}${header};\n${body}\nendmodule\n`;

const PORTS_VHDL = ' port (a : in bit; y : out bit);';
const PORTS_VLOG = ' (input a, output y)';

function rulesOf(file: string, content: string): RuleId[] {
  const analysis = analyzeFile({ id: file, name: file, folder: file.endsWith('.v') ? 'verilog' : 'vhdl', content });
  return [...new Set(analysis?.units.flatMap((u) => u.evidence.map((e) => e.ruleId)))];
}

const P = (body: string) => `process begin\n${body}\nend process;`;

const VHDL_CASES: Record<string, [positive: string, negative: string]> = {
  'vhdl-portless': [vhdlUnit('', '', ''), vhdlUnit(PORTS_VHDL, '', '')],
  'vhdl-wait-for': [vhdlUnit(PORTS_VHDL, '', P('wait for 1 ns;')), vhdlUnit(PORTS_VHDL, '', P('-- wait for 1 ns;\nwait until a = \'1\';'))],
  'vhdl-wait-forever': [vhdlUnit(PORTS_VHDL, '', P('wait;')), vhdlUnit(PORTS_VHDL, '', P("wait until a = '1';"))],
  'vhdl-clock-gen': [vhdlUnit(PORTS_VHDL, 'signal c : bit;', 'c <= not c after 5 ns;'), vhdlUnit(PORTS_VHDL, 'signal c : bit;', 'c <= not a after 5 ns;')],
  'vhdl-after': [vhdlUnit(PORTS_VHDL, '', 'y <= a after 1 ns;'), vhdlUnit(PORTS_VHDL, 'signal c : bit;', 'c <= not c after 5 ns;')],
  'vhdl-wait-until': [vhdlUnit(PORTS_VHDL, '', P('wait on a;')), vhdlUnit(PORTS_VHDL, '', P('wait;'))],
  'vhdl-file-io': [vhdlUnit(PORTS_VHDL, '', '', 'u', 'use std.textio.all;'), vhdlUnit(PORTS_VHDL, '', '', 'u', 'use ieee.std_logic_1164.all;')],
  'vhdl-end-sim': [vhdlUnit(PORTS_VHDL, '', P('std.env.finish;')), vhdlUnit(PORTS_VHDL, 'signal stop_now : bit;', P('stop_now <= \'1\';\nwait;'))],
  'vhdl-drives-dut': [vhdlUnit('', '', 'd : entity work.x port map (a => a);'), vhdlUnit(PORTS_VHDL, '', 'd : entity work.x port map (a => a);')],
  'vhdl-assert': [vhdlUnit(PORTS_VHDL, '', 'assert a = \'1\';'), vhdlUnit(PORTS_VHDL, '', '-- assert a = \'1\';')],
  'vhdl-tb-name': [vhdlUnit(PORTS_VHDL, '', '', 'x_testbench'), vhdlUnit(PORTS_VHDL, '', '', 'tbx')],
  'vhdl-framework': [vhdlUnit(PORTS_VHDL, '', '', 'u', 'library vunit_lib;'), vhdlUnit(PORTS_VHDL, '', '', 'u', 'library ieee;')],
  'vhdl-sim-only': [
    vhdlUnit(PORTS_VHDL, '', '-- synthesis translate_off\ny <= a;\n-- synthesis translate_on'),
    vhdlUnit(PORTS_VHDL, '', '-- synthesis translate_off\n-- synthesis translate_on\ny <= a;'),
  ],
  'vhdl-board-ports': [vhdlUnit(' port (SW : in bit);', '', ''), vhdlUnit(' port (SWX : in bit);', '', '')],
};

const I = (body: string) => `initial begin\n${body}\nend`;

const VLOG_CASES: Record<string, [positive: string, negative: string]> = {
  'vlog-portless': [vlogUnit('', ''), vlogUnit(PORTS_VLOG, '')],
  'vlog-delay': [vlogUnit(PORTS_VLOG, I('#(T/2);')), vlogUnit(PORTS_VLOG, 'assign #2 y = a;')],
  'vlog-assign-delay': [vlogUnit(PORTS_VLOG, 'assign #2 y = a;'), vlogUnit(PORTS_VLOG, 'assign y = a;')],
  'vlog-clock-gen': [vlogUnit(PORTS_VLOG, 'reg c; always #5 c = ~c;'), vlogUnit(PORTS_VLOG, 'reg c; always #5 c = ~a;')],
  'vlog-event-wait': [vlogUnit(PORTS_VLOG, I('repeat (2) @(negedge a);')), vlogUnit(PORTS_VLOG, 'always @(posedge a) b <= a;')],
  'vlog-initial': [vlogUnit(PORTS_VLOG, 'initial b = 0;'), vlogUnit(PORTS_VLOG, 'always @* b = a;')],
  'vlog-display': [vlogUnit(PORTS_VLOG, I('$displayh(a);')), vlogUnit(PORTS_VLOG, I('$readmemh("x", m);'))],
  'vlog-end-sim': [vlogUnit(PORTS_VLOG, I('$stop;')), vlogUnit(PORTS_VLOG, I('// $finish;'))],
  'vlog-file-io': [vlogUnit(PORTS_VLOG, I('$dumpvars;')), vlogUnit(PORTS_VLOG, I('$readmemb("x", m);'))],
  'vlog-drives-dut': [vlogUnit('', 'x d (.a(a));'), vlogUnit(PORTS_VLOG, 'x d (.a(a));')],
  'vlog-tb-name': [vlogUnit(PORTS_VLOG, '', 'Test_alu'), vlogUnit(PORTS_VLOG, '', 'alutb')],
  'vlog-sv-verif': [vlogUnit(PORTS_VLOG, 'mailbox m;'), vlogUnit(PORTS_VLOG, 'reg mailbox_full;')],
  'vlog-uvm': [vlogUnit(PORTS_VLOG, 'import uvm_pkg::*;'), vlogUnit(PORTS_VLOG, 'reg my_uvm;')],
  'vlog-sim-only': [vlogUnit(PORTS_VLOG, '`ifndef SYNTHESIS\ninitial b = 0;\n`endif'), vlogUnit(PORTS_VLOG, '`ifdef SYNTHESIS\ninitial b = 0;\n`endif')],
  'vlog-assert': [vlogUnit(PORTS_VLOG, I('assert (a);')), vlogUnit(PORTS_VLOG, I('a_assert = 1;'))],
  'vlog-board-ports': [vlogUnit(' (input [9:0] SW)', ''), vlogUnit(' (input [9:0] sw_in)', '')],
};

describe.each([
  ['VHDL', VHDL_CASES, '.vhd'],
  ['Verilog', VLOG_CASES, '.v'],
] as const)('%s rules', (_lang, cases, ext) => {
  test('every rule has a case', () => {
    const language = ext === '.v' ? 'verilog' : 'vhdl';
    expect(Object.keys(cases).sort()).toEqual(RULES[language].map((r) => r.id).sort());
  });

  test.each(Object.entries(cases))('%s fires on the positive snippet only', (id, [positive, negative]) => {
    expect(rulesOf(`u${ext}`, positive)).toContain(id);
    expect(rulesOf(`u${ext}`, negative)).not.toContain(id);
  });
});

describe('exclusions', () => {
  test('a clock generator\'s delay is not vlog-delay', () => {
    expect(rulesOf('u.v', vlogUnit(PORTS_VLOG, 'reg c; always #5 c = ~c;'))).not.toContain('vlog-delay');
  });

  test('parameter lists and overrides are never delays', () => {
    expect(rulesOf('u.v', 'module m #(parameter W = 1) (input a);\nx #(.W(W)) u1 (.a(a));\nx #4 u2 (.a(a));\nendmodule')).toEqual([]);
  });

  test('assign #2 is vlog-assign-delay, not vlog-delay', () => {
    expect(rulesOf('u.v', vlogUnit(PORTS_VLOG, 'assign #2 y = a;'))).toEqual(['vlog-assign-delay']);
  });

  test('a clock generator\'s after is not vhdl-after', () => {
    expect(rulesOf('u.vhd', vhdlUnit(PORTS_VHDL, 'signal c : bit;', 'c <= not c after 5 ns;'))).toEqual(['vhdl-clock-gen']);
  });

  test('an event control statement in always is not vlog-event-wait', () => {
    expect(rulesOf('u.v', vlogUnit(PORTS_VLOG, 'always begin @(posedge a); b = 1; end'))).not.toContain('vlog-event-wait');
  });
});

describe('rule classes (D23)', () => {
  test.each([
    ['vhdl-file-io', 'weak'],
    ['vhdl-wait-for', 'strong'],
    ['vhdl-sim-only', 'weak'],
    ['vlog-file-io', 'strong'],
    ['vlog-event-wait', 'strong'],
    ['vlog-board-ports', 'veto'],
  ])('%s is %s', (id, strength) => {
    const all = [...RULES.vhdl, ...RULES.verilog];
    expect(all.find((r) => r.id === id)?.strength).toBe(strength);
  });
});
