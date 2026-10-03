// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { analyzeProject, type SourceFile } from './analyzeProject';
import { fixtureFile, sourceFile } from './fixtures.testSupport';
import { findPair } from './pairing';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from './types';

/** docs/impl_split_screen.md § 7.1, pairing projects P-1 … P-9. */

const ALU_V = 'module alu (input a, output y);\nassign y = a;\nendmodule\n';
const aluTb = (name: string) => `module ${name};\nreg a; wire y;\nalu dut (.a(a), .y(y));\ninitial begin #1 $finish; end\nendmodule\n`;

function pairOf(files: SourceFile[], anchor: string, overrides: TestbenchOverrides = EMPTY_OVERRIDES, mru: string[] = []) {
  return findPair(anchor, analyzeProject(files), overrides, mru);
}

const P2 = [sourceFile('verilog/alu.v', ALU_V), sourceFile('verilog/alu_test.v', aluTb('alu_test')), sourceFile('verilog/alu_tb_old.v', aluTb('alu_tb_old'))];
const P3 = [sourceFile('verilog/alu.v', ALU_V), sourceFile('verilog/test_alu.v', aluTb('test_alu')), sourceFile('verilog/alu_tb.v', aluTb('alu_tb'))];

describe('findPair', () => {
  test('P-1: a design finds the testbench that instantiates it and is named after it', () => {
    const pair = pairOf([fixtureFile('vhdl/counter.vhd'), fixtureFile('vhdl/counter_tb.vhd')], 'vhdl/counter.vhd');
    expect(pair).toMatchObject({ tb: { fileId: 'vhdl/counter_tb.vhd', unitName: 'counter_tb' }, rtl: { fileId: 'vhdl/counter.vhd', line: 5 }, tbConfidence: 'high' });
  });

  test('P-1 at its first region: the TB pane opens at the clock generator', () => {
    const pair = pairOf([fixtureFile('vhdl/counter.vhd'), fixtureFile('vhdl/counter_tb.vhd')], 'vhdl/counter.vhd');
    expect(pair.tb?.line).toBe(16);
  });

  test('P-1b: a legacy work/ testbench pairs too', () => {
    const files = [fixtureFile('vhdl/counter.vhd'), fixtureFile('vhdl/counter_tb.vhd', 'work', 'tb_counter.vhd')];
    expect(pairOf(files, 'vhdl/counter.vhd').tb?.fileId).toBe('work/tb_counter.vhd');
  });

  test('P-2: naming breaks the tie between two instantiating testbenches', () => {
    expect(pairOf(P2, 'verilog/alu.v').tb?.fileId).toBe('verilog/alu_test.v');
  });

  test('P-3: an exact tie goes alphabetical', () => {
    expect(pairOf(P3, 'verilog/alu.v').tb?.fileId).toBe('verilog/alu_tb.v');
  });

  test('P-3b: an exact tie goes to the most recently active first', () => {
    expect(pairOf(P3, 'verilog/alu.v', EMPTY_OVERRIDES, ['verilog/test_alu.v']).tb?.fileId).toBe('verilog/test_alu.v');
  });

  test('P-4: languages never pair', () => {
    const files = [fixtureFile('vhdl/counter.vhd'), sourceFile('verilog/counter_tb.v', aluTb('counter_tb').replace('alu dut', 'counter dut'))];
    expect(pairOf(files, 'vhdl/counter.vhd').tb).toBeNull();
  });

  test('P-5: a testbench whose DUT is missing names it', () => {
    expect(pairOf([fixtureFile('vhdl/counter_tb.vhd')], 'vhdl/counter_tb.vhd')).toMatchObject({
      tb: { fileId: 'vhdl/counter_tb.vhd' },
      rtl: null,
      missingDut: 'counter',
      tbConfidence: 'high',
    });
  });

  test('P-6: a file holding both is a self pair', () => {
    const pair = pairOf([fixtureFile('vhdl/alu_with_tb.vhd')], 'vhdl/alu_with_tb.vhd');
    expect(pair).toMatchObject({
      tb: { fileId: 'vhdl/alu_with_tb.vhd', unitName: 'alu_tb', line: 28 },
      rtl: { fileId: 'vhdl/alu_with_tb.vhd', unitName: 'alu', line: 4 },
    });
  });

  test('P-7: a pair override wins', () => {
    const overrides = { roles: {}, pairs: { 'verilog/alu.v': 'verilog/alu_tb_old.v' } };
    expect(pairOf(P2, 'verilog/alu.v', overrides).tb?.fileId).toBe('verilog/alu_tb_old.v');
    expect(pairOf(P2, 'verilog/alu_tb_old.v', overrides).rtl?.fileId).toBe('verilog/alu.v');
  });

  test('P-8: a testbench that instantiates nothing', () => {
    const selftest = sourceFile('vhdl/selftest.vhd', 'entity selftest is end;\narchitecture a of selftest is begin\nprocess begin\nwait for 1 ns;\nassert true;\nwait;\nend process;\nend;');
    expect(pairOf([selftest], 'vhdl/selftest.vhd')).toMatchObject({ rtl: null, missingDut: null, tbConfidence: 'high' });
  });

  test('P-9: weak evidence only gives a medium testbench', () => {
    expect(pairOf([fixtureFile('vhdl/skeleton_tb.vhd')], 'vhdl/skeleton_tb.vhd').tbConfidence).toBe('medium');
  });

  test('a role override makes a file a testbench, with high confidence', () => {
    const files = [fixtureFile('vhdl/counter.vhd'), sourceFile('vhdl/drive.vhd', fixtureFile('vhdl/counter.vhd').content.replace(/counter/g, 'drive'))];
    const pair = pairOf(files, 'vhdl/drive.vhd', { roles: { 'vhdl/drive.vhd': 'tb' }, pairs: {} });
    expect(pair).toMatchObject({ tb: { fileId: 'vhdl/drive.vhd' }, tbConfidence: 'high' });
  });

  test('a design with no testbench pairs with nothing', () => {
    expect(pairOf([fixtureFile('vhdl/counter.vhd')], 'vhdl/counter.vhd')).toMatchObject({ tb: null, rtl: { fileId: 'vhdl/counter.vhd' } });
  });
});
