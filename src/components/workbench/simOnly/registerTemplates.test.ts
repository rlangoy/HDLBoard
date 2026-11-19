// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EXAMPLE_FILES } from '../files';
import { checkOf, source, vhdlDesign } from './simOnly.testSupport';

/**
 * docs/impl_sim_only_warnings.md § 3.4. Every case was run through Quartus Prime 25.1
 * Lite (`quartus_map`, Cyclone V); the label says what Quartus did.
 */

const PORTS = 'a, b, c, d : in std_logic; q, r : out std_logic';
const vhdl = (process: string) => vhdlDesign('t', PORTS, `${process}\nq <= '0'; r <= '0';`);
const vlog = (body: string) => `module t(input a, b, c, d, output reg x = 0, output reg y = 0);\n${body}\nendmodule\n`;

/** Lines of the flip-flop findings in a one-file project. */
const linesIn = (name: string, content: string): number[] =>
  checkOf([source(name, content)]).findings
    .filter((f) => ['vhdl-edge-template', 'vlog-edge-template', 'vlog-level-storage'].includes(f.construct))
    .map((f) => f.line);

const P = (body: string) => `process (a, b, c)\nbegin\n${body}\nend process;`;
/** The process starts on line 9 of `vhdl()`, so its first statement is on line 11. */
const VHDL: [label: string, process: string, lines: number[]][] = [
  ['two edges in one if/elsif (Error 10820)', P("if falling_edge(b) then\nx <= '0';\nelsif falling_edge(a) then\nx <= '1';\nend if;"), [13]],
  ['both edges of one clock (Error 10819)', P("if rising_edge(a) then\nx <= c;\nelsif falling_edge(a) then\nx <= d;\nend if;"), [13]],
  ['an elsif after the edge (Error 10818)', P("if rising_edge(a) then\nx <= c;\nelsif b = '1' then\nx <= '0';\nend if;"), [13]],
  ['an else after the edge (Error 10818)', P("if rising_edge(a) then\nx <= c;\nelse\nx <= '0';\nend if;"), [13]],
  ['two edges in one condition (Error 10628)', P("if rising_edge(a) and rising_edge(b) then\nx <= c;\nend if;"), [11]],
  ['an asynchronous reset (accepted)', P("if b = '0' then\nx <= '0';\nelsif falling_edge(a) then\nx <= c;\nend if;"), []],
  ['a reset and a set (accepted)', P("if b = '1' then\nx <= '0';\nelsif c = '1' then\nx <= '1';\nelsif rising_edge(a) then\nx <= d;\nend if;"), []],
  ['an enable in the edge condition (accepted)', P("if rising_edge(a) and b = '1' then\nx <= c;\nend if;"), []],
  ['two ifs on two clocks, two signals (accepted)', P("if rising_edge(a) then\nx <= c;\nend if;\nif rising_edge(b) then\ny <= d;\nend if;"), []],
  ['the same clock in two ifs (accepted)', P("if rising_edge(a) then\nx <= c;\nend if;\nif rising_edge(a) then\ny <= d;\nend if;"), []],
  ["clk'event and clk = '1' with a reset (accepted)", P("if b = '1' then\nx <= '0';\nelsif a'event and a = '1' then\nx <= c;\nend if;"), []],
  ['an if / else inside the edge (accepted)', P("if rising_edge(a) then\nif b = '1' then\nx <= c;\nelse\nx <= d;\nend if;\nend if;"), []],
  ['when / else inside the edge (accepted)', P("if rising_edge(a) then\nx <= c when b = '1' else d;\nend if;"), []],
];

const VERILOG: [label: string, body: string, lines: number[]][] = [
  ['the first if tests no edge (Error 10200)', 'always @(posedge a or posedge b) if (c) x <= 0; else x <= d;', [2]],
  ['a level always that keeps a value (Warning 10240, latches)', 'always @(a or b) if (a && !b) x <= ~x;', [2]],
  ['an asynchronous reset (accepted)', 'always @(posedge a or posedge b) if (b) x <= 0; else x <= d;', []],
  ['an active-low reset in a begin (accepted)', 'always @(posedge a or negedge b) begin\n  if (!b) x <= 0;\n  else x <= d;\nend', []],
  ['a reset and a set (accepted)', 'always @(posedge a or posedge b or posedge c) if (b) x <= 0; else if (c) x <= 1; else x <= d;', []],
  ['a combinational always (accepted)', 'always @(a or b) x <= a & b;', []],
  ['a comparison in a level always (accepted)', 'always @(*) if (a <= b) x <= c; else x <= d;', []],
];

describe('VHDL: an if Quartus can build a flip-flop from', () => {
  test.each(VHDL)('%s', (_label, process, lines) => expect(linesIn('t.vhd', vhdl(process))).toEqual(lines));
});

describe('Verilog: an always Quartus can build a flip-flop from', () => {
  test.each(VERILOG)('%s', (_label, body, lines) => expect(linesIn('t.v', vlog(body))).toEqual(lines));
});

/** The examples written out per board (examples.ts). */
const BOARD_SOURCES: Record<string, string> = import.meta.glob('../boardExamples/*/*/*', { query: '?raw', import: 'default', eager: true });
const DESIGNS: [string, string, string][] = [
  ...EXAMPLE_FILES.map((f): [string, string, string] => [f.name, f.name, f.content]),
  ...Object.entries(BOARD_SOURCES).map(([path, content]): [string, string, string] => [path, path.split('/').pop() ?? path, content]),
].filter(([, name]) => !/_tb\.(vhd|v)$/.test(name));

describe('the examples', () => {
  test.each(DESIGNS)('%s has no finding that keeps it off the board', (_label, name, content) => {
    expect(checkOf([source(name, content)]).findings.filter((f) => f.tier !== 'quiet')).toEqual([]);
  });

  test.each(DESIGNS.filter(([, name]) => name.startsWith('keyCouter2Led')))('%s names its entity after its file', (_label, name, content) => {
    expect(content).toMatch(/\b(?:entity|module)\s+keyCouter2Led\b/);
  });
});
