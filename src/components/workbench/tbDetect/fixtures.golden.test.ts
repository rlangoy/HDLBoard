// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { analyzeFile } from './analyzeProject';
import { FIXTURES, fixtureFile } from './fixtures.testSupport';
import type { Confidence, FileRole } from './types';

/**
 * docs/impl_split_screen.md § 7.1, AC-1, AC-2: every fixture unit fires exactly
 * these rules, for this score, strong flag and confidence; every file has this role.
 */

interface Expected {
  readonly unit: string;
  readonly rules: readonly string[];
  readonly score: number;
  readonly strong: boolean;
  readonly confidence: Confidence;
}

const GOLDEN: Readonly<Record<string, { role: FileRole; units: Expected[] }>> = {
  'vhdl/counter.vhd': { role: 'rtl', units: [u('counter', [], 0, 'low')] },
  'vhdl/counter_tb.vhd': {
    role: 'tb',
    units: [u('counter_tb', ['portless', 'tb-name', 'drives-dut', 'clock-gen', 'wait-for', 'assert', 'end-sim', 'wait-forever'], 100, 'high')],
  },
  'vhdl/alu_with_tb.vhd': {
    role: 'mixed',
    units: [u('alu', [], 0, 'low'), u('alu_tb', ['portless', 'tb-name', 'drives-dut', 'wait-for', 'assert', 'wait-forever'], 100, 'high')],
  },
  'vhdl/sync_reg.vhd': { role: 'rtl', units: [u('sync_reg', ['assert', 'wait-until', 'after'], 25, 'low')] },
  'vhdl/de1_soc_stray.vhd': { role: 'rtl', units: [u('DE1_SoC', ['after', 'board-ports'], 0, 'low')] },
  'vhdl/check.vhd': { role: 'tb', units: [u('check', ['portless', 'drives-dut', 'wait-until'], 55, 'high')] },
  'vhdl/skeleton_tb.vhd': { role: 'tb', units: [u('skeleton_tb', ['portless', 'tb-name', 'assert'], 45, 'medium')] },
  'vhdl/edge_detect_traps.vhd': { role: 'rtl', units: [u('edge_detect', [], 0, 'low')] },
  'vhdl/fifo_ctrl_guarded.vhd': { role: 'rtl', units: [u('fifo_ctrl', ['sim-only', 'assert'], 25, 'low')] },
  'verilog/counter8.v': { role: 'rtl', units: [u('counter8', ['initial'], 5, 'low')] },
  'verilog/counter8_tb.v': {
    role: 'tb',
    units: [u('counter8_tb', ['portless', 'tb-name', 'drives-dut', 'clock-gen', 'delay', 'initial', 'display', 'end-sim'], 100, 'high')],
  },
  'verilog/top_param.v': { role: 'rtl', units: [u('top', [], 0, 'low')] },
  'verilog/check.v': { role: 'tb', units: [u('check', ['portless', 'drives-dut', 'initial'], 50, 'high')] },
  'verilog/skeleton_tb.v': { role: 'tb', units: [u('skeleton_tb', ['portless', 'tb-name', 'initial', 'display'], 60, 'medium')] },
  'verilog/handshake_tb.v': {
    role: 'tb',
    units: [u('handshake_tb', ['portless', 'tb-name', 'drives-dut', 'clock-gen', 'initial', 'event-wait', 'display'], 100, 'high')],
  },
  'verilog/blinker_traps.v': { role: 'rtl', units: [u('blinker', [], 0, 'low')] },
  'verilog/fifo_ctrl_guarded.v': { role: 'rtl', units: [u('fifo_ctrl', ['sim-only', 'display'], 35, 'low')] },
  'verilog/alu_tb.v': {
    role: 'mixed',
    units: [u('alu', [], 0, 'low'), u('alu_tb', ['portless', 'tb-name', 'drives-dut', 'delay', 'initial', 'display', 'end-sim'], 100, 'high')],
  },
  'verilog/de1_soc_stray.v': { role: 'rtl', units: [u('DE1_SoC', ['assign-delay', 'board-ports'], 0, 'low')] },
};

function u(unit: string, rules: string[], score: number, confidence: Confidence): Expected {
  return { unit, rules, score, strong: confidence === 'high', confidence };
}

describe('the detector fixtures (§ 7.1)', () => {
  test('every fixture is in the table', () => {
    expect([...FIXTURES.keys()].sort()).toEqual(Object.keys(GOLDEN).sort());
  });

  test.each(Object.entries(GOLDEN))('%s', (path, expected) => {
    const prefix = path.startsWith('vhdl/') ? 'vhdl-' : 'vlog-';
    const analysis = analyzeFile(fixtureFile(path));
    expect(analysis?.role).toBe(expected.role);
    const actual = analysis?.units.map((unit) => ({
      unit: unit.name,
      rules: [...new Set(unit.evidence.map((e) => e.ruleId.slice(prefix.length)))].sort(),
      score: unit.summary.score,
      strong: unit.summary.hasStrongEvidence,
      confidence: unit.confidence,
    }));
    expect(actual).toEqual(expected.units.map((e) => ({ ...e, rules: [...e.rules].sort() })));
  });
});
