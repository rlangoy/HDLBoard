// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { pairOptions, roleConflict, testbenchesFor, withPair, withRole, withoutContradictedPairs, withoutFile } from './splitModel';
import { analyzeProject } from './tbDetect/analyzeProject';
import { fixtureFile, sourceFile } from './tbDetect/fixtures.testSupport';
import { EMPTY_OVERRIDES } from './tbDetect/types';

/** docs/impl_split_screen.md § 4.4, § 4.10, § 5.7. */

const project = analyzeProject([
  fixtureFile('vhdl/counter.vhd'),
  fixtureFile('vhdl/counter_tb.vhd'),
  fixtureFile('vhdl/alu_with_tb.vhd'),
  fixtureFile('vhdl/de1_soc_stray.vhd'),
  fixtureFile('verilog/alu_tb.v'),
]);

describe('pairOptions', () => {
  test('the TB pane is offered the same-language designs', () => {
    const names = pairOptions(project, EMPTY_OVERRIDES, 'vhdl/counter_tb.vhd', 'tb').map((o) => o.name);
    // counter_tb instantiates counter: every other design is ruled out by the code.
    expect(names).toEqual(['counter.vhd']);
  });

  test('the RTL pane is offered the same-language testbenches', () => {
    const names = pairOptions(project, EMPTY_OVERRIDES, 'vhdl/counter.vhd', 'rtl').map((o) => o.name);
    expect(names).toEqual(['alu_with_tb.vhd', 'counter_tb.vhd']);
  });
});

describe('testbenchesFor', () => {
  test('a design without board ports lists the testbench units that instantiate it', () => {
    const choices = testbenchesFor(project, EMPTY_OVERRIDES, 'vhdl/counter.vhd', 'counter', []);
    expect(choices.map((c) => `${c.name} › ${c.unitName}`)).toEqual(['counter_tb.vhd › counter_tb']);
  });

  test('a testbench in the same file is offered too', () => {
    const choices = testbenchesFor(project, EMPTY_OVERRIDES, 'vhdl/alu_with_tb.vhd', 'alu', []);
    expect(choices.map((c) => c.unitName)).toEqual(['alu_tb']);
  });

  test('a board design asks nothing (AC-7)', () => {
    expect(testbenchesFor(project, EMPTY_OVERRIDES, 'vhdl/de1_soc_stray.vhd', 'DE1_SoC', [])).toEqual([]);
  });
});

describe('override edits', () => {
  test('withPair keeps one design per testbench', () => {
    const once = withPair(EMPTY_OVERRIDES, 'a', 'tb');
    expect(withPair(once, 'b', 'tb').pairs).toEqual({ b: 'tb' });
  });

  test('withRole sets and clears a role', () => {
    const set = withRole(EMPTY_OVERRIDES, 'a', 'tb');
    expect([set.roles, withRole(set, 'a', undefined).roles]).toEqual([{ a: 'tb' }, {}]);
  });

  test('withoutFile drops every entry naming the file', () => {
    const overrides = { roles: { a: 'tb' as const, b: 'rtl' as const }, pairs: { a: 'x', y: 'a', b: 'z' } };
    expect(withoutFile(overrides, 'a')).toEqual({ roles: { b: 'rtl' }, pairs: { b: 'z' } });
  });
});

test('a role override changes what pairOptions offers', () => {
  const asTestbench = withRole(EMPTY_OVERRIDES, 'vhdl/counter.vhd', 'tb');
  const names = pairOptions(project, asTestbench, 'vhdl/de1_soc_stray.vhd', 'rtl').map((o) => o.name);
  expect(names).toContain('counter.vhd');
});

test('files of the other language are never offered', () => {
  const extra = analyzeProject([fixtureFile('vhdl/counter.vhd'), sourceFile('verilog/counter_tb.v', 'module counter_tb; counter d (); initial $finish; endmodule')]);
  expect(pairOptions(extra, EMPTY_OVERRIDES, 'vhdl/counter.vhd', 'rtl')).toEqual([]);
});

