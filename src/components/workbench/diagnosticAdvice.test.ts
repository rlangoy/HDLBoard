// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, isSyntaxError, revealTarget } from './diagnosticAdvice';
import type { LocatedDiagnostic, RunSnapshot } from './diagnosticLocation';
import { STARTER_FILES } from './files';
import { tokenizeVhdlLine } from './vhdlHighlight';
import { isReservedWord } from './vhdlWords';

const MISSING_SEMICOLON = 'missing ";" at end of statement';

function snapshotOf(...contents: string[]): RunSnapshot {
  return { files: contents.map((content, i) => ({ id: `f${i}`, name: `f${i}.vhdl`, content })) };
}

/** An error in the first file at the start of `word` on `line`. */
function errorAt(snapshot: RunSnapshot, place: { line: number; word: string }, message = MISSING_SEMICOLON): LocatedDiagnostic {
  const text = snapshot.files[0].content.split('\n')[place.line - 1];
  return { fileId: 'f0', line: place.line, column: text.indexOf(place.word) + 1, severity: 'error', message, details: [] };
}

function headlineFor(snapshot: RunSnapshot, diagnostic: LocatedDiagnostic): string | undefined {
  return adviseDiagnostics([diagnostic], snapshot)[0].advice?.headline;
}

/** Identifiers of the VHDL starter designs (files.ts), without the reserved words. */
function starterIdentifiers(): string[] {
  const words = STARTER_FILES.filter((file) => file.folder === 'vhdl')
    .flatMap((file) => file.content.split('\n').flatMap((line) => tokenizeVhdlLine(line)))
    .filter((token) => token.type === 'identifier' && !isReservedWord(token.text))
    .map((token) => token.text);
  return [...new Set(words)];
}

/** Typical student names (§ 2.7), including the ones one or two edits from a keyword. */
const STUDENT_NAMES = [
  'clk', 'clock', 'clk_50', 'rst', 'reset', 'reset_n', 'rst_n', 'enable', 'en', 'ena', 'din', 'dout',
  'data', 'data_in', 'data_out', 'input', 'inputs', 'output', 'outputs', 'inp', 'outp', 'sel', 'mux_out',
  'q', 'd', 'count', 'counter', 'cnt', 'cout', 'cin', 'sum', 'carry', 'busy', 'done', 'ready', 'valid',
  'start', 'stop', 'state', 'next_state', 'state_reg', 'mode', 'port_a', 'port_b', 'addr', 'address',
  'wr_en', 'rd_en', 'we', 'mem', 'ram', 'rom', 'reg', 'regs', 'shift', 'shift_reg', 'tick', 'pulse',
  'led', 'leds', 'sw', 'switch', 'switches', 'key', 'keys', 'btn', 'button', 'hex', 'seg', 'segments',
  'digit', 'digits', 'bcd', 'bin', 'value', 'temp', 'tmp', 'result', 'res', 'flag', 'toggle', 'blink',
  'timer', 'divider', 'clk_div', 'baud', 'tx', 'rx', 'parity', 'idle', 'run', 'wait_cnt', 'prescaler',
  'compare', 'match', 'strobe', 'latch', 'load', 'clear', 'inc', 'dec', 'up', 'down', 'dir', 'speed',
];

describe('§ 6.2 false-positive guards (Rule B)', () => {
  test.each(starterIdentifiers())('the starter name %s is never "corrected", even undeclared', (name) => {
    const snapshot = snapshotOf(`    q <= ${name} + 1`);
    expect(headlineFor(snapshot, errorAt(snapshot, { line: 1, word: name }))).toBeUndefined();
  });

  test.each(STUDENT_NAMES)('%s, declared in another file, is never "corrected"', (name) => {
    const snapshot = snapshotOf(`    q <= ${name} + 1`, `entity other is port (\n  ${name} : in bit\n);\nend;`);
    expect(headlineFor(snapshot, errorAt(snapshot, { line: 1, word: name }))).toBeUndefined();
  });

  test('a signal declared in the same file is never "corrected"', () => {
    const snapshot = snapshotOf('signal busy : bit;\n    q <= busy + 1');
    expect(headlineFor(snapshot, errorAt(snapshot, { line: 2, word: 'busy' }))).toBeUndefined();
  });

  test('the same word undeclared is (the declaration is what keeps it quiet)', () => {
    const snapshot = snapshotOf('    q <= busy + 1');
    expect(headlineFor(snapshot, errorAt(snapshot, { line: 1, word: 'busy' }))).toBe(
      '`busy` is not a VHDL keyword — did you mean `bus`?',
    );
  });

  test('two equally near keywords give no advice', () => {
    const snapshot = snapshotOf('    q <= a srll 2');
    expect(headlineFor(snapshot, errorAt(snapshot, { line: 1, word: 'srll' }))).toBeUndefined();
  });

  test('a semantic error gets no keyword suggestion', () => {
    const snapshot = snapshotOf('    q <= rnage;');
    const cannotMatch = errorAt(snapshot, { line: 1, word: 'rnage' }, `can't match "rnage" with type bit`);
    expect(headlineFor(snapshot, cannotMatch)).toBeUndefined();
  });
});

