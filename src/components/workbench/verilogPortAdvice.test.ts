// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * An input port assigned in Verilog, as Icarus 13.0 reports it with -Wall: an error in
 * `always`, nothing at all for `assign` (HDLBoard's own warning).
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { inputAssignWarnings } from './verilogPortAdvice';

const HEADER = [
  'module top (',
  '    input  wire        CLOCK_50,',
  '    input  wire [9:0]  SW,',
  '    input  wire [3:0]  KEY_N,',
  '    output wire [9:0]  LEDR,',
  '    output reg  [6:0]  HEX0_N',
  ');',
];
/** The 1-based line of the first statement. */
const STATEMENT_LINE = HEADER.length + 1;

function run(...statements: string[]): RunSnapshot {
  return { files: [{ id: 'top', name: 'top.v', content: [...HEADER, ...statements, 'endmodule', ''].join('\n') }] };
}

/** Icarus's error and its note for `name` assigned in `always`, as measured, and the advice on it. */
function advised(statement: string, name = 'SW'): AdvisedDiagnostic | undefined {
  const snapshot = run(statement);
  const output = [
    `top.v:${STATEMENT_LINE}: error: '${name}' is not a valid l-value for a procedural assignment.`,
    `top.v:3:      : '${name}' is declared here as a wire.`,
    'Elaboration failed',
  ].join('\n');
  return adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot)[0];
}

describe('an input port assigned in always (Icarus\'s error)', () => {
  test('the two sides the wrong way round, to an output reg: swap them', () => {
    expect(advised('    always @(posedge CLOCK_50) SW[6:0] <= HEX0_N;')?.advice?.headline).toBe(
      '`SW` is an input from the board, so the module can only read it — swap the two sides: `HEX0_N <= SW[6:0];`.',
    );
  });

  test('is not told to make the input a reg, as a wire would be', () => {
    expect(advised('    always @(posedge CLOCK_50) SW <= 10\'b0;')?.advice?.headline).toBe(
      '`SW` is an input from the board, so the module can only read it — assign an `output reg` or a `reg` instead.',
    );
  });

  test('to an output wire: no swap, since the swapped line would need a reg', () => {
    expect(advised('    always @(posedge CLOCK_50) SW <= LEDR;')?.advice?.headline).toMatch(/assign an `output reg` or a `reg` instead/);
  });

  test('underlines what is assigned', () => {
    expect(advised('    always @(posedge CLOCK_50) SW[6:0] <= HEX0_N;')?.advice?.span).toEqual({ start: 31, end: 38 });
  });
});

describe('inputAssignWarnings: assign to an input port, which Icarus accepts silently', () => {
  test('warns in Icarus\'s format, and swaps onto an output wire', () => {
    expect(inputAssignWarnings(run('    assign SW = LEDR;'))).toEqual([
      `top.v:${STATEMENT_LINE}: warning: input port "SW" is driven by the board, and this assign drives it too, so it can read x – swap the two sides: assign LEDR = SW;`,
    ]);
  });

  test('keeps the selects on both sides', () => {
    expect(inputAssignWarnings(run('    assign SW[0] = LEDR[0];'))[0]).toMatch(/swap the two sides: assign LEDR\[0\] = SW\[0\];$/);
  });

  test('onto an output reg: no swap, assign cannot drive a reg', () => {
    expect(inputAssignWarnings(run('    assign SW[6:0] = HEX0_N;'))[0]).toMatch(/assign an output port or a wire instead\.$/);
  });

  test('an output assigned is fine', () => {
    expect(inputAssignWarnings(run('    assign LEDR = SW;'))).toEqual([]);
  });

  test('a commented-out assign is no assign', () => {
    expect(inputAssignWarnings(run('    // assign SW = LEDR;'))).toEqual([]);
  });

  test('ports declared in the body (Verilog-1995) count too', () => {
    const content = 'module top (SW, LEDR);\n    input [9:0] SW;\n    output [9:0] LEDR;\n    assign SW = LEDR;\nendmodule\n';
    expect(inputAssignWarnings({ files: [{ id: 'top', name: 'top.v', content }] })).toHaveLength(1);
  });

  test('another module\'s input of the same name is not this module\'s', () => {
    const content = 'module child (input SW);\nendmodule\nmodule top;\n    wire SW;\n    assign SW = 1\'b0;\nendmodule\n';
    expect(inputAssignWarnings({ files: [{ id: 'top', name: 'top.v', content }] })).toEqual([]);
  });

  test('a VHDL file is not read', () => {
    expect(inputAssignWarnings({ files: [{ id: 'top', name: 'top.vhdl', content: 'assign SW = LEDR;' }] })).toEqual([]);
  });
});
