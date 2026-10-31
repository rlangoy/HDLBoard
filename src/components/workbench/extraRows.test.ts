// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { LineDiagnostic } from './diagnosticStore';
import {
  countExtraRows,
  drawnRows,
  extraRowsAbove,
  extraRowsByLine,
  hasMessageRows,
  wrapWords,
  type EditorWidth,
  type ExtraRow,
  type ExtraRowsByLine,
} from './extraRows';

const FIX = { addUseClause: { library: 'ieee', name: 'numeric_std' } };

function marked(line: number, message: string, options: { fix?: boolean; followOnOf?: number } = {}): LineDiagnostic {
  const advice = { ...(options.fix && { fix: FIX }), ...(options.followOnOf && { followOnOf: options.followOnOf }) };
  return { line, severity: 'error', messages: [{ severity: 'error', message, details: [], advice }] };
}

const WIDE: EditorWidth = { visibleColumns: 200, tabSize: 4 };
const NARROW: EditorWidth = { visibleColumns: 30, tabSize: 4 };

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

  test('a message that does not fit in the view goes on rows below its line, indented like the code and wrapped to the view', () => {
    const rows = extraRowsByLine([marked(1, 'a message far too long to fit after this line')], lines, NARROW).get(1);
    expect(rows).toEqual([
      { kind: 'message', severity: 'error', indent: 4, text: 'a message far too long to' },
      { kind: 'message', severity: 'error', indent: 4, text: 'fit after this line' },
    ]);
  });

  test('a message that could be scrolled to, but is not seen whole, goes below too', () => {
    const longLines = ['end;', 'x'.repeat(100)];
    expect(extraRowsByLine([marked(1, 'twenty-six characters long')], longLines, NARROW).get(1)?.[0]?.kind).toBe('message');
  });

  test('a message seen whole after the code stays there', () => {
    expect(extraRowsByLine([marked(2, 'fits in the view')], lines, NARROW).size).toBe(0);
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


describe('extraRowsAbove', () => {
  const message = { kind: 'message' } as unknown as ExtraRow;
  const extra: ExtraRowsByLine = new Map([[3, [message, message]], [7, [message]]]);

  test('counts the rows drawn above a line, not those under it', () => {
    expect(extraRowsAbove(3, extra)).toBe(0);
    expect(extraRowsAbove(4, extra)).toBe(2);
    expect(extraRowsAbove(7, extra)).toBe(2);
    expect(extraRowsAbove(8, extra)).toBe(3);
  });
});
