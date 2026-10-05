// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { ConsoleLine } from './ConsoleOutput';
import { consoleBlocks, parseGhdlReport, readableSimTime } from './ghdlReport';

describe('parseGhdlReport', () => {
  test('reads a report note', () => {
    expect(parseGhdlReport('and_gate_truthtable_tb.vhd:31:9:@0ms:(report note): AND Truth Table')).toEqual({
      file: 'and_gate_truthtable_tb.vhd',
      line: 31,
      simTime: '0ms',
      kind: 'report',
      severity: 'note',
      text: 'AND Truth Table',
    });
  });

  test('reads a failed assertion', () => {
    const report = parseGhdlReport("adder.vhdl:52:13:@40ns:(assertion error): ERROR: '1' AND '1' should be '1'");
    expect([report?.kind, report?.severity, report?.text]).toEqual(['assertion', 'error', "ERROR: '1' AND '1' should be '1'"]);
  });

  test('keeps an empty message and a message over several lines', () => {
    expect(parseGhdlReport('a.vhd:1:1:@0ms:(report note): ')?.text).toBe('');
    expect(parseGhdlReport('a.vhd:1:1:@0ms:(report note): one\ntwo')?.text).toBe('one\ntwo');
  });

  test.each([
    'Simulation running ...',
    'GHDL 6.0.0 (6.0.0.r0.ge589c698c.dirty) [Dunoon edition]',
    'and_gate_truthtable_tb.v:57: $finish called at 40000 (1ps)',
    'counter.vhd:12:5: error: no declaration for "cnt"',
  ])('is nothing for any other line: %s', (text) => {
    expect(parseGhdlReport(text)).toBeUndefined();
  });
});

test('readableSimTime puts a space before the unit', () => {
  expect([readableSimTime('0ms'), readableSimTime('40ns'), readableSimTime('1.5us'), readableSimTime('odd')]).toEqual([
    '0 ms',
    '40 ns',
    '1.5 us',
    'odd',
  ]);
});

describe('consoleBlocks', () => {
  const line = (id: number, text: string): ConsoleLine => ({ id, time: '13:47:44', text });

  test('groups consecutive report lines and keeps every other line on its own, in order', () => {
    const blocks = consoleBlocks([
      line(1, 'Simulation running ...'),
      line(2, 'tb.vhd:31:9:@0ms:(report note): AND Truth Table'),
      line(3, 'tb.vhd:52:13:@10ns:(report note): 0 0 | 0'),
      line(4, 'Simulation complete.'),
      line(5, 'tb.vhd:72:9:@40ns:(report note): again'),
    ]);
    expect(blocks.map((b) => (b.kind === 'line' ? b.line.id : b.rows.map((r) => r.line.id)))).toEqual([1, [2, 3], 4, [5]]);
  });

  test('is empty for an empty console', () => {
    expect(consoleBlocks([])).toEqual([]);
  });
});
