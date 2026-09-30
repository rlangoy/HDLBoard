// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { DiagnosticSeverity } from './diagnostics';
import type { LocatedDiagnostic } from './diagnosticLocation';
import {
  addToFiles,
  countSeverities,
  MAX_MARKED_LINES_PER_FILE,
  MAX_MESSAGES_PER_LINE,
  NO_DIAGNOSTICS,
  withoutFile,
  type DiagnosticsByFile,
} from './diagnosticStore';

function at(line: number, message = 'm', severity: DiagnosticSeverity = 'error', fileId = 'a'): LocatedDiagnostic {
  return { fileId, line, severity, message, details: [] };
}

function numbered(count: number): LocatedDiagnostic[] {
  return Array.from({ length: count }, (_, i) => at(1, `message ${i}`));
}

describe('addToFiles', () => {
  test('S-1: two messages on one line share one LineDiagnostic', () => {
    expect(addToFiles(NO_DIAGNOSTICS, [at(3, 'x'), at(3, 'y')]).a).toHaveLength(1);
  });

  test('S-2: the same message twice is stored once', () => {
    expect(addToFiles(NO_DIAGNOSTICS, [at(3), at(3)]).a[0].messages).toHaveLength(1);
  });

  test('S-3: a warning then an error make the line an error', () => {
    expect(addToFiles(NO_DIAGNOSTICS, [at(3, 'w', 'warning'), at(3, 'e', 'error')]).a[0].severity).toBe('error');
  });

  test('S-4: lines added out of order are stored ascending', () => {
    expect(addToFiles(NO_DIAGNOSTICS, [at(9), at(3)]).a.map((l) => l.line)).toEqual([3, 9]);
  });

  test('S-5: only MAX_MESSAGES_PER_LINE messages are kept per line', () => {
    expect(addToFiles(NO_DIAGNOSTICS, numbered(MAX_MESSAGES_PER_LINE + 1)).a[0].messages).toHaveLength(MAX_MESSAGES_PER_LINE);
  });

  test('S-6: only MAX_MARKED_LINES_PER_FILE lines are kept per file', () => {
    const many = Array.from({ length: MAX_MARKED_LINES_PER_FILE + 1 }, (_, i) => at(i + 1));
    expect(addToFiles(NO_DIAGNOSTICS, many).a).toHaveLength(MAX_MARKED_LINES_PER_FILE);
  });

  test('S-9: the input is not mutated', () => {
    const before = addToFiles(NO_DIAGNOSTICS, [at(1)]);
    const copy = structuredClone(before);
    addToFiles(before, [at(1, 'other'), at(2)]);
    expect(before).toEqual(copy);
  });

  test('S-20: only a duplicate returns the same object', () => {
    const stored = addToFiles(NO_DIAGNOSTICS, [at(1)]);
    expect(addToFiles(stored, [at(1)])).toBe(stored);
  });

  test('S-21: a full line returns the same object', () => {
    const stored = addToFiles(NO_DIAGNOSTICS, numbered(MAX_MESSAGES_PER_LINE));
    expect(addToFiles(stored, [at(1, 'one more')])).toBe(stored);
  });
});

describe('withoutFile', () => {
  const two: DiagnosticsByFile = addToFiles(NO_DIAGNOSTICS, [at(1, 'm', 'error', 'a'), at(1, 'm', 'error', 'b')]);

  test('S-7: removes only the given file', () => {
    expect(Object.keys(withoutFile(two, 'a'))).toEqual(['b']);
  });

  test('S-8: a file with no entry returns the same object', () => {
    expect(withoutFile(two, 'zzz')).toBe(two);
  });
});

describe('countSeverities', () => {
  test('S-10: counts messages, not lines', () => {
    const stored = addToFiles(NO_DIAGNOSTICS, [at(1, 'a'), at(1, 'b'), at(2, 'c', 'warning')]);
    expect(countSeverities(stored.a)).toEqual({ errors: 2, warnings: 1 });
  });
});
