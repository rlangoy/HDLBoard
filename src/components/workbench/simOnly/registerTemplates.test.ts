// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EXAMPLE_FILES } from '../files';
import { EMPTY_OVERRIDES } from '../tbDetect/types';
import { checkDiagnostics } from './findingDiagnostics';
import { registerText } from './simOnlyText';
import type { RegisterProblemKind } from './types';
import { checkOf, source, vhdlDesign, viewOf } from './simOnly.testSupport';

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
  ['a "reset" that loads from the register: a second clock (Warning 13004, latches)', 'always @(posedge a or posedge b) if (b) x <= x + 1; else x <= d;', [2]],
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

/** The examples that show HDLBoard's slow clock, by name: on the board they need its real clock (§ 3.5). */
const SIMULATOR_CLOCK_EXAMPLES: readonly RegExp[] = [/(^|\/)blinkTest\.(vhdl|v)$/, /\/(basys3|nexys-a7)\/(vhdl|verilog)\/keyCounter7Seg\.(vhdl|v)$/];
const readsSimulatorClock = (label: string) => SIMULATOR_CLOCK_EXAMPLES.some((p) => p.test(label));

/** The example that shows two clocks, SIM-only on purpose. */
const isTwoClocksExample = (name: string) => name.startsWith('keyCounterTwoClocks');
const offTheBoard = (name: string, content: string) => checkOf([source(name, content)]).findings.filter((f) => f.tier !== 'quiet');

describe('the examples', () => {
  test.each(DESIGNS.filter(([label, name]) => !readsSimulatorClock(label) && !isTwoClocksExample(name)))('%s has no finding that keeps it off the board', (_label, name, content) => {
    expect(checkOf([source(name, content)]).findings.filter((f) => f.tier !== 'quiet')).toEqual([]);
  });

  test.each(DESIGNS.filter(([, name]) => isTwoClocksExample(name)))('%s is SIM-only for its two clocks, and nothing else', (_label, name, content) => {
    expect(offTheBoard(name, content).map((f) => f.register?.kind)).toEqual(['two-clocks']);
  });

  test.each(DESIGNS.filter(([label]) => readsSimulatorClock(label)))('%s is SIM-only for its simulator clock, and nothing else', (_label, name, content) => {
    expect(checkOf([source(name, content)]).findings.filter((f) => f.tier !== 'quiet').map((f) => f.construct)).toEqual(['sim-clock']);
  });

  test.each(DESIGNS.filter(([, name]) => name.startsWith('keyCouter2Led')))('%s names its entity after its file', (_label, _name, content) => {
    expect(content).toMatch(/\b(?:entity|module)\s+keyCouter2Led\b/);
  });
});

/** The old keyCouter2Led, which a synthesis tool refuses. */
const OLD_COUNTER = vhdlDesign(
  'keyCouter2Led',
  'CLOCK_50 : in std_logic; KEY_N : in std_logic_vector(3 downto 0); LEDR : out std_logic_vector(9 downto 0)',
  "process (CLOCK_50, KEY_N)\nbegin\n  if falling_edge(KEY_N(1)) then\n    count <= (others => '0');\n  elsif falling_edge(KEY_N (0)) then\n    count <= count + 1;\n  end if;\nend process;",
).replace('\n\nbegin\n', "\nsignal count : unsigned(7 downto 0);\nbegin\n");

/** The editor warnings of a one-file project. */
function warningsIn(name: string, content: string) {
  const files = [source(name, content)];
  return checkDiagnostics(checkOf(files), { analysis: viewOf(files).raw, overrides: EMPTY_OVERRIDES, files: [{ id: name, content }] });
}

const headlinesIn = (name: string, content: string): string[] => warningsIn(name, content).map((d) => d.advice?.headline ?? '');

describe('the message names the register and its clocks, as synthesis tools do', () => {
  test('two clocks: the old keyCouter2Led', () => {
    expect(headlinesIn('keyCouter2Led.vhd', OLD_COUNTER)).toEqual([
      '`count` uses two clocks, `KEY_N(1)` and `KEY_N(0)`: a register allows one clock edge, plus an optional asynchronous reset or set.',
    ]);
  });

  test.each([
    ['both edges', P("if rising_edge(a) then\nx <= c;\nelsif falling_edge(a) then\nx <= d;\nend if;"), '`x` uses both edges of `a`: a register allows one clock edge, plus an optional asynchronous reset or set.'],
    ['a branch after the edge', P("if rising_edge(a) then\nx <= c;\nelse\ny <= d;\nend if;"), '`x` and `y` change outside the clock edge of `a`: a register allows one clock edge, plus an optional asynchronous reset or set, nothing after the edge.'],
    ['two edges in one condition', P("if rising_edge(a) and rising_edge(b) then\nx <= c;\nend if;"), 'One condition tests the edges of `a` and `b` together: a register allows one clock edge, plus an optional asynchronous reset or set.'],
  ])('%s', (_label, process, headline) => {
    expect(headlinesIn('t.vhd', vhdl(process))).toEqual([headline]);
  });

  test.each([
    ['no reset tested', 'always @(posedge a or posedge b) if (c) x <= 0; else x <= d;', 'The `if` tests none of the edges `a` and `b`: a register allows one clock edge, plus an optional asynchronous reset or set, which the `if` tests first.'],
    ['a latch', 'always @(a or b) if (a && !b) x <= ~x;', '`x` keeps its value without a clock edge: the FPGA makes a latch, not a register.'],
  ])('Verilog: %s', (_label, body, headline) => {
    expect(headlinesIn('t.v', vlog(body))).toEqual([headline]);
  });

  test('the tooltip shows what is allowed, then marks the second clock as the error', () => {
    const [warning] = warningsIn('k.vhd', OLD_COUNTER);
    expect(warning.message.split('\n').slice(0, 4)).toEqual([
      'Allowed: one clock edge, plus an optional asynchronous reset or set tested as a level before it:',
      "  if rst = '0' then             -- reset or set: optional, a level",
      '  elsif rising_edge(clk) then   -- the one clock edge, last',
      'Here: `KEY_N(1)` is one clock, `KEY_N(0)` a second clock → error.',
    ]);
  });

  const KINDS: readonly RegisterProblemKind[] = ['two-clocks', 'both-edges', 'outside-edge', 'combined-edges', 'no-reset-tested', 'reset-polarity', 'latch'];
  test.each(KINDS.flatMap((kind) => (['vhdl', 'verilog'] as const).map((language) => [kind, language] as const)))(
    '%s in %s names no synthesis tool: the board may be Intel or AMD',
    (kind, language) => {
      const { headline, explanation } = registerText({ kind, registers: ['count'], clocks: ['a', 'b'], language });
      expect(`${headline} ${explanation}`).not.toMatch(/Quartus|Vivado/);
    },
  );

  test('a Verilog finding shows the Verilog template, a VHDL one the VHDL template', () => {
    const shape = (language: 'vhdl' | 'verilog') => registerText({ kind: 'two-clocks', registers: ['count'], clocks: ['up', 'down'], language }).explanation;
    expect([shape('verilog').includes('always @(posedge clk'), shape('vhdl').includes('elsif rising_edge(clk)')]).toEqual([true, true]);
  });
});
