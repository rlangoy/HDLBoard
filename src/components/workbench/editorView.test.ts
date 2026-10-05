// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { analyzeFile } from './tbDetect/analyzeProject';
import { fixtureFile } from './tbDetect/fixtures.testSupport';
import type { Confidence, EditorPair } from './tbDetect/types';
import { anchorRoleView, narrowView, pairKey, resolveView, routeRun, runTargetFor, showsSuggestion, withCurrentUnit, type EditorView, type PairEvent, type SplitPreference } from './editorView';

/** docs/impl_split_screen.md § 4.2, § 6.3, D24. */

type DesignSide = 'paired' | 'missingDut' | 'none';

function pair(anchor: 'tb' | 'rtl', confidence: Confidence, design: DesignSide, hasTb = true): EditorPair {
  return {
    anchorId: anchor === 'tb' ? 'tb.vhd' : 'rtl.vhd',
    tb: hasTb ? { fileId: 'tb.vhd', line: 1, unitName: 'x_tb' } : null,
    rtl: design === 'paired' || anchor === 'rtl' ? { fileId: 'rtl.vhd', line: 1, unitName: 'x' } : null,
    tbConfidence: hasTb ? confidence : 'low',
    missingDut: design === 'missingDut' ? 'x' : null,
  };
}

describe('resolveView', () => {
  const preferences: SplitPreference[] = ['auto', 'always', 'never'];
  const confidences: Confidence[] = ['low', 'medium', 'high'];
  const events: PairEvent[] = ['open', 'run'];
  const sides: DesignSide[] = ['paired', 'missingDut', 'none'];

  test('a pin wins over every preference, confidence and event (B6)', () => {
    for (const p of preferences) for (const c of confidences) for (const e of events) {
      expect(resolveView(pair('rtl', c, 'paired'), p, 'rtl', e)).toBe('rtl');
    }
  });

  test.each(sides)('Automatic, testbench anchor, design side %s: the design side never decides (B2)', (side) => {
    const expected: Record<Confidence, Record<PairEvent, EditorView>> = {
      high: { open: 'both', run: 'both' },
      medium: { open: 'tb', run: 'both' },
      low: { open: 'tb', run: 'tb' },
    };
    for (const c of confidences) for (const e of events) {
      expect(resolveView(pair('tb', c, side), 'auto', undefined, e), `${c} ${e}`).toBe(expected[c][e]);
    }
  });

  test('Automatic, design anchor with no testbench: single RTL pane', () => {
    expect(resolveView(pair('rtl', 'low', 'paired', false), 'auto', undefined, 'run')).toBe('rtl');
  });

  test('Never: the anchor\'s own role, even on Simulate', () => {
    expect(resolveView(pair('tb', 'high', 'paired'), 'never', undefined, 'run')).toBe('tb');
    expect(resolveView(pair('rtl', 'high', 'paired'), 'never', undefined, 'run')).toBe('rtl');
  });

  test('Always: both whenever there is a testbench, however weak', () => {
    for (const c of confidences) expect(resolveView(pair('rtl', c, 'paired'), 'always', undefined, 'open')).toBe('both');
    expect(resolveView(pair('tb', 'low', 'none'), 'always', undefined, 'open')).toBe('both');
  });

  test('Always: a design with no testbench keeps a single pane, as in Automatic', () => {
    for (const e of events) expect(resolveView(pair('rtl', 'low', 'paired', false), 'always', undefined, e)).toBe('rtl');
  });
});

test('anchorRoleView: a self pair anchors at RTL', () => {
  const self: EditorPair = { anchorId: 'a', tb: { fileId: 'a', line: 1, unitName: 't' }, rtl: { fileId: 'a', line: 1, unitName: 'r' }, tbConfidence: 'high', missingDut: null };
  expect(anchorRoleView(self)).toBe('rtl');
  expect(pairKey(self)).toBe('a|a');
});

test('showsSuggestion', () => {
  const medium = pair('tb', 'medium', 'none');
  expect(showsSuggestion(medium, 'auto', undefined, 'tb', false)).toBe(true);
  expect(showsSuggestion(medium, 'auto', undefined, 'tb', true)).toBe(false);
  expect(showsSuggestion(medium, 'auto', 'tb', 'tb', false)).toBe(false);
  expect(showsSuggestion(medium, 'never', undefined, 'tb', false)).toBe(false);
  expect(showsSuggestion(medium, 'auto', undefined, 'both', false)).toBe(false);
  expect(showsSuggestion(pair('tb', 'low', 'none'), 'auto', undefined, 'tb', false)).toBe(false);
});

