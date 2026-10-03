// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { blankSource } from './blank';
import { designUnits } from './designUnits';
import { fixture } from './fixtures.testSupport';
import type { Language } from './types';

/** docs/impl_split_screen.md § 5.3. */

const units = (language: Language, src: string) => designUnits(language, blankSource(language, src).code);

describe('VHDL units', () => {
  test('two entities in one file, each with its context clause and architecture', () => {
    const [alu, aluTb] = units('vhdl', fixture('vhdl/alu_with_tb.vhd'));
    expect(alu).toMatchObject({ name: 'alu', hasPorts: true, declLine: 4, span: { start: 1, end: 15 } });
    expect(aluTb).toMatchObject({ name: 'alu_tb', hasPorts: false, declLine: 20, span: { start: 17, end: 35 } });
    expect(aluTb.instances).toEqual([{ name: 'alu', line: 26 }]);
    expect(aluTb.blocks.map((b) => b.span)).toEqual([{ start: 28, end: 34 }]);
  });

  test('all three instance forms', () => {
    const src = `entity t is end entity;
architecture a of t is begin
  u1 : entity work.one(rtl) port map (x => x);
  u2 : component two generic map (N => 1) port map (x);
  u3 : three port map (x);
end architecture;`;
    expect(units('vhdl', src)[0].instances.map((i) => i.name)).toEqual(['one', 'two', 'three']);
  });

  test('board ports and the line of the first one', () => {
    const [unit] = units('vhdl', fixture('vhdl/de1_soc_stray.vhd'));
    expect(unit).toMatchObject({ hasPorts: true, hasBoardPorts: true, boardPortLine: 6 });
  });

  test('a generic clause alone is not a port clause', () => {
    const [unit] = units('vhdl', 'entity g is generic (N : natural := 1); end entity;\narchitecture a of g is begin end;');
    expect(unit.hasPorts).toBe(false);
  });

  test('labelled and unlabelled processes', () => {
    const [tb] = units('vhdl', fixture('vhdl/counter_tb.vhd'));
    expect(tb.blocks.map((b) => [b.label, b.named])).toEqual([['stimulus', true]]);
  });
});

describe('Verilog units', () => {
  test('a portless module with an instance and two blocks', () => {
    const [tb] = units('verilog', fixture('verilog/counter8_tb.v'));
    expect(tb).toMatchObject({ name: 'counter8_tb', hasPorts: false, declLine: 2, span: { start: 2, end: 18 } });
    expect(tb.instances).toEqual([{ name: 'counter8', line: 7 }]);
    expect(tb.blocks.map((b) => [b.kind, b.span.start, b.span.end])).toEqual([
      ['always', 9, 9],
      ['initial', 11, 17],
    ]);
  });

  test('a parameter list is not a port list, and #( overrides are instances', () => {
    const [top] = units('verilog', fixture('verilog/top_param.v'));
    expect(top.hasPorts).toBe(true);
    expect(top.instances.map((i) => i.name)).toEqual(['counter', 'counter']);
  });

  test('module x(); and module x #(…); are portless', () => {
    expect(units('verilog', 'module x();\nendmodule')[0].hasPorts).toBe(false);
    expect(units('verilog', 'module x #(parameter N = 1);\nendmodule')[0].hasPorts).toBe(false);
  });

  test('an if / else body without begin is one block', () => {
    const [m] = units('verilog', fixture('verilog/counter8.v'));
    expect(m.blocks.map((b) => [b.kind, b.span.start, b.span.end])).toEqual([
      ['initial', 8, 8],
      ['always', 10, 12],
    ]);
  });

  test('a named begin gives the block its label', () => {
    const [m] = units('verilog', 'module t;\ninitial begin : stim\n#1;\nend\nendmodule');
    expect(m.blocks[0]).toMatchObject({ label: 'stim', named: true });
  });

  test('two modules in one file', () => {
    expect(units('verilog', fixture('verilog/alu_tb.v')).map((m) => [m.name, m.hasPorts])).toEqual([
      ['alu', true],
      ['alu_tb', false],
    ]);
  });
});
