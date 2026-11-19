// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { findPair } from '../tbDetect/pairing';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../tbDetect/types';
import { fileGroupOf } from './groups';
import { BLINK, BOARD_PORTS, checkOf, source, vhdlDesign, viewOf } from './simOnly.testSupport';
import type { DesignCheckMode } from './types';

/** docs/impl_sim_only_warnings.md § 9, groups.test.ts and hardware.test.ts. */

type Files = [string, string][];
const sources = (files: Files) => files.map(([name, content]) => source(name, content));
interface CheckOptions {
  readonly overrides?: TestbenchOverrides;
  readonly mode?: DesignCheckMode;
}
const groupOf = (files: Files, fileId: string, { overrides = EMPTY_OVERRIDES, mode = 'synthesis' }: CheckOptions = {}) =>
  checkOf(sources(files), overrides, mode).groups.byFile.get(fileId);
type Row = [label: string, files: Files, fileId: string, overrides: TestbenchOverrides, mode: DesignCheckMode, expected: string | undefined];

const COUNTER_WAIT = vhdlDesign('counter', 'q : out std_logic', "process begin\n  q <= '1';\n  wait for 1 ms;\nend process;");
const COUNTER_TB = 'entity counter_tb is\nend entity;\narchitecture sim of counter_tb is\n  signal q : bit;\nbegin\n  dut : entity work.counter port map (q => q);\n  process begin wait for 10 ns; wait; end process;\nend architecture;\n';
const TOP_USES_COUNTER = vhdlDesign('top', BOARD_PORTS, 'c : entity work.counter port map (q => LEDR(0));');
const MONITOR = vhdlDesign('monitor', 'a : in std_logic', 'process begin\n  wait for 1 ms;\n  report "x";\nend process;');
const topWithMonitor = (guarded: boolean) =>
  vhdlDesign('top', BOARD_PORTS, guarded
    ? '-- synthesis translate_off\nm : entity work.monitor port map (a => SW(0));\n-- synthesis translate_on'
    : 'm : entity work.monitor port map (a => SW(0));');

const marked = (fileId: string, role: 'tb' | 'rtl'): TestbenchOverrides => ({ ...EMPTY_OVERRIDES, roles: { [fileId]: role } });
const simModel = (fileId: string): TestbenchOverrides => ({ ...EMPTY_OVERRIDES, simModels: { [fileId]: true } });

describe('the group follows the findings', () => {
  test.each<Row>([
    ['the blink example is SIM-only', [['blink.vhd', BLINK]], 'blink.vhd', EMPTY_OVERRIDES, 'synthesis', 'sim-only'],
    ['without its wait for lines it is RTL', [['blink.vhd', BLINK.replace(/ {2}wait for 500 ms;\n/g, '')]], 'blink.vhd', EMPTY_OVERRIDES, 'synthesis', 'rtl'],
    ['use std.env.all; alone is RTL', [['top.vhd', vhdlDesign('top', BOARD_PORTS, "LEDR(0) <= '1';").replace('library ieee;', 'library ieee;\nuse std.env.all;')]], 'top.vhd', EMPTY_OVERRIDES, 'synthesis', 'rtl'],
    ['a portless testbench is TB', [['counter_tb.vhd', COUNTER_TB]], 'counter_tb.vhd', EMPTY_OVERRIDES, 'synthesis', 'tb'],
    ['a counter the board uses is SIM-only', [['top.vhd', TOP_USES_COUNTER], ['counter.vhd', COUNTER_WAIT]], 'counter.vhd', EMPTY_OVERRIDES, 'synthesis', 'sim-only'],
    ["a counter only its testbench uses is SIM-only, as the testbench's DUT", [['counter_tb.vhd', COUNTER_TB], ['counter.vhd', COUNTER_WAIT]], 'counter.vhd', EMPTY_OVERRIDES, 'synthesis', 'sim-only'],
    ['marked Treat as testbench it is TB', [['counter_tb.vhd', COUNTER_TB], ['counter.vhd', COUNTER_WAIT]], 'counter.vhd', marked('counter.vhd', 'tb'), 'synthesis', 'tb'],
    ['a standalone sub-module with wait for nothing uses looks like a testbench', [['counter.vhd', COUNTER_WAIT]], 'counter.vhd', EMPTY_OVERRIDES, 'synthesis', 'tb'],
    ['Treat as design checks it', [['counter.vhd', COUNTER_WAIT]], 'counter.vhd', marked('counter.vhd', 'rtl'), 'synthesis', 'sim-only'],
    ['a Simulation model is SIM-only', [['top.vhd', vhdlDesign('top', BOARD_PORTS, "LEDR(0) <= '1';")]], 'top.vhd', simModel('top.vhd'), 'synthesis', 'sim-only'],
    ['a monitor behind translate_off is not checked', [['top.vhd', topWithMonitor(true)], ['monitor.vhd', MONITOR]], 'monitor.vhd', EMPTY_OVERRIDES, 'synthesis', 'tb'],
    ['the monitor below translate_on is', [['top.vhd', topWithMonitor(false)], ['monitor.vhd', MONITOR]], 'monitor.vhd', EMPTY_OVERRIDES, 'synthesis', 'sim-only'],
    ['Simulation only mode has no SIM-only group', [['blink.vhd', BLINK]], 'blink.vhd', EMPTY_OVERRIDES, 'simulation', 'rtl'],
    ['nor for a Simulation model', [['blink.vhd', BLINK]], 'blink.vhd', simModel('blink.vhd'), 'simulation', 'rtl'],
  ])('%s', (...[, files, fileId, overrides, mode, expected]: Row) => {
    expect(groupOf(files, fileId, { overrides, mode })).toBe(expected);
  });
});

