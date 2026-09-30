// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { ICARUS_SYNTAX_HINT, parseDiagnostics, recognizeLine, type Diagnostic, type LineResult } from './diagnostics';
import * as fixture from './diagnostics.fixtures';

function diagnostic(
  fileName: string,
  line: number,
  severity: Diagnostic['severity'],
  message: string,
  extra: { column?: number; details?: string[] } = {},
): LineResult {
  const { column, details = [] } = extra;
  return {
    kind: 'diagnostic',
    diagnostic: { fileName, line, ...(column === undefined ? {} : { column }), severity, message, details },
  };
}

const NONE: LineResult = { kind: 'none' };
const DECLINED: LineResult = { kind: 'declined' };
const GHDL_SYNTAX = "syntax.vhdl:13:15:error: ';' expected at end of signal assignment";
const P1 = diagnostic('syntax.vhdl', 13, 'error', "';' expected at end of signal assignment", { column: 15 });

describe('recognizeLine', () => {
  test.each<[string, string, LineResult]>([
    ['P-1', GHDL_SYNTAX, P1],
    [
      'P-2',
      "typeerr.vhdl:15:25:warning: value constraints don't match target ones [-Wruntime-error]",
      diagnostic('typeerr.vhdl', 15, 'warning', "value constraints don't match target ones [-Wruntime-error]", { column: 25 }),
    ],
    [
      'P-3',
      'space name.vhdl:1:28:error: missing ";" at end of entity',
      diagnostic('space name.vhdl', 1, 'error', 'missing ";" at end of entity', { column: 28 }),
    ],
    ['P-4', 'tb.vhdl:8:9:@0ms:(assertion error): values differ', diagnostic('tb.vhdl', 8, 'error', 'values differ', { column: 9 })],
    ['P-5', 'tb.vhdl:9:9:@0ms:(assertion failure): fatal stop', diagnostic('tb.vhdl', 9, 'error', 'fatal stop', { column: 9 })],
    ['P-6', 'tb.vhdl:7:9:@0ms:(assertion warning): warning level', diagnostic('tb.vhdl', 7, 'warning', 'warning level', { column: 9 })],
    ['P-7', 'tb.vhdl:6:9:@0ms:(report note): hello from tb', DECLINED],
    [
      'P-8',
      'ghdl:error: index (5) out of bounds (0 to 3) at bound.vhdl:9',
      diagnostic('bound.vhdl', 9, 'error', 'index (5) out of bounds (0 to 3)'),
    ],
    [
      'P-9',
      'C:\\Program Files\\HDLBoard\\resources\\ghdl\\bin\\ghdl.exe:error: index (5) out of bounds (0 to 3) at bound.vhdl:9',
      diagnostic('bound.vhdl', 9, 'error', 'index (5) out of bounds (0 to 3)'),
    ],
    ['P-10', 'ghdl:error: simulation failed', NONE],
    ['P-11', '/usr/bin/ghdl-mcode:error: cannot find entity or configuration nosuch', NONE],
    ['P-12', 'syntax.v:6: syntax error', diagnostic('syntax.v', 6, 'error', 'syntax error', { details: [ICARUS_SYNTAX_HINT] })],
    [
      'P-13',
      "undeclared.v:5: error: Unable to bind wire/reg/memory `SWX' in `undeclared'",
      diagnostic('undeclared.v', 5, 'error', "Unable to bind wire/reg/memory `SWX' in `undeclared'"),
    ],
    [
      'P-14',
      "warn.v:6: warning: implicit definition of wire 'nothere'.",
      diagnostic('warn.v', 6, 'warning', "implicit definition of wire 'nothere'."),
    ],
    [
      'P-15',
      'x.v:3: sorry: constant selects in always_* processes are not currently supported (all bits will be included).',
      diagnostic('x.v', 3, 'error', 'constant selects in always_* processes are not currently supported (all bits will be included).'),
    ],
    ['P-16', 'regassign.v:3:      : LEDR is declared here as wire.', { kind: 'note', message: 'LEDR is declared here as wire.' }],
    ['P-17', './defs.vh:2: syntax error', diagnostic('defs.vh', 2, 'error', 'syntax error', { details: [ICARUS_SYNTAX_HINT] })],
    ['P-18', 'miss.v:2: Include file nope.vh not found', diagnostic('miss.v', 1, 'error', 'Include file nope.vh not found')],
    ['P-19', 'ERROR: tb.v:6: values differ', diagnostic('tb.v', 6, 'error', 'values differ')],
    ['P-20', 'WARNING: tb.v:5: careful: 3', diagnostic('tb.v', 5, 'warning', 'careful: 3')],
    ['P-21', 'FATAL: tb.v:9: fatal stop', diagnostic('tb.v', 9, 'error', 'fatal stop')],
    ['P-22', 'tb2.v:4: $finish called at 0 (1ps)', NONE],
    ['P-23', 'I give up.', NONE],
    ['P-24', '5 error(s) during elaboration.', NONE],
    ['P-25', '              ^', NONE],
    ['P-26', '    LEDR <= SW', NONE],
    ['P-27', 'error: Unable to find the root module "miss" in the Verilog source.', NONE],
    ['P-28', '       Time: 0  Scope: tb', NONE],
    ['P-29', 'hello from tb', NONE],
    ['P-30', `${GHDL_SYNTAX}\r`, P1],
    ['P-31', 'x.vhdl:0:1:error: y', NONE],
    ['P-32', 'comp.vhdl:9:5:note: something', DECLINED],
    ['P-33', 'm.v:1: Include file nope.vh not found', NONE],
    [
      'P-34',
      'DE1_SoC.v:19: error: Syntax error in left side of continuous assignment.',
      diagnostic('DE1_SoC.v', 19, 'error', 'Syntax error in left side of continuous assignment.'),
    ],
    [
      'P-36',
      'tb.vhdl:6:9:@0ms:(assertion error): (debug) x',
      diagnostic('tb.vhdl', 6, 'error', '(debug) x', { column: 9 }),
    ],
    ['P-37', 'ERROR: tb.v:6: values differ   ', diagnostic('tb.v', 6, 'error', 'values differ')],
  ])('%s: %s', (_id, input, expected) => {
    expect(recognizeLine(input)).toEqual(expected);
  });

  test("P-35: a GHDL message starting with '(' is a continuation", () => {
    expect(recognizeLine("syntax.vhdl:13:15:error: (found: 'end')").kind).toBe('continuation');
  });
});

