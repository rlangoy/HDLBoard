// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import cases from './fixtures/verilog-novice.json';
import { adviseDiagnostics, adviseLogDiagnostics } from './diagnosticAdvice';
import { locateDiagnostics } from './diagnosticLocation';
import { DiagnosticParser, parseDiagnostics } from './diagnostics';
import { addToFiles, isMuted, NO_DIAGNOSTICS, withStoredMessage, type LineDiagnostic } from './diagnosticStore';
import { describeLine, inlineText } from './diagnosticText';

/** Captured from the real Windows backend, Icarus 13.0; LOG frames stay separate. */
function replay(name: string): readonly LineDiagnostic[] {
  const entry = cases.find((item) => item.name === name);
  if (!entry) throw new Error(`Missing corpus case: ${name}`);
  const snapshot = { files: [{ id: 'f', name: `${name}.v`, content: entry.source }] };
  const parser = new DiagnosticParser();
  let stored = NO_DIAGNOSTICS;
  for (const frame of entry.frames) {
    const compile = frame.verb === 'ERROR';
    const parsed = compile ? parseDiagnostics(frame.text) : parser.parse(frame.text);
    const located = locateDiagnostics(parsed, snapshot, snapshot.files);
    stored = addToFiles(stored, (compile ? adviseDiagnostics : adviseLogDiagnostics)(located, snapshot));
  }
  return stored.f ?? [];
}

const EXPLAINED: readonly [string, number, string][] = [
  ['missing_semicolon', 3, 'missing `;`'],
  ['wrong_assign_operator', 3, '`=<` is not'],
  ['comparison_equals', 3, 'did you mean `==`'],
  ['keyword_always', 3, 'did you mean `always`'],
  ['missing_endmodule', 4, 'missing `endmodule`'],
  ['missing_begin', 5, 'use `begin ... end`'],
  ['bad_sensitivity', 3, 'missing `)`'],
  ['wire_procedural', 3, '`always` or `initial`'],
  ['reg_continuous', 3, 'declare it as `wire`'],
  ['undeclared_rhs', 3, 'did you mean `counter`'],
  ['implicit_typo', 3, 'did you mean `led_out`'],
  ['implicit_no_candidate', 2, 'declare it explicitly'],
  ['unknown_module', 2, 'include its source file'],
  ['unknown_port', 3, 'compare the name with its module declaration'],
  ['unknown_named_parameter', 3, 'did you mean `WIDTH`'],
  ['wrong_number_ports', 4, '4 connections'],
  ['port_width', 4, 'discards 4 high bits of the expression'],
  ['output_width', 4, 'adds 4 high bits to the port'],
  ['index_outside', 3, 'range `[3:0]`; index `5`'],
  ['slice_reversed', 3, 'opposite direction'],
  ['duplicate_signal', 3, 'remove or rename one declaration'],
  ['literal_truncated', 3, 'high bits are discarded'],
  ['bad_binary_digit', 3, 'invalid base-2 digit'],
  ['case_missing_endcase', 7, 'missing `endcase`'],
  ['syntax_lost_eof', 4, 'missing `end`'],
  ['unknown_system_task', 2, 'did you mean `$display`'],
  ['unknown_port_typo', 4, 'did you mean `data`'],
  ['part_select_width', 3, 'out-of-range bits become `x`'],
  ['undefined_macro', 2, 'Macro `MAX_COUNT` is not defined here'],
  ['missing_else_colon', 5, 'missing `:`'],
  ['missing_begin2', 5, 'use `begin ... end`'],
  ['bad_module_name', 3, 'did you mean `count`'],
  ['missing_semicolon_last', 5, 'missing `;`'],
  ['case_item_semicolon', 6, 'missing `;` at the end of line 5'],
  ['case_label_semicolon', 6, 'missing `;` at the end of line 5'],
];

describe('novice corpus through the shared diagnostic presentation', () => {
  test.each(EXPLAINED)('%s explains the reported problem', (name, line, snippet) => {
    const messages = replay(name).find((entry) => entry.line === line)?.messages.filter((m) => !isMuted(m));
    expect(messages?.[0].advice?.headline).toContain(snippet);
  });

  test.each(cases)('$name preserves raw compiler text in the tooltip', ({ name }) => {
    const lines = replay(name);
    expect(lines.every((line) => line.messages.every((message) => describeLine(line).includes(message.message)))).toBe(true);
  });

  test.each([
    'invalid_range', 'multiple_driver', 'assign_width', 'incomplete_combination',
    'blocking_sequential', 'division_zero', 'conflicting_driver', 'wrong_operator_le',
  ])('%s is accepted without invented diagnostics', (name) => {
    expect(replay(name)).toEqual([]);
  });

  test('a nested case header after its case label is no unfinished statement', () => {
    const messages = replay('nested_case_header').find((entry) => entry.line === 5)?.messages.filter((m) => !isMuted(m));
    expect(messages?.[0].advice?.headline ?? '').not.toContain('missing `;`');
  });

  test('runtime assertions retain the student message', () => {
    expect(replay('runtime_fatal')[0].messages[0].advice).toBeUndefined();
  });

  test('the runtime system-task typo becomes a located error', () => {
    expect(replay('unknown_system_task')).toMatchObject([{ line: 2, severity: 'error' }]);
  });

  test('a successful compile keeps one warning with its streamed continuation', () => {
    expect(replay('port_width')).toMatchObject([{
      line: 4, severity: 'warning', messages: [{ details: ['Pruning 4 high bits of the expression.'] }],
    }]);
  });

  test('the shared inline formatter shows advice while the tooltip names Icarus', () => {
    const line = replay('unknown_system_task')[0];
    expect([inlineText(line), describeLine(line)]).toEqual([
      '`$disply` is not a known system task or function — did you mean `$display`?',
      'error: `$disply` is not a known system task or function — did you mean `$display`?\n\nIcarus: System task/function $disply() is not defined by any module.',
    ]);
  });
});

