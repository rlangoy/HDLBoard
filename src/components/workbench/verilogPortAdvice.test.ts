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
import { inputAssignChecks, withoutExplainedCoercions } from './verilogPortAdvice';
import { addToFiles, NO_DIAGNOSTICS } from './diagnosticStore';
import { fullMessageText } from './diagnosticText';

const inputAssignWarnings = (snapshot: RunSnapshot) => inputAssignChecks(snapshot).warnings;

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
      `top.v:${STATEMENT_LINE}: warning: output port LEDR is coerced to inout. This assignment drives input SW from output LEDR; inputs can only be read. The sides are probably reversed: assign LEDR = SW;`,
    ]);
  });

  test('keeps the selects on both sides', () => {
    expect(inputAssignWarnings(run('    assign SW[0] = LEDR[0];'))[0]).toMatch(/sides are probably reversed: assign LEDR\[0\] = SW\[0\];$/);
  });

  test('onto an output reg: no swap, assign cannot drive a reg', () => {
    expect(inputAssignWarnings(run('    assign SW[6:0] = HEX0_N;'))[0]).toMatch(/Assign an output port or a wire instead\.$/);
  });

  test('an output assigned is fine', () => {
    expect(inputAssignWarnings(run('    assign LEDR = SW;'))).toEqual([]);
  });

  test('a commented-out assign is no assign', () => {
    expect(inputAssignWarnings(run('    // assign SW = LEDR;'))).toEqual([]);
  });

  test('block comments and strings cannot explain away a compiler warning', () => {
    const checks = inputAssignChecks(run('/*', 'assign SW = LEDR;', '*/', 'initial $display("assign SW = LEDR;");'));
    expect(checks.warnings).toEqual([]);
    expect(checks.drivingOutputs.size).toBe(0);
  });

  test('assignments from expressions warn without claiming a reversed pair', () => {
    const checks = inputAssignChecks(run('assign SW = LEDR & 10\'b1;'));
    expect(checks.warnings[0]).toContain('This assignment drives input SW; inputs can only be read.');
    expect(checks.drivingOutputs.size).toBe(0);
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

  test('an assign in a branch the preprocessor may leave out is not warned about', () => {
    expect(inputAssignWarnings(run('`ifdef UNUSED', '    assign SW = LEDR;', '`endif'))).toEqual([]);
  });

  test('an assign in a branch the preprocessor may leave out explains no coercion', () => {
    expect(inputAssignChecks(run('`ifdef UNUSED', '    assign SW = LEDR;', '`endif')).drivingOutputs.size).toBe(0);
  });
});

describe('coercion warning in the console and editor', () => {
  const compilerWarning = 'hdl_board_tb.v:11: warning: output port LEDR is coerced to inout.';

  test('the reversed assignment is marked in the student file on line 19', () => {
    const content = [...HEADER, ...Array<string>(18 - HEADER.length).fill(''), '    assign SW= LEDR;', 'endmodule'].join('\n');
    const snapshot: RunSnapshot = { files: [{ id: 'design', name: 'DE1_SoC.v', content }] };
    const checks = inputAssignChecks(snapshot);
    const output = [...checks.warnings, withoutExplainedCoercions(compilerWarning, checks.drivingOutputs)].filter(Boolean).join('\n');
    expect(output).toMatch(/^DE1_SoC\.v:19: warning: output port LEDR is coerced to inout\./);
    expect(output).not.toContain('hdl_board_tb');
    const located = adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot);
    const stored = addToFiles(NO_DIAGNOSTICS, located).design;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ line: 19, severity: 'warning' });
    expect(fullMessageText(stored[0])).toContain('drives input SW from output LEDR');
    expect(fullMessageText(stored[0])).toContain('assign LEDR = SW;');
  });

  test('filters only explained generated-testbench warnings in multiline output', () => {
    const checks = inputAssignChecks(run('assign SW = LEDR;'));
    const unrelated = 'hdl_board_tb.v:12: warning: output port HEX0_N is coerced to inout.';
    const userWarning = 'top.v:8: warning: output port LEDR is coerced to inout.';
    const error = 'top.v:9: error: Unable to bind wire foo';
    expect(withoutExplainedCoercions([compilerWarning, unrelated, userWarning, error].join('\r\n'), checks.drivingOutputs))
      .toBe([unrelated, userWarning, error].join('\r\n'));
  });

  test('a corrected next run has no stale suppression', () => {
    const checks = inputAssignChecks(run('assign LEDR = SW;'));
    expect(checks.warnings).toEqual([]);
    expect(withoutExplainedCoercions(compilerWarning, checks.drivingOutputs)).toBe(compilerWarning);
  });
});
