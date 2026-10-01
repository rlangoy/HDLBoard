// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The backend's warning about a port the board does not connect
 * (server/src/engines/extraPorts.ts): a `!` in the gutter with its tooltip, and
 * nothing else in the editor — no inline text, no tint, no dot on the file's tab, no
 * jump — because a port meant for a testbench is no mistake.
 */

import { describe, expect, test } from 'vitest';
import { revealTarget } from './diagnosticAdvice';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { parseDiagnostics, type Diagnostic } from './diagnostics';
import { addToFiles, countSeverities, isMutedLine, isQuietLine, NO_DIAGNOSTICS, type LineDiagnostic } from './diagnosticStore';
import { describeLine, inlineText, summarize } from './diagnosticText';

const MESSAGE = '`Dummy` (DE1_SoC.vhdl, line 21) is not a board input, so the board holds it at 0.';
const ADVICE =
  '  Not a syntax error: a port like this is normal in a design meant for a testbench. ' +
  'To drive it, simulate a testbench that instantiates DE1_SoC.';
const WARNING = `Warning: ${MESSAGE}\n${ADVICE}`;

function located({ fileName: _name, ...rest }: Diagnostic): LocatedDiagnostic {
  return { ...rest, fileId: 'top' };
}

function storedLines(text: string): readonly LineDiagnostic[] {
  return addToFiles(NO_DIAGNOSTICS, parseDiagnostics(text).map(located)).top;
}

describe('reading the backend\'s warning', () => {
  test('is a quiet warning on the line it names; the advice line is no diagnostic', () => {
    expect(parseDiagnostics(WARNING)).toEqual([
      { fileName: 'DE1_SoC.vhdl', line: 21, severity: 'warning', message: MESSAGE, details: [], quiet: true },
    ]);
  });

  test('ignores other text that starts with "Warning:"', () => {
    expect(parseDiagnostics('Warning: something happened')).toEqual([]);
  });
});

describe('showing the backend\'s warning', () => {
  const [line] = storedLines(WARNING);

  test('keeps the warning and its gutter tooltip', () => {
    expect(describeLine(line)).toBe(`warning: ${MESSAGE}`);
  });

  test('has no text after the line', () => {
    expect(inlineText(line)).toBe('');
  });

  test('marks the line quiet, so it is not tinted', () => {
    expect(isQuietLine(line)).toBe(true);
  });

  test('marks the line muted, so it is left out of the status line', () => {
    expect(isMutedLine(line)).toBe(true);
    expect(summarize('DE1_SoC.vhdl', [line])).toBe('');
  });

  test('is not counted on the file\'s tab', () => {
    expect(countSeverities([line])).toEqual({ errors: 0, warnings: 0 });
  });

  test('is never where the editor jumps', () => {
    expect(revealTarget(parseDiagnostics(WARNING).map(located))).toBeUndefined();
  });

  test('leaves an ordinary warning on another line as it was', () => {
    const lines = storedLines(`${WARNING}\nDE1_SoC.vhdl:9:5:warning: unused signal`);
    expect(countSeverities(lines)).toEqual({ errors: 0, warnings: 1 });
  });
});