test('a testbench and a SIM-only design in one file are mixed-sim-only', () => {
  expect(groupOf([['both.vhd', COUNTER_WAIT.replace(/^library.*\nuse.*\n/, '') + COUNTER_TB], ['top.vhd', TOP_USES_COUNTER]], 'both.vhd')).toBe('mixed-sim-only');
});

test('an entity and its SIM-only architecture in two files are both SIM-only (§ 4.1)', () => {
  const entity = `library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (${BOARD_PORTS});\nend entity;\n`;
  const architecture = 'architecture rtl of top is\nbegin\nprocess begin\n  wait for 1 ms;\nend process;\nend architecture;\n';
  const files: Files = [['top.vhd', entity], ['top_rtl.vhd', architecture]];
  expect([groupOf(files, 'top.vhd'), groupOf(files, 'top_rtl.vhd')]).toEqual(['sim-only', 'sim-only']);
});

describe('file groups', () => {
  test.each<[string, ('rtl' | 'sim-only' | 'tb')[], string | undefined]>([
    ['no units', [], undefined],
    ['rtl', ['rtl'], 'rtl'],
    ['sim-only beats rtl', ['rtl', 'sim-only'], 'sim-only'],
    ['tb', ['tb'], 'tb'],
    ['tb and rtl', ['tb', 'rtl'], 'mixed'],
    ['tb and sim-only', ['sim-only', 'tb'], 'mixed-sim-only'],
  ])('%s', (_label, groups, expected) => {
    expect(fileGroupOf(groups)).toBe(expected);
  });
});

describe('SIM-only regions', () => {
  test('one per block that holds a finding', () => {
    const regions = checkOf([source('blink.vhd', BLINK)]).groups.simOnlyRegions.get('blink.vhd');
    expect(regions?.map((r) => [r.label, r.span.start])).toEqual([['process', 9]]);
  });
});

describe('the role correction (§ 4.2)', () => {
  const tbPairsWith = (files: Files, overrides: TestbenchOverrides = EMPTY_OVERRIDES) =>
    findPair('counter_tb.vhd', viewOf(sources(files), overrides).corrected, overrides, []).rtl?.fileId ?? null;

  test('a counter the board uses is a design for pairing', () => {
    const view = viewOf(sources([['top.vhd', TOP_USES_COUNTER], ['counter.vhd', COUNTER_WAIT]]));
    expect(view.corrected.byFile.get('counter.vhd')?.role).toBe('rtl');
  });

  test('its detected role stays a testbench', () => {
    const view = viewOf(sources([['top.vhd', TOP_USES_COUNTER], ['counter.vhd', COUNTER_WAIT]]));
    expect(view.raw.byFile.get('counter.vhd')?.role).toBe('tb');
  });

  test('its testbench pairs with it', () => {
    expect(tbPairsWith([['counter_tb.vhd', COUNTER_TB], ['counter.vhd', COUNTER_WAIT]])).toBe('counter.vhd');
  });

  test("the student's Treat as testbench beats it", () => {
    expect(tbPairsWith([['counter_tb.vhd', COUNTER_TB], ['counter.vhd', COUNTER_WAIT]], marked('counter.vhd', 'tb'))).toBeNull();
  });

  test('a testbench of a DUT and a monitor, neither named after it nor a design, has no DUT', () => {
    const tb = COUNTER_TB.replace('dut : entity work.counter', 'a : entity work.alpha').replace('process begin', 'b : entity work.beta port map (q => q);\n  process begin');
    const alpha = COUNTER_WAIT.replace(/counter/g, 'alpha');
    const beta = COUNTER_WAIT.replace(/counter/g, 'beta');
    const view = viewOf(sources([['counter_tb.vhd', tb], ['alpha.vhd', alpha], ['beta.vhd', beta]]));
    expect(view.hardware.dutOf.size).toBe(0);
  });

  test('an instance cycle ends', () => {
    const a = vhdlDesign('a', BOARD_PORTS, 'x : entity work.b port map (q => LEDR(0));');
    const b = vhdlDesign('b', 'q : out std_logic', 'y : entity work.a port map (LEDR => open);');
    expect(viewOf(sources([['a.vhd', a], ['b.vhd', b]])).hardware.hardware.size).toBe(2);
  });

  test('VHDL names match in any case', () => {
    const top = TOP_USES_COUNTER.replace('work.counter', 'work.COUNTER');
    expect(groupOf([['top.vhd', top], ['counter.vhd', COUNTER_WAIT]], 'counter.vhd')).toBe('sim-only');
  });
});
