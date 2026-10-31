// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The missing-package Quick Fix from GHDL's text to the fixed file: parser,
 * advice, problem bar and edit together, on the bug report's own design.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, revealTarget, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { addToFiles, NO_DIAGNOSTICS } from './diagnosticStore';
import { barProblem, inlineText } from './diagnosticText';
import { ProblemBar } from './ProblemBar';
import { ADDER_LINE, GHDL_OUTPUT, starterWithAdder } from './quickFix.testSupport';
import { addUseClause, applyInsertion } from './useClauseFix';

const FILE_ID = 'de1';
const ADDER_LINE_NUMBER = 27;

function snapshotOf(content: string): RunSnapshot {
  return { files: [{ id: FILE_ID, name: 'DE1_SoC.vhdl', content }] };
}

function advise(content: string, ghdlOutput = GHDL_OUTPUT): AdvisedDiagnostic[] {
  const snapshot = snapshotOf(content);
  return adviseDiagnostics(locateDiagnostics(parseDiagnostics(ghdlOutput), snapshot, snapshot.files), snapshot);
}

function storedLines(advised: readonly AdvisedDiagnostic[]) {
  return addToFiles(NO_DIAGNOSTICS, advised)[FILE_ID] ?? [];
}

describe('no declaration for "unsigned" (the bug report)', () => {
  const content = starterWithAdder();
  const advised = advise(content);
  const [first] = advised;

  test('the error is on the adder line', () => {
    expect(content.split('\n')[ADDER_LINE_NUMBER - 1]).toBe(ADDER_LINE);
    expect(advised.map((d) => d.line)).toEqual([ADDER_LINE_NUMBER, ADDER_LINE_NUMBER]);
  });

  test('says which package `unsigned` comes from', () => {
    expect(first.advice?.headline).toBe(
      '`unsigned` comes from the package `ieee.numeric_std`, which this file does not use yet.',
    );
  });

  test('offers the use clause as a Quick Fix', () => {
    expect(first.advice?.fix).toEqual({ addUseClause: { library: 'ieee', name: 'numeric_std' } });
  });

  test('underlines each `unsigned`', () => {
    const words = advised.map((d) => d.advice?.span && ADDER_LINE.slice(d.advice.span.start, d.advice.span.end));
    expect(words).toEqual(['unsigned', 'unsigned']);
  });

  test('the editor is taken to the first `unsigned`, far right on its line', () => {
    expect(revealTarget(advised)).toEqual({ fileId: FILE_ID, line: ADDER_LINE_NUMBER, index: ADDER_LINE.indexOf('unsigned') });
  });

  test('the problem bar shows the whole message once (the two `unsigned` errors are the same) and the fix', () => {
    const problem = barProblem(storedLines(advised));
    expect(problem).toEqual({
      line: ADDER_LINE_NUMBER,
      severity: 'error',
      text: '`unsigned` comes from the package `ieee.numeric_std`, which this file does not use yet.',
      fix: first.advice?.fix,
    });
  });

  test('the inline text after the code says the same', () => {
    expect(inlineText(storedLines(advised)[0])).toContain('`ieee.numeric_std`');
  });

  test('applying the fix adds the use clause below the existing one, and nothing else', () => {
    const problem = barProblem(storedLines(advised));
    const insertion = problem?.fix && addUseClause(content, problem.fix.addUseClause, problem.line);
    const after = insertion && applyInsertion(content, insertion);
    expect(after?.split('\n').slice(0, 3)).toEqual(['library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;']);
    expect(after?.replace('use ieee.numeric_std.all;\n', '')).toBe(content);
  });

  test('the fixed file no longer gets the advice: the name is missing for another reason', () => {
    const insertion = addUseClause(content, { library: 'ieee', name: 'numeric_std' }, ADDER_LINE_NUMBER);
    const after = insertion && applyInsertion(content, insertion);
    const moved = GHDL_OUTPUT.replace(/:27:/g, ':28:');
    expect(after && advise(after, moved)[0].advice?.fix).toBeUndefined();
  });
});

describe('other missing packages', () => {
  test('std_logic without `use ieee.std_logic_1164.all;` offers that package', () => {
    const content = 'library ieee;\nentity e is\n  port (a : in std_logic);\nend;';
    const [advised] = advise(content, 'DE1_SoC.vhdl:3:15:error: no declaration for "std_logic"');
    expect(advised.advice?.fix).toEqual({ addUseClause: { library: 'ieee', name: 'std_logic_1164' } });
  });

  test('with std_logic_arith in use, it explains the clash and offers no fix', () => {
    const content = 'library ieee;\nuse ieee.std_logic_arith.all;\narchitecture a of e is begin\n  q <= to_unsigned(d, 4);\nend;';
    const [advised] = advise(content, 'DE1_SoC.vhdl:4:8:error: no declaration for "to_unsigned"');
    expect(advised.advice?.headline).toBe(
      '`to_unsigned` comes from `ieee.numeric_std`, but this file uses `ieee.std_logic_arith`, which clashes with it — use only one of them.',
    );
    expect(advised.advice?.fix).toBeUndefined();
  });

  test('a misspelled name still gets "did you mean"', () => {
    const content = 'architecture a of e is\n  signal count : bit;\nbegin\n  q <= coutn;\nend;';
    const [advised] = advise(content, 'DE1_SoC.vhdl:4:8:error: no declaration for "coutn"');
    expect(advised.advice?.headline).toBe('`coutn` is not declared — did you mean `count`?');
    expect(advised.advice?.fix).toBeUndefined();
  });
});

describe('ProblemBar', () => {
  const problem = barProblem(storedLines(advise(starterWithAdder())));

  test('shows the line, the message and a Quick Fix button with its shortcut', () => {
    const html = renderToStaticMarkup(<ProblemBar problem={problem} applied={undefined} onApplyFix={() => {}} />);
    expect(html).toContain('Line 27:');
    expect(html).toContain('<code>ieee.numeric_std</code>');
    expect(html).toMatch(/<button[^>]*title="Quick Fix \(Ctrl\+\.\)"/);
    expect(html).toContain('Add <code>use ieee.numeric_std.all;</code>');
  });

  test('has no button for a problem without a fix', () => {
    const html = renderToStaticMarkup(
      <ProblemBar problem={{ line: 3, severity: 'error', text: 'oops' }} applied={undefined} onApplyFix={() => {}} />,
    );
    expect(html).not.toContain('<button');
  });

  test('confirms an applied fix while there is no problem left', () => {
    const html = renderToStaticMarkup(<ProblemBar problem={undefined} applied="Added `x`." onApplyFix={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Added <code>x</code>.');
  });

  test('shows nothing with nothing to say', () => {
    expect(renderToStaticMarkup(<ProblemBar problem={undefined} applied={undefined} onApplyFix={() => {}} />)).toBe('');
  });
});
