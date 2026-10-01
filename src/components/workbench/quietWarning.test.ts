// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The backend's warning about an extra input the board holds at 0
 * (server/src/engines/unconnectedPorts.ts): a `!` in the gutter with its tooltip, and
 * nothing else in the editor — no inline text, no tint, no dot on the file's tab, no
 * jump — because a port meant for a testbench is no mistake.
 */

import { describe, expect, test } from 'vitest';
import { revealTarget } from './diagnosticAdvice';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { addToFiles, countSeverities, isMutedLine, isQuietLine, NO_DIAGNOSTICS } from './diagnosticStore';
import { describeLine, inlineText, summarize } from './diagnosticText';

const WARNING = [
  'Warning: `Dummy` (DE1_SoC.vhdl, line 21) is not a board input, so the board holds it at 0.',
  '  Not a syntax error: a port like this is normal in a design meant for a testbench. To drive it, simulate a testbench that instantiates DE1_SoC.',
].join('\n');

const MESSAGE = '`Dummy` (DE1_SoC.vhdl, line 21) is not a board input, so the board holds it at 0.';

function located(diagnostic: ReturnType<typeof parseDiagnostics>[number]): LocatedDiagnostic {
  const { fileName: _name, ...rest } = diagnostic;
  return { ...rest, fileId: 'top' };
}

describe('a quiet warning from the backend', () => {
  test('is read as a quiet warning on its line; the advice line is not a diagnostic', () => {
    expect(parseDiagnostics(WARNING)).toEqual([
      { fileName: 'DE1_SoC.vhdl', line: 21, severity: 'warning', message: MESSAGE, details: [], quiet: true },
    ]);
  });

  test('is not read from other text that starts with "Warning:"', () => {
    expect(parseDiagnostics('Warning: something happened')).toEqual([]);
  });

  test('keeps its gutter mark and tooltip, but has no inline text, tint, tab count or status line', () => {
    const lines = addToFiles(NO_DIAGNOSTICS, parseDiagnostics(WARNING).map(located)).top;
    const [line] = lines;
    expect(line.severity).toBe('warning');
    expect(describeLine(line)).toBe(`warning: ${MESSAGE}`);
    expect(inlineText(line)).toBe('');
    expect(isQuietLine(line)).toBe(true);
    expect(isMutedLine(line)).toBe(true);
    expect(countSeverities(lines)).toEqual({ errors: 0, warnings: 0 });
    expect(summarize('DE1_SoC.vhdl', lines)).toBe('');
  });

  test('is never where the editor jumps', () => {
    expect(revealTarget(parseDiagnostics(WARNING).map(located))).toBeUndefined();
  });

  test('leaves an ordinary warning on another line as it was', () => {
    const ordinary = 'DE1_SoC.vhdl:9:5:warning: unused signal';
    const lines = addToFiles(NO_DIAGNOSTICS, parseDiagnostics(`${WARNING}\n${ordinary}`).map(located)).top;
    expect(countSeverities(lines)).toEqual({ errors: 0, warnings: 1 });
    expect(inlineText(lines[0])).toBe('unused signal');
  });
});