describe('Rule C', () => {
  test('nothing near the undeclared name: no advice, GHDL’s text stays', () => {
    const snapshot = snapshotOf('    q <= zzyzx;');
    const undeclared = errorAt(snapshot, { line: 1, word: 'zzyzx' }, 'no declaration for "zzyzx"');
    expect(headlineFor(snapshot, undeclared)).toBeUndefined();
  });

  test('names the word as the student wrote it, not as GHDL prints it', () => {
    const snapshot = snapshotOf('signal Counter : integer;\n    q <= COUTER;');
    const undeclared = errorAt(snapshot, { line: 2, word: 'COUTER' }, 'no declaration for "couter"');
    expect(headlineFor(snapshot, undeclared)).toBe('`COUTER` is not declared — did you mean `Counter`?');
  });

  test('a library name is suggested', () => {
    const snapshot = snapshotOf('    q <= resiz(x);');
    const undeclared = errorAt(snapshot, { line: 1, word: 'resiz' }, 'no declaration for "resiz"');
    expect(headlineFor(snapshot, undeclared)).toBe('`resiz` is not declared — did you mean `resize`?');
  });

  test('a name from the same file wins a tie with a library name', () => {
    const snapshot = snapshotOf('signal resin : bit;\n    q <= resiz(x);');
    const undeclared = errorAt(snapshot, { line: 2, word: 'resiz' }, 'no declaration for "resiz"');
    expect(headlineFor(snapshot, undeclared)).toBe('`resiz` is not declared — did you mean `resin`?');
  });

  test('two equally near names in the same file give no advice', () => {
    const snapshot = snapshotOf('signal cnt_a, cnt_b : bit;\n    q <= cnt_c;');
    const undeclared = errorAt(snapshot, { line: 2, word: 'cnt_c' }, 'no declaration for "cnt_c"');
    expect(headlineFor(snapshot, undeclared)).toBeUndefined();
  });

  test('a name declared only in another file is not suggested', () => {
    const snapshot = snapshotOf('    q <= countr;', 'signal counter : integer;');
    const undeclared = errorAt(snapshot, { line: 1, word: 'countr' }, 'no declaration for "countr"');
    expect(headlineFor(snapshot, undeclared)).toBeUndefined();
  });
});

describe('Rule D', () => {
  test('not when the previous code line ends in ";"', () => {
    const snapshot = snapshotOf('    a <= b;\n    zork <= c;');
    const expected = errorAt(snapshot, { line: 2, word: 'zork' }, "'<=' is expected instead of 'begin'");
    expect(headlineFor(snapshot, expected)).toBeUndefined();
  });

  test('not when GHDL’s caret is not at the start of its line', () => {
    const snapshot = snapshotOf('    if a = b\n    x <= y;');
    const expected = errorAt(snapshot, { line: 2, word: '<=' }, "'then' is expected here");
    expect(headlineFor(snapshot, expected)).toBeUndefined();
  });

  test('not when the previous code line shows an error of its own', () => {
    const snapshot = snapshotOf('    zork(clk)\n    begin');
    const own = errorAt(snapshot, { line: 1, word: ')' }, "';' expected at end of signal assignment");
    const next = errorAt(snapshot, { line: 2, word: 'begin' }, "'<=' is expected instead of 'begin'");
    expect(adviseDiagnostics([next, own], snapshot)[0].advice?.headline).toBeUndefined();
  });

  test('says what to look for when GHDL names nothing', () => {
    const snapshot = snapshotOf('    if a = b\n    x <= y;');
    const other = errorAt(snapshot, { line: 2, word: 'x' }, 'a generate statement must have a label');
    expect(headlineFor(snapshot, other)).toBe('GHDL noticed this at the start of the line — check the end of line 1.');
  });
});

