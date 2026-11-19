// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { AdvisedDiagnostic } from '../diagnosticAdvice';
import { quietFile, showFile, withQuieted } from './findingDiagnostics';

const live = ([fileId, line, headline]: [string, number, string], quiet = false): AdvisedDiagnostic => ({
  fileId,
  line,
  severity: 'warning',
  message: `${headline} (why)`,
  details: [],
  ...(quiet && { quiet: true }),
  advice: { headline, compiler: 'HDLBoard design check', liveCheck: true },
});

const A = live(['a.vhd', 22, "Can't infer a register for `count`."]);
const A2 = live(['a.vhd', 30, '`after` is ignored on the hardware.']);
const B = live(['b.vhd', 5, "Can't infer a register for `x`."]);
const REPORT = live(['a.vhd', 40, '`report` / `assert` only print in simulation.'], true);
const NONE: ReadonlySet<string> = new Set();

describe('a click in the editor quiets the file\'s live warnings; a console link shows them again', () => {
  test('nothing is quiet at first', () => {
    expect(withQuieted([A, A2, B], NONE)).toEqual([A, A2, B]);
  });

  test('a click quiets every warning of that file, and no other file', () => {
    const quieted = quietFile(NONE, [A, A2, B], 'a.vhd');
    expect(withQuieted([A, A2, B], quieted).map((d) => [d.fileId, d.line, d.quiet === true])).toEqual([
      ['a.vhd', 22, true],
      ['a.vhd', 30, true],
      ['b.vhd', 5, false],
    ]);
  });

  test('a quiet warning stays quiet when lines above it move', () => {
    const quieted = quietFile(NONE, [A], 'a.vhd');
    expect(withQuieted([{ ...A, line: 25 }], quieted)[0].quiet).toBe(true);
  });

  test('a new problem in the file is not hidden by an old click', () => {
    const quieted = quietFile(NONE, [A], 'a.vhd');
    expect(withQuieted([A, A2], quieted)[1].quiet).toBeUndefined();
  });

  test('a console link to the file shows its warnings again', () => {
    const quieted = showFile(quietFile(quietFile(NONE, [A, B], 'a.vhd'), [A, B], 'b.vhd'), 'a.vhd');
    expect(withQuieted([A, B], quieted).map((d) => d.quiet === true)).toEqual([false, true]);
  });

  test('a warning that is always quiet stays as it is, and a second click changes nothing', () => {
    const once = quietFile(NONE, [A, REPORT], 'a.vhd');
    expect(quietFile(once, [A, REPORT], 'a.vhd')).toBe(once);
    expect(withQuieted([REPORT], once)).toEqual([REPORT]);
  });
});
