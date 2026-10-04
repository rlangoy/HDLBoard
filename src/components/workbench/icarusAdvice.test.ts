// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The rules of docs/editor_diagnostics_verilog_research.md § 3 one at a time, and
 * the false-positive guards its § 3 point 1 asks for before Rule B ships. Tested
 * through the public entry points of diagnosticAdvice.ts, which pick the rules by
 * file name.
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, adviseLogDiagnostics, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type LocatedDiagnostic, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { VERILOG_CORPUS, verilogCorpusSource } from './diagnostics.verilog.corpus';
import { isFollowOn } from './diagnosticStore';
import { EXAMPLE_FILES } from './files';
import { tokenizeVerilog } from './verilogHighlight';

const SYNTAX_ERROR = 'syntax error';

function snapshotOf(...contents: string[]): RunSnapshot {
  return { files: contents.map((content, i) => ({ id: `f${i}`, name: `f${i}.v`, content })) };
}

function errorOn(line: number, message = SYNTAX_ERROR, details: readonly string[] = []): LocatedDiagnostic {
  return { fileId: 'f0', line, severity: 'error', message, details };
}

function headlineFor(snapshot: RunSnapshot, diagnostic: LocatedDiagnostic): string | undefined {
  return adviseDiagnostics([diagnostic], snapshot)[0].advice?.headline;
}

/** Icarus's text for a file, as an ERROR frame body, through the whole pipeline. */
function adviseText(snapshot: RunSnapshot, output: string): AdvisedDiagnostic[] {
  return adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot);
}

/** Identifiers of the Verilog starter designs (files.ts). */
function starterIdentifiers(): string[] {
  const words = EXAMPLE_FILES.filter((file) => file.folder === 'verilog')
    .flatMap((file) => tokenizeVerilog(file.content.split('\n')).flat())
    .filter((token) => token.type === 'identifier')
    .map((token) => token.text);
  return [...new Set(words)];
}

/** Typical student names, the 3-letter ones Rule B could reach included (§ 7 #2). */
const STUDENT_NAMES = [
  'clk', 'clock', 'clk_50', 'rst', 'reset', 'reset_n', 'rst_n', 'enable', 'en', 'ena', 'din', 'dout',
  'data', 'data_in', 'data_out', 'inputs', 'outputs', 'inp', 'outp', 'sel', 'mux_out', 'q', 'd',
  'count', 'counter', 'cnt', 'cout', 'cin', 'sum', 'carry', 'busy', 'bus', 'done', 'ready', 'valid',
  'start', 'stop', 'state', 'next_state', 'nxt', 'state_reg', 'mode', 'port_a', 'port_b', 'addr',
  'address', 'wr_en', 'rd_en', 'we', 'mem', 'ram', 'rom', 'regs', 'shift', 'shift_reg', 'tick',
  'pulse', 'led', 'leds', 'sw', 'switch', 'switches', 'key', 'keys', 'btn', 'button', 'hex', 'seg',
  'segments', 'digit', 'digits', 'bcd', 'bin', 'value', 'temp', 'tmp', 'result', 'res', 'flag',
  'toggle', 'blink', 'timer', 'divider', 'clk_div', 'baud', 'tx', 'rx', 'parity', 'idle', 'run',
  'wait_cnt', 'prescaler', 'compare', 'match', 'strobe', 'latch', 'load', 'clear', 'inc', 'dec',
  'up', 'down', 'dir', 'speed', 'nor_out', 'andy', 'fork_en', 'wired', 'real_val', 'task_id',
];

