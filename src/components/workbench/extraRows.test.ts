// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { LineDiagnostic } from './diagnosticStore';
import {
  countExtraRows,
  drawnRows,
  extraRowsByLine,
  hasMessageRows,
  widestColumns,
  wrapWords,
  type EditorWidth,
} from './extraRows';

const FIX = { addUseClause: { library: 'ieee', name: 'numeric_std' } };

function marked(line: number, message: string, options: { fix?: boolean; followOnOf?: number } = {}): LineDiagnostic {
  const advice = { ...(options.fix && { fix: FIX }), ...(options.followOnOf && { followOnOf: options.followOnOf }) };
  return { line, severity: 'error', messages: [{ severity: 'error', message, details: [], advice }] };
}

const WIDE: EditorWidth = { visibleColumns: 200, widestColumns: 40, tabSize: 4 };
const NARROW: EditorWidth = { visibleColumns: 30, widestColumns: 40, tabSize: 4 };

describe('wrapWords', () => {
  test('keeps a short text on one row', () => {
    expect(wrapWords('no declaration', 20)).toEqual(['no declaration']);
  });

  test('breaks at spaces, never past the width', () => {
    expect(wrapWords('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });

  test('cuts a word longer than a row', () => {
    expect(wrapWords('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('extraRowsByLine', () => {
  const lines = ['    q <= unsigned(d);', 'end;'];

  test('nothing under a line whose message fits after the code', () => {
    expect(extraRowsByLine([marked(1, 'short')], lines, WIDE).size).toBe(0);
  });

  test('a message that reaches past the widest line goes on rows below it, indented like the code and wrapped to the view', () => {
    const rows = extraRowsByLine([marked(1, 'a message far too long to fit after this line')], lines, NARROW).get(1);
    expect(rows).toEqual([
      { kind: 'message', severity: 'error', indent: 4, text: 'a message far too long to' },
      { kind: 'message', severity: 'error', indent: 4, text: 'fit after this line' },
    ]);
  });

  test('a message within the widest line stays inline: it can be scrolled to', () => {
    const rows = extraRowsByLine([marked(2, 'fits up to forty')], lines, { ...NARROW, visibleColumns: 10 });
    expect(rows.size).toBe(0);
  });

  test('a Quick Fix gets a row under the line, after the message rows', () => {
    const rows = extraRowsByLine([marked(1, 'short', { fix: true })], lines, WIDE).get(1);
    expect(rows).toEqual([{ kind: 'fix', indent: 4, fix: FIX, line: 1 }]);
  });

  test('a muted follow-on gets no rows: it has no inline text and offers no fix', () => {
    const rows = extraRowsByLine([marked(1, 'x'.repeat(80), { fix: true, followOnOf: 1 })], lines, NARROW);
    expect(rows.size).toBe(0);
  });
});

describe('drawn rows', () => {
  const extra = extraRowsByLine(
    [marked(1, 'a message far too long to fit after this line', { fix: true })],
    ['    q <= unsigned(d);', 'end;'],
    NARROW,
  );

  test('each line, then its extra rows', () => {
    expect(drawnRows(2, extra)).toEqual([
      { line: 0, extra: false },
      { line: 0, extra: true },
      { line: 0, extra: true },
      { line: 0, extra: true },
      { line: 1, extra: false },
    ]);
  });

  test('counts the extra rows, and tells message rows from a fix alone', () => {
    expect(countExtraRows(extra)).toBe(3);
    expect(hasMessageRows(extra.get(1))).toBe(true);
    expect(hasMessageRows([{ kind: 'fix', indent: 0, fix: FIX, line: 1 }])).toBe(false);
  });
});

describe('widestColumns', () => {
  test('counts a tab to the next tab stop', () => {
    expect(widestColumns(['ab', '\tabc'], 4)).toBe(7);
  });
});
