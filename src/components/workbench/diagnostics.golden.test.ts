// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { ICARUS_SYNTAX_HINT, parseDiagnostics, type Diagnostic } from './diagnostics';
import * as fixture from './diagnostics.fixtures';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { addToFiles, NO_DIAGNOSTICS } from './diagnosticStore';
import { EXAMPLE_FILES } from './files';

/** `severity fileName:line[:column] message` and ` | detail` for each detail. */
function golden(d: Diagnostic): string {
  const place = `${d.fileName}:${d.line}${d.column === undefined ? '' : `:${d.column}`}`;
  return [`${d.severity} ${place} ${d.message}`, ...d.details].join(' | ');
}

/** The golden run compares sorted arrays: what was found, not the order it was found in. */
function goldenOf(capture: string): string[] {
  return parseDiagnostics(capture).map(golden).sort();
}

const HINT = ICARUS_SYNTAX_HINT;

describe('golden: whole captures', () => {
  test.each<[string, string, string[]]>([
    ['G-1', fixture.GHDL_SYNTAX_ERROR, [`error syntax.vhdl:13:15 ';' expected at end of signal assignment | (found: 'end')`]],
    [
      'G-2',
      fixture.GHDL_UNDECLARED,
      [
        `error undeclared.vhdl:13:13 no declaration for "swx"`,
        `error undeclared.vhdl:14:16 can't match character literal '2' with type STD_ULOGIC`,
      ],
    ],
    [
      'G-3',
      fixture.GHDL_TYPEERR,
      [
        `error typeerr.vhdl:14:13 can't match "count" with type array type "STD_ULOGIC_VECTOR"`,
        `warning typeerr.vhdl:15:25 value constraints don't match target ones [-Wruntime-error]`,
      ],
    ],
    ['G-4', fixture.GHDL_SPACE_NAME, ['error space name.vhdl:1:28 missing ";" at end of entity']],
    [
      'G-5',
      fixture.GHDL_ELABORATION,
      [
        'warning comp.vhdl:9:5 instance "u0" of component "missing_thing" is not bound [-Wbinding] | (in default configuration of comp(rtl))',
      ],
    ],
    [
      'G-6',
      fixture.GHDL_RUNTIME_REPORTS,
      ['error tb.vhdl:8:9 values differ', 'error tb.vhdl:9:9 fatal stop', 'warning tb.vhdl:7:9 warning level'],
    ],
    ['G-7', fixture.GHDL_RUNTIME_BOUND, ['error bound.vhdl:9 index (5) out of bounds (0 to 3)']],
    ['G-8', fixture.GHDL_WRAPPER_MISMATCH, [`error hdl_board_tb.vhdl:55:15 actual constraints don't match formal ones`]],
    ['G-9', fixture.ICARUS_SYNTAX, [`error syntax.v:6 syntax error | ${HINT}`]],
    [
      'G-10',
      fixture.ICARUS_UNDECLARED,
      [
        "error undeclared.v:5 Unable to bind wire/reg/memory `SWX' in `undeclared'",
        'error undeclared.v:5 Unable to elaborate r-value: SWX',
        "error undeclared.v:6 Unable to bind wire/reg/memory `bar' in `undeclared'",
        "error undeclared.v:6 Unable to bind wire/reg/memory `foo' in `undeclared'",
        'error undeclared.v:6 Unable to elaborate r-value: (foo)&(bar)',
      ],
    ],
    [
      'G-11',
      fixture.ICARUS_REGASSIGN,
      ['error regassign.v:5 LEDR is not a valid l-value in regassign. | LEDR is declared here as wire.'],
    ],
    [
      'G-12',
      fixture.ICARUS_INCLUDE_SYNTAX,
      [`error defs.vh:2 syntax error | ${HINT}`, 'warning inc.v:3 macro WIDTHX undefined (and assumed null) at this point.'],
    ],
    [
      'G-13',
      fixture.ICARUS_SPACE_NAME,
      ['error sp ace.v:1 Syntax error in continuous assignment', `error sp ace.v:1 syntax error | ${HINT}`],
    ],
    ['G-14', fixture.ICARUS_SORRY, ["error sorry.v:5 'disable fork' requires SystemVerilog."]],
    ['G-15', fixture.ICARUS_UNKNOWN_MODULE, ['error unk.v:2 Unknown module type: missing_mod']],
    ['G-16', fixture.ICARUS_MISSING_INCLUDE, ['error miss.v:1 Include file nope.vh not found']],
    ['G-17', fixture.ICARUS_WARNING, ["warning warn.v:6 implicit definition of wire 'nothere'."]],
    [
      'G-18',
      fixture.VVP_RUNTIME,
      [
        'error tb.v:6 values differ',
        'error tb.v:9 fatal stop',
        'error tb2.v:8 $readmemh: Unable to open nofile.hex for reading.',
        'warning tb.v:5 careful: 3',
      ],
    ],
    [
      'G-19',
      fixture.ICARUS_DE1_MISSING_SEMICOLON,
      ['error DE1_SoC.v:19 Syntax error in left side of continuous assignment.', `error DE1_SoC.v:23 syntax error | ${HINT}`],
    ],
    [
      'G-20',
      fixture.GHDL_DE1_MISSING_SEMICOLON,
      [`error DE1_SoC.vhdl:27:15 ';' expected at end of signal assignment | (found: an identifier)`],
    ],
    [
      'G-21',
      fixture.ICARUS_INCLUDE_LATER_LINE,
      ['error inc3.v:3 Include file nope.vh not found', `error inc3.v:3 syntax error | ${HINT}`],
    ],
  ])('%s', (_id, capture, expected) => {
    expect(goldenOf(capture)).toEqual(expected);
  });
});

/** The starter design `name` with the `;` ending line `line` (1-based) removed. */
function starterWithoutSemicolon(name: string, line: number): RunSnapshot {
  const file = EXAMPLE_FILES.find((f) => f.name === name);
  if (!file) throw new Error(`no starter file ${name}`);
  const lines = file.content.split('\n');
  lines[line - 1] = lines[line - 1].replace(/;\s*$/, '');
  return { files: [{ id: file.id, name: file.name, content: lines.join('\n') }] };
}

function linesMarked(capture: string, snapshot: RunSnapshot) {
  const located = locateDiagnostics(parseDiagnostics(capture), snapshot, snapshot.files);
  const byFile = addToFiles(NO_DIAGNOSTICS, located);
  return Object.values(byFile).map((lines) => lines.map((l) => [l.line, l.severity]));
}

describe('golden: parse → locate → store on the starter designs', () => {
  test('G-22: Verilog DE1_SoC.v marks lines 19 and 23 as errors', () => {
    const snapshot = starterWithoutSemicolon('DE1_SoC.v', 19);
    expect(linesMarked(fixture.ICARUS_DE1_MISSING_SEMICOLON, snapshot)).toEqual([
      [
        [19, 'error'],
        [23, 'error'],
      ],
    ]);
  });

  test('G-23: VHDL DE1_SoC.vhdl marks line 27 as an error', () => {
    const snapshot = starterWithoutSemicolon('DE1_SoC.vhdl', 27);
    expect(linesMarked(fixture.GHDL_DE1_MISSING_SEMICOLON, snapshot)).toEqual([[[27, 'error']]]);
  });
});