describe('Rule B false-positive guards (research § 3, point 1)', () => {
  test.each(starterIdentifiers())('the starter name %s is never "corrected", even undeclared', (name) => {
    expect(headlineFor(snapshotOf(`    q <= ${name} + 1;`), errorOn(1))).toBeUndefined();
  });

  test.each(STUDENT_NAMES)('%s, declared in another file, is never "corrected"', (name) => {
    const snapshot = snapshotOf(`    q <= ${name} + 1;`, `module other (input wire ${name});\nendmodule`);
    expect(headlineFor(snapshot, errorOn(1))).toBeUndefined();
  });

  test('the same word undeclared is (the declaration is what keeps it quiet)', () => {
    expect(headlineFor(snapshotOf('    q <= bus + 1;'), errorOn(1))).toBe(
      '`bus` is not a Verilog keyword — did you mean `buf`?',
    );
  });

  test('two equally near keywords give no advice', () => {
    expect(headlineFor(snapshotOf('    q <= nod;'), errorOn(1))).toBeUndefined(); // nor, not
  });

  test('a 3-letter word is only "corrected" to a 3-letter keyword', () => {
    expect(headlineFor(snapshotOf('    iff (x) q <= 1;'), errorOn(1))).toBeUndefined(); // `if` is 2 letters
  });

  test('SystemVerilog words are left alone: the student did not misspell them', () => {
    for (const word of ['logic', 'always_ff', 'always_comb', 'bit', 'int']) {
      expect(headlineFor(snapshotOf(`    ${word} q;`), errorOn(1))).toBeUndefined();
    }
  });

  test('Verilog is case-sensitive: `Always` is a name to Icarus, and means `always`', () => {
    expect(headlineFor(snapshotOf('    Always @(posedge clk) q <= d;'), errorOn(1))).toBe(
      '`Always` is not a Verilog keyword — did you mean `always`?',
    );
  });

  test('a semantic error gets no keyword suggestion', () => {
    expect(headlineFor(snapshotOf('    alwyas u0 (q);'), errorOn(1, 'Unknown module type: alwyas'))).toBeUndefined();
  });

  test('a name in a comment or a string is not a candidate', () => {
    expect(headlineFor(snapshotOf('    q <= 1; // alwyas "alwyas"'), errorOn(1))).toBeUndefined();
    expect(headlineFor(snapshotOf('    $display("alwyas");'), errorOn(1))).toBeUndefined();
  });
});

describe('Rule B on the previous code line', () => {
  test('only when the reported line has no candidate', () => {
    expect(headlineFor(snapshotOf('    wrie a\n    alwyas @*'), errorOn(2))).toBe(
      '`alwyas` is not a Verilog keyword — did you mean `always`?',
    );
  });

  test('not when that line ends in `;`: a finished line would have been reported itself', () => {
    expect(headlineFor(snapshotOf('    q <= wrie;\n    end'), errorOn(2))).toBeUndefined();
  });

  test('points at the line it names', () => {
    const [advised] = adviseDiagnostics([errorOn(3)], snapshotOf('always @(posedge clk) begn\n// a comment\n    q <= d;'));
    expect(advised.advice).toMatchObject({ relatedLine: 1, compiler: 'Icarus' });
    expect(advised.advice?.span).toBeUndefined();
  });
});

describe('Rule D: a missing `;` on the previous code line', () => {
  test.each([
    ['a name', '    counter <= 0'],
    ['a number', "    reg led = 1'b0"],
    ['a closing bracket that is not a header', '    assign y = f(a)'],
  ])('the previous line ends in %s', (_what, previous) => {
    expect(headlineFor(snapshotOf(`${previous}\n\n    // comment\n    led <= 1;`), errorOn(4))).toBe(
      'Probably a missing `;` at the end of line 1.',
    );
  });

  test.each([
    ['`;`', '    counter <= 0;'],
    ['`begin`', '    always @(posedge clk) begin'],
    ['the `)` of an `if` header', '    if (a == b)'],
    ['the `)` of an `always` header', '    always @(posedge clk)'],
    ['`,`', '    input wire a,'],
    ['an operator', '    assign y = a +'],
    ['a compiler directive', '`define WIDTH 4'],
  ])('no advice when the previous line ends in %s', (_what, previous) => {
    expect(headlineFor(snapshotOf(`${previous}\n    led <= 1;`), errorOn(2))).toBeUndefined();
  });

  test('no advice when the reported line does not start a statement', () => {
    expect(headlineFor(snapshotOf('    output wire q\n);'), errorOn(2))).toBeUndefined();
  });

  test('no advice when the previous line shows an error of its own', () => {
    const snapshot = snapshotOf('    assign a = b\n    assign c = d;');
    const [, second] = adviseDiagnostics(
      [errorOn(1, 'Syntax error in left side of continuous assignment.'), errorOn(2)],
      snapshot,
    );
    expect(second.advice).toBeUndefined();
  });
});