describe('Rule E', () => {
  test('elseif is one word in VHDL, spelled elsif', () => {
    const snapshot = snapshotOf('architecture a of e is begin\n  elseif x then\n  end if;');
    const expected = errorAt(snapshot, { line: 3, word: 'end' }, "'if' is expected instead of 'process'");
    expect(headlineFor(snapshot, expected)).toBe('`elseif` (line 2) is written `elsif` in VHDL.');
  });

  test('stops at the start of the design unit', () => {
    const snapshot = snapshotOf('  endif;\narchitecture a of e is begin\n  end if;');
    const expected = errorAt(snapshot, { line: 3, word: 'end' }, "'if' is expected instead of 'process'");
    expect(headlineFor(snapshot, expected)).toBeUndefined();
  });
});

describe('Rule F', () => {
  test('"was not analysed" alone in a file is not muted (its cause is elsewhere)', () => {
    const snapshot = snapshotOf('architecture a of e is');
    const alone = errorAt(snapshot, { line: 1, word: 'e' }, 'entity "e" was not analysed');
    expect(adviseDiagnostics([alone], snapshot)[0].advice?.followOnOf).toBeUndefined();
  });

  test('a follow-on on the first error’s own line says so', () => {
    const snapshot = snapshotOf('    q <= rnage 0;');
    const first = errorAt(snapshot, { line: 1, word: 'rnage' }, MISSING_SEMICOLON);
    const same = errorAt(snapshot, { line: 1, word: '0' }, "'end' is expected instead of '0'");
    expect(adviseDiagnostics([first, same], snapshot)[1].advice?.headline).toBe(
      'Probably caused by the first error on this line — fix that one first and run again.',
    );
  });

  test('a later error after a semantic first error is not muted', () => {
    const snapshot = snapshotOf('    q <= couter;\n    r <= other;');
    const first = errorAt(snapshot, { line: 1, word: 'couter' }, 'no declaration for "couter"');
    const lostPlace = errorAt(snapshot, { line: 2, word: 'r' }, 'missing entity, architecture, package or configuration');
    expect(adviseDiagnostics([first, lostPlace], snapshot)[1].advice?.followOnOf).toBeUndefined();
  });
});

describe('what gets no advice', () => {
  test('a warning', () => {
    const snapshot = snapshotOf('    q <= rnage;');
    const warning: LocatedDiagnostic = { ...errorAt(snapshot, { line: 1, word: 'rnage' }), severity: 'warning' };
    expect(adviseDiagnostics([warning], snapshot)[0]).toBe(warning);
  });

  test('a diagnostic without a column (Icarus Verilog, GHDL runtime checks)', () => {
    const snapshot = snapshotOf('assign x = ;');
    const icarus: LocatedDiagnostic = { fileId: 'f0', line: 1, severity: 'error', message: 'syntax error', details: [] };
    expect(adviseDiagnostics([icarus], snapshot)[0]).toBe(icarus);
  });

  test('a column on whitespace between two tokens underlines nothing', () => {
    const snapshot = snapshotOf('    a  b');
    const between: LocatedDiagnostic = { ...errorAt(snapshot, { line: 1, word: 'a' }, 'can’t match'), column: 7 };
    expect(adviseDiagnostics([between], snapshot)[0].advice).toBeUndefined();
  });
});

describe('isSyntaxError', () => {
  test.each([
    'missing ";" at end of object declaration',
    "')' is expected instead of '<integer>'",
    'incorrect constraint for a subtype indication',
    "unexpected token 'begin' in a primary",
    'unit name expected, found signal "led_state"',
    'misspelling, "rtl" expected',
  ])('%s', (message) => {
    expect(isSyntaxError(message)).toBe(true);
  });

  test.each(['no declaration for "couter"', 'can\'t match "led_state" with type STD_ULOGIC', 'entity "x" was not analysed'])(
    'semantic: %s',
    (message) => {
      expect(isSyntaxError(message)).toBe(false);
    },
  );
});

describe('revealTarget', () => {
  test('warnings alone move nothing', () => {
    const snapshot = snapshotOf('    q <= a;');
    const warning: LocatedDiagnostic = { ...errorAt(snapshot, { line: 1, word: 'a' }), severity: 'warning' };
    expect(revealTarget(adviseDiagnostics([warning], snapshot))).toBeUndefined();
  });
});