describe('streamed warning details', () => {
  const warning = 'top.v:3: warning: Port 1 (data) of module child expects 4 bit(s), given 8.';
  const note = 'top.v:3:        : Pruning 4 high bits of the expression.';

  test('later details do not mutate the previously returned diagnostic', () => {
    const parser = new DiagnosticParser();
    const first = parser.parse(warning);
    parser.parse(note);
    expect(first[0].details).toEqual([]);
  });

  test.each(['output from the design', 'other.v:3:        : unrelated', 'top.v:4:        : unrelated'])('does not attach after %s', (intervening) => {
    const parser = new DiagnosticParser();
    parser.parse(warning);
    parser.parse(intervening);
    expect(parser.parse(note)).toEqual([]);
  });

  test('a design report is never re-emitted by a note in a later frame', () => {
    const parser = new DiagnosticParser();
    parser.parse('ERROR: top.v:3: values differ\ntop.v:3:        : looks like a note');
    expect(parser.parse('top.v:3:        : another')).toEqual([]);
  });

  test('a note repeated under one message is kept, as Icarus printed it', () => {
    const repeated = 'top.v:3:        : x is declared here as wire.';
    expect(new DiagnosticParser().parse([warning, repeated, repeated].join('\n'))[0].details).toEqual([
      'x is declared here as wire.', 'x is declared here as wire.',
    ]);
  });

  test('a new run parser does not inherit the previous run', () => {
    new DiagnosticParser().parse(warning);
    expect(new DiagnosticParser().parse(note)).toEqual([]);
  });

  test('details arriving after the message update it without increasing the warning count', () => {
    const diagnostic = { fileId: 'f', line: 3, severity: 'warning' as const, message: 'width', details: [] };
    const initial = addToFiles(NO_DIAGNOSTICS, [diagnostic]);
    const updated = addToFiles(initial, [{ ...diagnostic, details: ['pruning'] }]);
    expect(updated.f[0].messages).toEqual([{ severity: 'warning', message: 'width', details: ['pruning'], advice: undefined }]);
  });

  test('a re-emitted message keeps notes that repeat earlier text', () => {
    const diagnostic = { fileId: 'f', line: 3, severity: 'warning' as const, message: 'width', details: ['same'] };
    const initial = addToFiles(NO_DIAGNOSTICS, [diagnostic]);
    expect(addToFiles(initial, [{ ...diagnostic, details: ['same', 'same'] }]).f[0].messages[0].details).toEqual(['same', 'same']);
  });

  test('repeated continuations keep the store reference stable', () => {
    const diagnostic = { fileId: 'f', line: 3, severity: 'warning' as const, message: 'width', details: ['pruning'] };
    const initial = addToFiles(NO_DIAGNOSTICS, [diagnostic]);
    expect(addToFiles(initial, [diagnostic])).toBe(initial);
  });

  test('a console link recovers the recorded advice and details without removing another marker', () => {
    const diagnostic = { fileId: 'f', line: 3, severity: 'warning' as const, message: 'width', details: [] };
    const enriched = { ...diagnostic, details: ['pruning'], advice: { headline: 'Check both widths.', compiler: 'Icarus' } };
    const stored = addToFiles(NO_DIAGNOSTICS, [enriched, { ...diagnostic, line: 5 }]);
    const linked = withStoredMessage(stored, diagnostic);
    expect([linked, addToFiles(stored, [linked])]).toEqual([enriched, stored]);
  });

  test.each(['WARNING', 'ERROR', 'FATAL'])('%s from the design never gets compiler advice', (level) => {
    const snapshot = { files: [{ id: 'f', name: 'top.v', content: 'module top; endmodule' }] };
    const parsed = parseDiagnostics(`${level}: top.v:1: Numeric constant truncated to 4 bits.`);
    const located = locateDiagnostics(parsed, snapshot, snapshot.files);
    expect([adviseDiagnostics(located, snapshot), adviseLogDiagnostics(located, snapshot)]).toEqual([located, located]);
  });
});