describe('Rule E: joined keywords', () => {
  test('`elsif` from VHDL, on the reported line', () => {
    expect(headlineFor(snapshotOf('    end elsif (x) begin'), errorOn(1))).toBe(
      '`elsif` (line 1) must be two words in Verilog: `else if`.',
    );
  });

  test('not when the student declared that name', () => {
    expect(headlineFor(snapshotOf('wire endif;\n    q <= endif + 1;'), errorOn(2))).toBeUndefined();
  });
});

describe('Rule C: undeclared names', () => {
  test('a name that differs only in case is suggested: Verilog names are case-sensitive', () => {
    const snapshot = snapshotOf('reg counter;\n    q <= Counter;');
    expect(headlineFor(snapshot, errorOn(2, "Unable to bind wire/reg/memory `Counter' in `m'"))).toBe(
      '`Counter` is not declared — did you mean `counter`?',
    );
  });

  test('`default_nettype none` wording', () => {
    const snapshot = snapshotOf('output wire LEDR;\n    assign LEDRR = 1;');
    expect(headlineFor(snapshot, errorOn(2, 'Net LEDRR is not defined in this context.'))).toBe(
      '`LEDRR` is not declared — did you mean `LEDR`?',
    );
  });

  test('nothing near: no advice, Icarus’s text stays', () => {
    expect(headlineFor(snapshotOf('    q <= zzyzx;'), errorOn(1, "Unable to bind wire/reg/memory `zzyzx' in `m'"))).toBeUndefined();
  });

  test('a name declared only in another file is not suggested', () => {
    const snapshot = snapshotOf('    q <= countr;', 'module o; reg counter; endmodule');
    expect(headlineFor(snapshot, errorOn(1, "Unable to bind wire/reg/memory `countr' in `m'"))).toBeUndefined();
  });
});

describe('Rule G: an implicit wire', () => {
  const warning = (name: string): LocatedDiagnostic => ({
    fileId: 'f0',
    line: 2,
    severity: 'warning',
    message: `implicit definition of wire '${name}'.`,
    details: [],
  });

  test('arrives as a LOG line after a successful compile, and gets advice there', () => {
    const snapshot = snapshotOf('output wire [9:0] LEDR;\n    assign LEDRR = 0;');
    expect(adviseLogDiagnostics([warning('LEDRR')], snapshot)[0].advice).toMatchObject({
      headline: '`LEDRR` is not declared — did you mean `LEDR`? Verilog made a new, unconnected wire.',
      span: { start: 11, end: 16 },
      compiler: 'Icarus',
    });
  });

  test('an intended implicit wire, near no declared name, gets none', () => {
    const snapshot = snapshotOf('output wire [9:0] LEDR;\n    assign carry = 0;');
    expect(adviseLogDiagnostics([warning('carry')], snapshot)[0].advice).toBeUndefined();
  });
});