describe('withoutContradictedPairs', () => {
  const ADDER4 = 'entity adder4 is\n  port (a : in bit; y : out bit);\nend entity;\narchitecture rtl of adder4 is\nbegin\n  y <= a;\nend architecture;\n';
  const ADDER4_TB = 'entity adder4_tb is\nend entity;\narchitecture sim of adder4_tb is\n  signal a, y : bit;\nbegin\n  dut: entity work.adder4 port map (a => a, y => y);\n  process begin\n    a <= \'1\';\n    wait for 10 ns;\n    assert y = \'1\' report "bad" severity error;\n    wait;\n  end process;\nend architecture;\n';
  const OTHER = 'entity counter8 is\n  port (CLOCK_50 : in bit; LEDR : out bit_vector(9 downto 0));\nend entity;\narchitecture rtl of counter8 is\nbegin\nend architecture;\n';
  const files = analyzeProject([sourceFile('vhdl/adder4.vhd', ADDER4), sourceFile('vhdl/adder4_tb.vhd', ADDER4_TB), sourceFile('vhdl/other.vhd', OTHER)]);

  test('drops a stored pairing the testbench contradicts, keeps the rest', () => {
    const stored = { roles: { 'vhdl/other.vhd': 'rtl' as const }, pairs: { 'vhdl/other.vhd': 'vhdl/adder4_tb.vhd' } };
    expect(withoutContradictedPairs(files, stored)).toEqual({ roles: { 'vhdl/other.vhd': 'rtl' }, pairs: {} });
  });

  test('returns the same object when nothing is dropped', () => {
    const stored = { roles: {}, pairs: { 'vhdl/adder4.vhd': 'vhdl/adder4_tb.vhd' } };
    expect(withoutContradictedPairs(files, stored)).toBe(stored);
  });

  test('the RTL pane of a design is not offered a testbench that tests another design', () => {
    expect(pairOptions(files, EMPTY_OVERRIDES, 'vhdl/other.vhd', 'rtl')).toEqual([]);
  });
});

describe('roleConflict', () => {
  const pair = {
    anchorId: 'vhdl/counter.vhd',
    tb: { fileId: 'vhdl/counter_tb.vhd', line: 1, unitName: 'counter_tb' },
    rtl: { fileId: 'vhdl/counter.vhd', line: 1, unitName: 'counter' },
    tbConfidence: 'high' as const,
    missingDut: null,
  };

  test('a testbench beside a design marked as a design: two designs', () => {
    const next = withRole(EMPTY_OVERRIDES, 'vhdl/counter_tb.vhd', 'rtl');
    expect(roleConflict(project, next, pair, 'both', 'vhdl/counter_tb.vhd')).toEqual({ otherFileId: 'vhdl/counter.vhd', role: 'rtl' });
  });

  test('a design beside a testbench marked as a testbench: two testbenches', () => {
    const next = withRole(EMPTY_OVERRIDES, 'vhdl/counter.vhd', 'tb');
    expect(roleConflict(project, next, pair, 'both', 'vhdl/counter.vhd')).toEqual({ otherFileId: 'vhdl/counter_tb.vhd', role: 'tb' });
  });

  test('no conflict with one pane shown, or when the role still differs', () => {
    const next = withRole(EMPTY_OVERRIDES, 'vhdl/counter_tb.vhd', 'rtl');
    expect(roleConflict(project, next, pair, 'tb', 'vhdl/counter_tb.vhd')).toBeNull();
    expect(roleConflict(project, withRole(EMPTY_OVERRIDES, 'vhdl/counter_tb.vhd', 'tb'), pair, 'both', 'vhdl/counter_tb.vhd')).toBeNull();
  });

  test('no conflict for a file shown in both panes, or beside an empty pane', () => {
    const same = { ...pair, tb: { ...pair.tb, fileId: 'vhdl/counter.vhd' } };
    expect(roleConflict(project, withRole(EMPTY_OVERRIDES, 'vhdl/counter.vhd', 'tb'), same, 'both', 'vhdl/counter.vhd')).toBeNull();
    expect(roleConflict(project, withRole(EMPTY_OVERRIDES, 'vhdl/counter_tb.vhd', 'rtl'), { ...pair, rtl: null }, 'both', 'vhdl/counter_tb.vhd')).toBeNull();
  });
});
