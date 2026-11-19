// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EMPTY_OVERRIDES } from '../tbDetect/types';
import { checkDiagnostics } from './findingDiagnostics';
import { checkOf, source, viewOf } from './simOnly.testSupport';
import { simulatorClockText } from './simOnlyText';

/** docs/impl_sim_only_warnings.md § 3.5: reading the board's simulator-only clock. */

const PORTS = 'CLOCK_50 : in std_logic; CLOCK_500Hz : in std_logic; SW : in std_logic_vector(9 downto 0); LEDR : out std_logic_vector(9 downto 0)';
const vhdl = (body: string, declarations = '') =>
  `library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (${PORTS});\nend entity;\narchitecture rtl of top is\n${declarations}\nbegin\n${body}\nend architecture;\n`;
const vlog = (body: string) =>
  `module top(input CLOCK_50, input CLOCK_500Hz, input [9:0] SW, output reg [9:0] LEDR);\n${body}\nendmodule\n`;

/** Lines of the simulator-clock findings in a one-file project. */
const clockLines = (name: string, content: string, mode: 'synthesis' | 'simulation' = 'synthesis') =>
  checkOf([source(name, content)], EMPTY_OVERRIDES, mode).findings.filter((f) => f.construct === 'sim-clock').map((f) => f.line);

const CLOCKED_500 = "process (CLOCK_500Hz)\nbegin\nif rising_edge(CLOCK_500Hz) then\nLEDR <= SW;\nend if;\nend process;";

describe('a design that reads the simulator clock is SIM-only', () => {
  test('VHDL: on the first line that reads it, past the sensitivity list', () => {
    expect(clockLines('top.vhd', vhdl(CLOCKED_500))).toEqual([11]);
  });

  test('Verilog: on the always that reads it', () => {
    expect(clockLines('top.v', vlog('always @(posedge CLOCK_500Hz) LEDR <= SW;'))).toEqual([2]);
  });

  test('VHDL: passed on in a port map, as the actual', () => {
    const map = 'u : entity work.blink port map (clk => CLOCK_500Hz, q => LEDR(0));';
    expect(clockLines('top.vhd', vhdl(map))).toEqual([9]);
  });

  test('Verilog: passed on to an instance', () => {
    expect(clockLines('top.v', vlog('blink u (.clk(CLOCK_500Hz), .q(LEDR[0]));'))).toEqual([2]);
  });

  test('the case of a VHDL name does not matter', () => {
    expect(clockLines('top.vhd', vhdl(CLOCKED_500.replace(/CLOCK_500Hz/g, 'clock_500hz')))).toEqual([11]);
  });
});

describe('what is not a read', () => {
  test('the port declared and not used, as in the starter files', () => {
    expect(clockLines('top.vhd', vhdl('LEDR <= SW;'))).toEqual([]);
  });

  test('the Verilog port declared and not used', () => {
    expect(clockLines('top.v', vlog('always @(posedge CLOCK_50) LEDR <= SW;'))).toEqual([]);
  });

  test('a component declaration with a port of that name', () => {
    const component = 'component blink is\n  port (CLOCK_500Hz : in std_logic; q : out std_logic);\nend component;';
    expect(clockLines('top.vhd', vhdl('LEDR <= SW;', component))).toEqual([]);
  });

  test('code hidden from synthesis', () => {
    const hidden = `-- synthesis translate_off\n${CLOCKED_500}\n-- synthesis translate_on`;
    expect(clockLines('top.vhd', vhdl(hidden))).toEqual([]);
  });

  test('a unit without the port: a signal of that name is its own', () => {
    const design = vhdl(CLOCKED_500).replace(' CLOCK_500Hz : in std_logic;', '').replace('\nbegin\n', "\nsignal CLOCK_500Hz : std_logic := '0';\nbegin\n");
    expect(clockLines('top.vhd', design)).toEqual([]);
  });

  test('with Design check set to Simulation only', () => {
    expect(clockLines('top.vhd', vhdl(CLOCKED_500), 'simulation')).toEqual([]);
  });
});

describe('the message', () => {
  const text = simulatorClockText({ name: 'CLOCK_500Hz', board: { port: 'CLOCK_50', mhz: 50 } });

  test('says the clock only exists in the simulator', () => {
    expect(text.headline).toBe('`CLOCK_500Hz` only exists in the simulator: the board has no such clock pin.');
  });

  test("gives the board's own clock, and the count for the same rate", () => {
    expect(text.explanation).toContain('use `CLOCK_50` (50 MHz) instead, and count 100 000 of its cycles for each tick of `CLOCK_500Hz`.');
  });

  test('is the warning on the line', () => {
    const design = vhdl(CLOCKED_500);
    const files = [source('top.vhd', design)];
    const [warning] = checkDiagnostics(checkOf(files), { analysis: viewOf(files).raw, overrides: EMPTY_OVERRIDES, files: [{ id: 'top.vhd', content: design }] });
    expect(warning.advice?.headline).toBe('`CLOCK_500Hz` only exists in the simulator: the board has no such clock pin.');
  });
});