describe('Rule H: Icarus 12.0 words it differently (research § 2.3, A.3)', () => {
  test('assign to a reg', () => {
    const snapshot = snapshotOf('reg led_state;\n    assign led_state = 1;');
    const message = 'reg led_state; cannot be driven by primitives or continuous assignment.';
    expect(headlineFor(snapshot, errorOn(2, message))).toBe(
      '`led_state` is a `reg`: drive it inside an `always` block, or declare it as `wire`.',
    );
  });

  test('a wire assigned in an always block', () => {
    const snapshot = snapshotOf('wire led_state;\n    led_state <= 1;');
    const error = errorOn(2, 'led_state is not a valid l-value in blinkTest.', ['led_state is declared here as wire.']);
    expect(headlineFor(snapshot, error)).toBe(
      '`led_state` is a `wire`: only a `reg` can be assigned inside an `always` block — declare it as `reg`.',
    );
  });

  test('not a valid l-value for anything but a wire (an input port) gets no rewrite', () => {
    const snapshot = snapshotOf('input wire sw;\n    sw <= 1;');
    const error = errorOn(2, "'sw' is not a valid l-value for a procedural assignment.", ["'sw' is declared here as an input."]);
    expect(headlineFor(snapshot, error)).toBeUndefined();
  });

  test('the paren-missing cascade of 12.0 is muted the same way', () => {
    const paren = VERILOG_CORPUS.find((c) => c.id === 'paren-missing');
    if (!paren) throw new Error('no paren-missing case');
    const snapshot = { files: [{ id: 'f0', name: 'blinkTest.v', content: verilogCorpusSource(paren) }] };
    const icarus12 = [
      'blinkTest.v:31: syntax error',
      'blinkTest.v:31: error: Malformed event control expression.',
      'blinkTest.v:31: error: Invalid event control.',
      'blinkTest.v:35: syntax error',
      'blinkTest.v:36: error: Invalid module item.',
      'blinkTest.v:37: syntax error',
      'blinkTest.v:41: error: Invalid module item.',
    ].join('\n');
    const visible = adviseText(snapshot, icarus12).filter((d) => !isFollowOn(d));
    expect(visible.map((d) => d.line)).toEqual([31, 35, 37]);
  });
});

describe('Rule F: follow-on errors', () => {
  test('the bogus line-1 message is muted, and names the first error', () => {
    const snapshot = snapshotOf('module m (\n    input wire a\n);\n    reg b = 0\n    always @* b = a;\nendmodule');
    const advised = adviseText(snapshot, 'f0.v:5: syntax error\nf0.v:1: error: Syntax error in variable list.');
    expect(advised.map((d) => d.advice?.followOnOf)).toEqual([undefined, 5]);
  });

  test('after a semantic error nothing is muted', () => {
    const snapshot = snapshotOf('reg a;\n    q <= b;\n    q <= c;');
    const advised = adviseText(
      snapshot,
      "f0.v:2: error: Unable to bind wire/reg/memory `b' in `m'\nf0.v:3: error: Invalid module item.",
    );
    expect(advised.filter(isFollowOn)).toEqual([]);
  });
});

describe('the rules are picked by file name', () => {
  test('a VHDL file in the same run keeps GHDL’s advice exactly', () => {
    const vhdl = { id: 'v', name: 'top.vhdl', content: '    signal counter : integer rttange 0 to 9 := 0;' };
    const error: LocatedDiagnostic = { fileId: 'v', line: 1, column: 29, severity: 'error', message: 'missing ";" at end of object declaration', details: [] };
    const alone = adviseDiagnostics([error], { files: [vhdl] });
    const mixed = adviseDiagnostics([error], { files: [vhdl, ...snapshotOf('module m; endmodule').files] });
    expect(mixed).toEqual(alone);
    expect(alone[0].advice?.headline).toBe('`rttange` is not a VHDL keyword — did you mean `range`?');
  });

  test('a `.vh` header is Verilog', () => {
    const snapshot = { files: [{ id: 'f0', name: 'defs.vh', content: '    alwyas @*' }] };
    expect(headlineFor(snapshot, errorOn(1))).toBe('`alwyas` is not a Verilog keyword — did you mean `always`?');
  });

  test('the input order is kept when both languages are advised together', () => {
    const snapshot = { files: [{ id: 'v', name: 'a.vhdl', content: 'x' }, ...snapshotOf('    alwyas @*').files] };
    const vhdl: LocatedDiagnostic = { fileId: 'v', line: 1, severity: 'error', message: 'x', details: [] };
    expect(adviseDiagnostics([vhdl, errorOn(1), vhdl], snapshot).map((d) => d.fileId)).toEqual(['v', 'f0', 'v']);
  });

  test('a runtime LOG line gets no advice, whatever it says', () => {
    const snapshot = snapshotOf('    alwyas @*');
    const runtime = locateDiagnostics(parseDiagnostics('ERROR: f0.v:1: syntax error'), snapshot, snapshot.files);
    expect(adviseLogDiagnostics(runtime, snapshot)).toEqual(runtime);
  });
});