describe('runTargetFor', () => {
  const counter = analyzeFile(fixtureFile('vhdl/counter.vhd'));
  const mixed = analyzeFile(fixtureFile('verilog/alu_tb.v'));

  test('a one-unit design from the RTL pane: no target (B7)', () => {
    expect(runTargetFor({ fileId: 'c', line: 1, unitName: 'counter' }, counter, 'rtl')).toBeNull();
  });

  test('a mixed file\'s design from the RTL pane names it (R-3)', () => {
    expect(runTargetFor({ fileId: 'a', line: 1, unitName: 'alu' }, mixed, 'rtl')).toBe('alu');
  });

  test('the TB pane always names its unit', () => {
    expect(runTargetFor({ fileId: 'a', line: 1, unitName: 'alu_tb' }, mixed, 'tb')).toBe('alu_tb');
  });
});

describe('withCurrentUnit', () => {
  const mixed = analyzeFile(fixtureFile('vhdl/alu_with_tb.vhd'));
  const shown = (unitName: string | null) => ({ fileId: 'a', line: 1, unitName });

  test('keeps the pane’s unit while the file declares it, case-insensitively for VHDL', () => {
    expect(withCurrentUnit(shown('ALU'), mixed, 'rtl').unitName).toBe('alu');
  });

  test('a unit renamed since the pane opened: the file’s first unit of the pane’s role', () => {
    expect(withCurrentUnit(shown('old_tb'), mixed, 'tb').unitName).toBe('alu_tb');
    expect(withCurrentUnit(shown('old'), mixed, 'rtl').unitName).toBe('alu');
  });

  test('keeps the rest of the target', () => {
    expect(withCurrentUnit(shown('old_tb'), mixed, 'tb')).toEqual({ fileId: 'a', line: 1, unitName: 'alu_tb' });
  });

  test('no unit for a file not analysed', () => {
    expect(withCurrentUnit(shown('gone'), undefined, 'tb').unitName).toBeNull();
  });
});

describe('routeRun (D24)', () => {
  test('R-8: a mixed file runs its testbench unit, named', () => {
    expect(routeRun(analyzeFile(fixtureFile('vhdl/alu_with_tb.vhd')), null)).toEqual({ unitName: 'alu_tb', pane: 'tb', runTarget: 'alu_tb' });
  });

  test('R-9: a one-unit testbench runs without a target', () => {
    expect(routeRun(analyzeFile(fixtureFile('vhdl/counter_tb.vhd')), null)).toEqual({ unitName: 'counter_tb', pane: 'tb', runTarget: null });
  });

  test('R-10: a one-unit design runs without a target', () => {
    expect(routeRun(analyzeFile(fixtureFile('vhdl/counter.vhd')), null)).toEqual({ unitName: 'counter', pane: 'rtl', runTarget: null });
  });

  test('a remembered topUnit wins while it exists, case-insensitively for VHDL', () => {
    const file = analyzeFile(fixtureFile('vhdl/alu_with_tb.vhd'));
    expect(routeRun(file, 'ALU')).toEqual({ unitName: 'alu', pane: 'rtl', runTarget: 'alu' });
    expect(routeRun(file, 'gone').unitName).toBe('alu_tb');
  });
});

test('narrowView: Both shows the focused pane only when the column cannot split (§ 4.9)', () => {
  expect([narrowView('both', 'tb', false), narrowView('both', 'tb', true), narrowView('rtl', 'tb', false)]).toEqual(['tb', 'both', 'rtl']);
});

test('a pin never hides the file being opened', () => {
  const opened: EditorPair = { anchorId: 'tb.vhd', tb: { fileId: 'tb.vhd', line: 1, unitName: 'x_tb' }, rtl: { fileId: 'rtl.vhd', line: 1, unitName: 'x' }, tbConfidence: 'high', missingDut: null };
  expect([resolveView(opened, 'auto', 'rtl', 'open'), resolveView(opened, 'auto', 'tb', 'open')]).toEqual(['tb', 'tb']);
});
