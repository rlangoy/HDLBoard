// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { BLINK, BOARD_PORTS, checkOf, source, vhdlDesign } from './simOnly.testSupport';

/** docs/impl_sim_only_warnings.md § 9, findings.test.ts. */

const findingsOf = (...files: [string, string][]) =>
  checkOf(files.map(([name, content]) => source(name, content))).findings.map((f) => [f.fileId, f.construct, f.line]);

describe('the blink example', () => {
  test('gives two never findings, on the two wait for lines', () => {
    expect(findingsOf(['blink.vhd', BLINK])).toEqual([
      ['blink.vhd', 'vhdl-wait-for', 12],
      ['blink.vhd', 'vhdl-wait-for', 14],
    ]);
  });

  test('gives none inside translate_off', () => {
    const hidden = BLINK.replace('process', '-- synthesis translate_off\nprocess').replace('end process;', 'end process;\n-- synthesis translate_on');
    expect(findingsOf(['blink.vhd', hidden])).toEqual([]);
  });
});

test('gives none inside `ifndef SYNTHESIS', () => {
  const module = 'module top(output reg [9:0] LEDR, input CLOCK_50);\n`ifndef SYNTHESIS\ninitial #10 $finish;\n`endif\nendmodule\n';
  expect(findingsOf(['top.v', module])).toEqual([]);
});

test('a portless testbench is never checked', () => {
  const tb = 'entity blink_tb is\nend entity;\narchitecture sim of blink_tb is\nbegin\nprocess begin\n  wait for 10 ns;\n  wait;\nend process;\nend architecture;\n';
  expect(findingsOf(['blink_tb.vhd', tb])).toEqual([]);
});

test('an architecture in another file than its entity is checked where its code is (§ 4.1)', () => {
  const entity = `library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (${BOARD_PORTS});\nend entity;\n`;
  const architecture = "architecture rtl of top is\nbegin\nprocess begin\n  LEDR(0) <= '1';\n  wait for 1 ms;\nend process;\nend architecture;\n";
  expect(findingsOf(['top.vhd', entity], ['top_rtl.vhd', architecture])).toEqual([['top_rtl.vhd', 'vhdl-wait-for', 5]]);
});

test('a sub-module the board design uses is checked, though it looks like a testbench (§ 4)', () => {
  const counter = vhdlDesign('counter', 'q : out std_logic', "process begin\n  q <= '1';\n  wait for 1 ms;\nend process;");
  const top = vhdlDesign('top', BOARD_PORTS, 'c : entity work.counter port map (q => LEDR(0));');
  expect(findingsOf(['top.vhd', top], ['counter.vhd', counter])).toEqual([['counter.vhd', 'vhdl-wait-for', 11]]);
});
