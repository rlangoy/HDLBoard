// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { Diagnostic } from './diagnostics';
import {
  countLines,
  firstRevealTarget,
  lineHeightOrFallback,
  locateDiagnostics,
  normalizeFileName,
  offsetOfLine,
  type LocatedDiagnostic,
  type RunSnapshot,
} from './diagnosticLocation';
import { filesForRun } from './hdlClient';
import type { VhdlFile } from './files';

const TEXT = 'one\ntwo\nthree';

function file(id: string, name: string, content = TEXT) {
  return { id, name, content };
}

function diag(fileName: string, line = 1, severity: Diagnostic['severity'] = 'error'): Diagnostic {
  return { fileName, line, severity, message: 'm', details: [] };
}

function located(fileId: string, line: number, severity: Diagnostic['severity']): LocatedDiagnostic {
  return { fileId, line, severity, message: 'm', details: [] };
}

function locateIds(diagnostic: Diagnostic, snapshot: RunSnapshot, current = snapshot.files): string[] {
  return locateDiagnostics([diagnostic], snapshot, current).map((l) => l.fileId);
}

describe('locateDiagnostics', () => {
  test('L-1: an exact name is located with that file’s id', () => {
    expect(locateIds(diag('defs.vh'), { files: [file('a', 'defs.vh')] })).toEqual(['a']);
  });

  test('L-2: a case-insensitive match is located', () => {
    expect(locateIds(diag('DEFS.vh'), { files: [file('a', 'defs.vh')] })).toEqual(['a']);
  });

  test('L-3: two files with the same name are ambiguous and dropped', () => {
    expect(locateIds(diag('top.vhdl'), { files: [file('a', 'top.vhdl'), file('b', 'top.vhdl')] })).toEqual([]);
  });

  test('L-4: the generated VHDL wrapper is dropped', () => {
    expect(locateIds(diag('hdl_board_tb.vhdl'), { files: [file('a', 'top.vhdl')] })).toEqual([]);
  });

  test('L-5: the generated timescale file is dropped', () => {
    expect(locateIds(diag('_hdlboard_ts.v'), { files: [file('a', 'top.v')] })).toEqual([]);
  });

  test('L-6: a line past the end of the file is dropped', () => {
    expect(locateIds(diag('a.v', 4), { files: [file('a', 'a.v')] })).toEqual([]);
  });

  test('L-7: a file changed since Start is dropped', () => {
    const snapshot = { files: [file('a', 'a.v')] };
    expect(locateIds(diag('a.v'), snapshot, [file('a', 'a.v', 'edited')])).toEqual([]);
  });

  test('L-8: a file deleted since Start is dropped', () => {
    expect(locateIds(diag('a.v'), { files: [file('a', 'a.v')] }, [])).toEqual([]);
  });

  test('L-9: the reveal target of [warning, error, error] is the first error', () => {
    const list = [located('a', 1, 'warning'), located('a', 5, 'error'), located('a', 7, 'error')];
    expect(firstRevealTarget(list)).toBe(list[1]);
  });

  test('L-10: warnings alone reveal nothing', () => {
    expect(firstRevealTarget([located('a', 1, 'warning')])).toBeUndefined();
  });

  test('L-11: DE1_SoC.v (line 23, then line 19) reveals line 19', () => {
    expect(firstRevealTarget([located('a', 23, 'error'), located('a', 19, 'error')])?.line).toBe(19);
  });

  test('L-12: two case-insensitive matches and no exact match are ambiguous', () => {
    expect(locateIds(diag('defs.vh'), { files: [file('a', 'Defs.vh'), file('b', 'DEFS.vh')] })).toEqual([]);
  });

  test('L-13: an exact match wins over a case-insensitive one', () => {
    expect(locateIds(diag('defs.vh'), { files: [file('a', 'DEFS.vh'), file('b', 'defs.vh')] })).toEqual(['b']);
  });

  test('the reveal target stays in the file of the first error', () => {
    const list = [located('a', 9, 'error'), located('b', 1, 'error'), located('a', 4, 'error')];
    expect(firstRevealTarget(list)?.line).toBe(4);
  });
});

describe('filesForRun', () => {
  const files: VhdlFile[] = [
    { id: '1', name: 'a.vhdl', folder: 'vhdl', content: '' },
    { id: '2', name: 'DE1_SoC.v', folder: 'verilog', content: '' },
    { id: '3', name: 'b.v', folder: 'verilog', content: '' },
    { id: '4', name: 'c.vhdl', folder: 'work', content: '' },
  ];

  test('L-14: a Verilog top selects only the verilog/ files', () => {
    expect(filesForRun(files, 'DE1_SoC.v').map((f) => f.id)).toEqual(['2', '3']);
  });
});

describe('countLines', () => {
  test.each<[string, string, number]>([
    ['L-15a', '', 1],
    ['L-15b', 'a', 1],
    ['L-15c', 'a\n', 2],
    ['L-15d', 'a\r\nb', 2],
  ])('%s: %j', (_id, text, expected) => {
    expect(countLines(text)).toBe(expected);
  });
});

describe('normalizeFileName', () => {
  test.each<[string, string, string]>([
    ['L-16a', './defs.vh', 'defs.vh'],
    ['L-16b', '././x.v', './x.v'],
    ['L-16c', '../x.v', '../x.v'],
    ['L-16d', 'sub/x.v', 'sub/x.v'],
  ])('%s: %s', (_id, printed, expected) => {
    expect(normalizeFileName(printed)).toBe(expected);
  });
});

describe('offsetOfLine and lineHeightOrFallback', () => {
  test('S-16: line 3 of "a\\nbb\\nccc" starts at 5', () => {
    expect(offsetOfLine('a\nbb\nccc', 3)).toBe(5);
  });

  test('S-17: line 1 starts at 0', () => {
    expect(offsetOfLine('a\nbb', 1)).toBe(0);
  });

  test('S-18: a pixel line height is used as is', () => {
    expect(lineHeightOrFallback('20px', 400, 10)).toBe(20);
  });

  test('S-19: "normal" falls back to the measured height', () => {
    expect(lineHeightOrFallback('normal', 400, 10)).toBe(40);
  });
});
