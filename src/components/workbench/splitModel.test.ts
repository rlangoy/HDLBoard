// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { pairOptions, testbenchesFor, withPair, withRole, withoutFile } from './splitModel';
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
    expect(names).toEqual(['alu_with_tb.vhd', 'counter.vhd', 'de1_soc_stray.vhd']);
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