describe('parseDiagnostics', () => {
  test('T-1: a GHDL syntax error is one diagnostic', () => {
    expect(parseDiagnostics(fixture.GHDL_SYNTAX_ERROR)).toHaveLength(1);
  });

  test('T-2: the continuation after the caret lines becomes a detail', () => {
    expect(parseDiagnostics(fixture.GHDL_SYNTAX_ERROR)[0].details).toEqual(["(found: 'end')"]);
  });

  test('T-3: undeclared VHDL names give lines 13 and 14', () => {
    expect(parseDiagnostics(fixture.GHDL_UNDECLARED).map((d) => d.line)).toEqual([13, 14]);
  });

  test('T-4: an elaboration warning keeps its continuation', () => {
    const [warning, ...rest] = parseDiagnostics(fixture.GHDL_ELABORATION);
    expect([warning.severity, warning.details, rest]).toEqual([
      'warning',
      ['(in default configuration of comp(rtl))'],
      [],
    ]);
  });

  test('T-5: an Icarus note becomes a detail of the error above it', () => {
    expect(parseDiagnostics(fixture.ICARUS_REGASSIGN).map((d) => d.details)).toEqual([['LEDR is declared here as wire.']]);
  });

  test('T-6: undeclared.v gives five diagnostics', () => {
    expect(parseDiagnostics(fixture.ICARUS_UNDECLARED)).toHaveLength(5);
  });

  test('T-7: inc.v gives a warning and a header error', () => {
    expect(parseDiagnostics(fixture.ICARUS_INCLUDE_SYNTAX).map((d) => `${d.severity} ${d.fileName}:${d.line}`)).toEqual([
      'warning inc.v:3',
      'error defs.vh:2',
    ]);
  });

  test('T-8: the vvp capture gives four diagnostics', () => {
    expect(parseDiagnostics(fixture.VVP_RUNTIME)).toHaveLength(4);
  });

  test('T-9: the GHDL report capture gives three diagnostics (the note is excluded)', () => {
    expect(parseDiagnostics(fixture.GHDL_RUNTIME_REPORTS)).toHaveLength(3);
  });

  test('T-10: empty text gives none', () => {
    expect(parseDiagnostics('')).toEqual([]);
  });

  test('T-11: a note with no diagnostic before it is dropped', () => {
    expect(parseDiagnostics('regassign.v:3:      : LEDR is declared here as wire.')).toEqual([]);
  });

  test('T-12: a leading "(" without a previous diagnostic is kept on its own', () => {
    expect(parseDiagnostics('a.vhdl:1:1:error: (x)').map((d) => d.message)).toEqual(['(x)']);
  });

  test('T-13: DE1_SoC.v reports line 23 first, then line 19', () => {
    expect(parseDiagnostics(fixture.ICARUS_DE1_MISSING_SEMICOLON).map((d) => d.line)).toEqual([23, 19]);
  });

  test('T-14: DE1_SoC.vhdl gives line 27 with its continuation', () => {
    const found = parseDiagnostics(fixture.GHDL_DE1_MISSING_SEMICOLON);
    expect(found.map((d) => [d.line, d.details])).toEqual([[27, ['(found: an identifier)']]]);
  });

  test('T-15: a declined note first in a batch does not become the previous diagnostic', () => {
    expect(parseDiagnostics('a.vhdl:2:1:note: n\na.vhdl:3:1:error: e').map((d) => d.message)).toEqual(['e']);
  });

  test('T-16: a continuation after a declined note is kept on its own', () => {
    expect(parseDiagnostics('a.vhdl:2:1:note: n\na.vhdl:2:1:error: (x)').map((d) => d.message)).toEqual(['(x)']);
  });
});
