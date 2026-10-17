// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { VhdlFile } from '../workbench/files';
import { findDeclaration, scopeFileName } from './declarations';

const file = (name: string, content: string): VhdlFile => ({ id: name, name, folder: name.endsWith('.v') ? 'verilog' : 'vhdl', content });

const COUNTER = file(
  'counter.vhd',
  `library ieee;
use ieee.std_logic_1164.all;
entity counter is
  port (clk : in std_logic; count : out std_logic);
end entity;
architecture rtl of counter is
  type state_t is (idle, run);
  signal state : state_t;
begin
end architecture;
`,
);

const TB = file(
  'counter_tb.vhd',
  `library ieee;
use ieee.std_logic_1164.all;
entity counter_tb is
end entity;
architecture sim of counter_tb is
  signal clk : std_logic := '0';
  -- signal state : not this one
  signal count : std_logic;
begin
  dut : entity work.counter port map (clk => clk, count => count);
end architecture;
`,
);

const VERILOG = [
  file('counter.v', 'module counter #(parameter W = 4) (input clk, output reg [W-1:0] q);\n  reg [1:0] state;\nendmodule\n'),
  file('tb.v', 'module tb;\n  reg clk;\n  wire [3:0] q;\n  counter #(.W(4)) dut (.clk(clk), .q(q));\nendmodule\n'),
];

describe('scopeFileName', () => {
  test("the testbench's file, and the design file through the instance label", () => {
    expect(scopeFileName([COUNTER, TB], ['counter_tb'])).toBe('counter_tb.vhd');
    expect(scopeFileName([COUNTER, TB], ['counter_tb', 'dut'])).toBe('counter.vhd');
    expect(scopeFileName(VERILOG, ['tb', 'dut'])).toBe('counter.v');
    expect(scopeFileName([COUNTER, TB], ['counter_tb', 'nope'])).toBeUndefined();
  });
});

describe('findDeclaration', () => {
  test('a testbench signal, in the testbench file', () => {
    expect(findDeclaration([COUNTER, TB], ['counter_tb'], 'count')).toMatchObject({ fileId: 'counter_tb.vhd', line: 8 });
  });

  test('a signal inside dut, through the instance label, in the design file', () => {
    expect(findDeclaration([COUNTER, TB], ['counter_tb', 'dut'], 'state')).toMatchObject({ fileId: 'counter.vhd', line: 8 });
    expect(findDeclaration([COUNTER, TB], ['counter_tb', 'dut'], 'clk')).toMatchObject({ fileId: 'counter.vhd', line: 4 });
  });

  test('Verilog, past a parameter list', () => {
    expect(findDeclaration(VERILOG, ['tb'], 'q')).toMatchObject({ fileId: 'tb.v', line: 3 });
    expect(findDeclaration(VERILOG, ['tb', 'dut'], 'state')).toMatchObject({ fileId: 'counter.v', line: 2 });
  });

  test('unknown instance or name', () => {
    expect(findDeclaration([COUNTER, TB], ['counter_tb', 'nope'], 'state')).toBeUndefined();
    expect(findDeclaration([COUNTER, TB], ['counter_tb'], 'nope')).toBeUndefined();
  });
});
