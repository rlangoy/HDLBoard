// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { AdvisedDiagnostic } from '../diagnosticAdvice';
import { NO_QUIET_WARNINGS, onlyFiles, quietFile, showFile, showLine, withQuieted, type Warned } from './quietWarnings';

const live = ([fileId, line, headline]: [string, number, string], quiet = false): AdvisedDiagnostic => ({
  fileId,
  line,
  severity: 'warning',
  message: `${headline} (why)`,
  details: [],
  ...(quiet && { quiet: true }),
  advice: { headline, compiler: 'HDLBoard design check', liveCheck: true },
});

/** The warnings, with each line's code: `code` by line number, else the same code on every line. */
const warned = (warnings: readonly AdvisedDiagnostic[], code: Readonly<Record<number, string>> = {}): Warned<AdvisedDiagnostic> => ({
  warnings,
  lineText: (_fileId, line) => code[line] ?? 'x <= y;',
});
const quietFlags = (w: Warned<AdvisedDiagnostic>, quiet = NONE) => withQuieted(w, quiet).map((d) => d.quiet === true);

const A = live(['a.vhd', 22, "Can't infer a register for `count`."]);
const A2 = live(['a.vhd', 30, '`after` is ignored on the hardware.']);
const B = live(['b.vhd', 5, "Can't infer a register for `x`."]);
const REPORT = live(['a.vhd', 40, '`report` / `assert` only print in simulation.'], true);
const NONE = NO_QUIET_WARNINGS;

describe('a click in the editor quiets the file\'s live warnings; a console link shows them again', () => {
  test('nothing is quiet at first', () => {
    expect(withQuieted(warned([A, A2, B]), NONE)).toEqual([A, A2, B]);
  });

  test('a click quiets every warning of that file, and no other file', () => {
    const quieted = quietFile(NONE, warned([A, A2, B]), 'a.vhd');
    expect(quietFlags(warned([A, A2, B]), quieted)).toEqual([true, true, false]);
  });

  test('a quiet warning stays quiet when lines above it move', () => {
    const quieted = quietFile(NONE, warned([A]), 'a.vhd');
    expect(quietFlags(warned([{ ...A, line: 25 }]), quieted)).toEqual([true]);
  });

  test('a new problem in the file is not hidden by an old click', () => {
    const quieted = quietFile(NONE, warned([A]), 'a.vhd');
    expect(quietFlags(warned([A, A2]), quieted)).toEqual([true, false]);
  });

  test('a console link to the file shows its warnings again', () => {
    const quieted = showFile(quietFile(quietFile(NONE, warned([A, B]), 'a.vhd'), warned([A, B]), 'b.vhd'), 'a.vhd');
    expect(quietFlags(warned([A, B]), quieted)).toEqual([false, true]);
  });

  test('a warning that is always quiet stays as it is, and a second click changes nothing', () => {
    const once = quietFile(NONE, warned([A, REPORT]), 'a.vhd');
    expect([quietFile(once, warned([A, REPORT]), 'a.vhd') === once, withQuieted(warned([REPORT]), once)[0]]).toEqual([true, REPORT]);
  });

  test('a click on a line number or its ! shows the warnings of that line only', () => {
    const quieted = showLine(quietFile(NONE, warned([A, A2]), 'a.vhd'), warned([A, A2]), { fileId: 'a.vhd', line: 22 });
    expect(quietFlags(warned([A, A2]), quieted)).toEqual([false, true]);
  });

  test('a click on a line without a warning changes nothing', () => {
    const quieted = quietFile(NONE, warned([A, A2]), 'a.vhd');
    expect(showLine(quieted, warned([A, A2]), { fileId: 'a.vhd', line: 3 })).toBe(quieted);
  });
});

describe('two warnings with the same headline are two warnings', () => {
  const HEADLINE = '`wait for` only works in simulation.';
  const W1 = live(['a.vhd', 10, HEADLINE]);
  const W2 = live(['a.vhd', 20, HEADLINE]);

  test('restoring the first line restores only the first', () => {
    const quieted = showLine(quietFile(NONE, warned([W1, W2]), 'a.vhd'), warned([W1, W2]), { fileId: 'a.vhd', line: 10 });
    expect(quietFlags(warned([W1, W2]), quieted)).toEqual([false, true]);
  });

  test('a new one below the dismissed ones is not taken for one of them', () => {
    const quieted = quietFile(NONE, warned([W1]), 'a.vhd');
    expect(quietFlags(warned([W1, W2]), quieted)).toEqual([true, false]);
  });

  test('a copy inserted above a dismissed one does not take its dismissal (review 2)', () => {
    const before = warned([W1], { 10: 'wait for 10 ns;' });
    const quieted = quietFile(NONE, before, 'a.vhd');
    // A new `wait for 5 ns;` on line 5 pushes the dismissed line to 11.
    const inserted = live(['a.vhd', 5, HEADLINE]);
    const moved = { ...W1, line: 11 };
    expect(quietFlags(warned([inserted, moved], { 5: 'wait for 5 ns;', 11: 'wait for 10 ns;' }), quieted)).toEqual([false, true]);
  });

  test('an exact copy inserted above: as many stay quiet as before, the copy being the one (a known limit)', () => {
    const quieted = quietFile(NONE, warned([W1], { 10: 'wait for 10 ns;' }), 'a.vhd');
    const copy = live(['a.vhd', 5, HEADLINE]);
    const moved = { ...W1, line: 11 };
    expect(quietFlags(warned([copy, moved], { 5: 'wait for 10 ns;', 11: 'wait for 10 ns;' }), quieted)).toEqual([true, false]);
  });

  test('editing the warned line shows the warning again', () => {
    const quieted = quietFile(NONE, warned([W1], { 10: 'wait for 10 ns;' }), 'a.vhd');
    expect(quietFlags(warned([W1], { 10: 'wait for 20 ns;' }), quieted)).toEqual([false]);
  });
});

describe('a deleted file', () => {
  test('takes its dismissals with it', () => {
    const quieted = quietFile(quietFile(NONE, warned([A, B]), 'a.vhd'), warned([A, B]), 'b.vhd');
    expect([...onlyFiles(quieted, new Set(['b.vhd'])).keys()]).toEqual(['b.vhd']);
  });
});
