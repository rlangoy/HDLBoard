// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { Advice, AdvisedDiagnostic } from './diagnosticAdvice';
import type { DiagnosticSeverity } from './diagnostics';
import type { LocatedDiagnostic } from './diagnosticLocation';
import {
  addToFiles,
  byDisplayOrder,
  countSeverities,
  hintLines,
  isFollowOnLine,
  MAX_MARKED_LINES_PER_FILE,
  MAX_MESSAGES_PER_LINE,
  NO_DIAGNOSTICS,
  visibleSpans,
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

// ---- advice (docs/editor_diagnostics_improvement_plan.md § 4.1, § 4.10)

const ADVICE: Advice = { headline: 'h', span: { start: 4, end: 9 } };
const FOLLOW_ON: Advice = { headline: 'f', followOnOf: 3 };

function advised(line: number, message: string, advice: Advice): AdvisedDiagnostic {
  return { ...at(line, message), advice };
}

describe('advice in the store', () => {
  test('is kept with its message', () => {
    expect(addToFiles(NO_DIAGNOSTICS, [advised(3, 'x', ADVICE)]).a[0].messages[0].advice).toBe(ADVICE);
  });

  test('does not change the dedup: the same compiler text is stored once', () => {
    expect(addToFiles(NO_DIAGNOSTICS, [advised(3, 'x', ADVICE), at(3, 'x')]).a[0].messages).toHaveLength(1);
  });

  test('muted follow-ons come after the other messages of a line', () => {
    const [line] = addToFiles(NO_DIAGNOSTICS, [advised(3, 'late', FOLLOW_ON), at(3, 'w', 'warning')]).a;
    expect([...line.messages].sort(byDisplayOrder).map((m) => m.message)).toEqual(['w', 'late']);
  });

  test('countSeverities leaves muted follow-ons out', () => {
    const lines = addToFiles(NO_DIAGNOSTICS, [at(3, 'first'), advised(9, 'late', FOLLOW_ON)]).a;
    expect(countSeverities(lines)).toEqual({ errors: 1, warnings: 0 });
  });

  test('a line of only muted follow-ons is a follow-on line', () => {
    expect(isFollowOnLine(addToFiles(NO_DIAGNOSTICS, [advised(9, 'late', FOLLOW_ON)]).a[0])).toBe(true);
  });

  test('a line with one message that is not muted is not', () => {
    const [line] = addToFiles(NO_DIAGNOSTICS, [at(3, 'first'), advised(3, 'late', FOLLOW_ON)]).a;
    expect(isFollowOnLine(line)).toBe(false);
  });

  test('visibleSpans are the spans of the messages that are not muted', () => {
    const muted: Advice = { ...FOLLOW_ON, span: { start: 0, end: 1 } };
    const [line] = addToFiles(NO_DIAGNOSTICS, [advised(3, 'x', ADVICE), advised(3, 'y', muted)]).a;
    expect(visibleSpans(line)).toEqual([ADVICE.span]);
  });

  test('hintLines maps a line named by a rule to the line that names it', () => {
    const lines = addToFiles(NO_DIAGNOSTICS, [advised(41, 'x', { relatedLine: 40 })]).a;
    expect(hintLines(lines).get(40)?.line).toBe(41);
  });

  test('a line that is marked itself gets no hint', () => {
    const lines = addToFiles(NO_DIAGNOSTICS, [at(40, 'own'), advised(41, 'x', { relatedLine: 40 })]).a;
    expect(hintLines(lines).has(40)).toBe(false);
  });
});
