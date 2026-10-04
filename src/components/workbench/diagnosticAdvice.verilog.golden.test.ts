// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The acceptance test of docs/editor_diagnostics_verilog_research.md § 4: every
 * measured Icarus capture (diagnostics.verilog.corpus.ts) through parse → locate →
 * advise → store, the way the browser gets it (an ERROR frame when the compile
 * failed, LOG lines when it passed), compared with the expected result.
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, adviseLogDiagnostics, revealTarget, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import {
  VERILOG_CORPUS,
  VERILOG_CORPUS_BASES,
  verilogCorpusSource,
  type VerilogCorpusCase,
} from './diagnostics.verilog.corpus';
import { addToFiles, isFollowOn, NO_DIAGNOSTICS } from './diagnosticStore';
import { describeLine, inlineText } from './diagnosticText';
import { EXAMPLE_FILES } from './files';

const FILE_ID = 'corpus';

function caseById(id: string): VerilogCorpusCase {
  const found = VERILOG_CORPUS.find((c) => c.id === id);
  if (!found) throw new Error(`no corpus case ${id}`);
  return found;
}

function snapshotOf(corpusCase: VerilogCorpusCase): RunSnapshot {
  return { files: [{ id: FILE_ID, name: corpusCase.fileName, content: verilogCorpusSource(corpusCase) }] };
}

/** As useDiagnostics does: a failed compile is one ERROR frame, a passing one's warnings are LOG lines. */
function advise(corpusCase: VerilogCorpusCase): AdvisedDiagnostic[] {
  const snapshot = snapshotOf(corpusCase);
  if (corpusCase.exitCode !== 0) {
    const located = locateDiagnostics(parseDiagnostics(corpusCase.output), snapshot, snapshot.files);
    return adviseDiagnostics(located, snapshot);
  }
  return corpusCase.output
    .split('\n')
    .filter((line) => line !== '')
    .flatMap((line) => adviseLogDiagnostics(locateDiagnostics(parseDiagnostics(line), snapshot, snapshot.files), snapshot));
}

/** Icarus gives no column; its messages keep their order within a line. */
function byLine(a: AdvisedDiagnostic, b: AdvisedDiagnostic): number {
  return a.line - b.line;
}

function underlined(corpusCase: VerilogCorpusCase, diagnostic: AdvisedDiagnostic): string | undefined {
  const span = diagnostic.advice?.span;
  const line = verilogCorpusSource(corpusCase).split('\n')[diagnostic.line - 1];
  return span && line.slice(span.start, span.end);
}

interface Outcome {
  readonly line: number;
  readonly underlined: string | undefined;
  /** `undefined`: Icarus's text is shown unchanged. */
  readonly headline: string | undefined;
  readonly relatedLine: number | undefined;
  readonly muted: number;
  readonly visible: number;
}

/** The first message left visible by line, and how many are muted. */
function outcome(corpusCase: VerilogCorpusCase): Outcome {
  const messages = advise(corpusCase);
  const visible = messages.filter((d) => !isFollowOn(d)).sort(byLine);
  const [first] = visible;
  return {
    line: first.line,
    underlined: underlined(corpusCase, first),
    headline: first.advice?.headline,
    relatedLine: first.advice?.relatedLine,
    muted: messages.length - visible.length,
    visible: visible.length,
  };
}

/** Every message left visible, as `line [underlined] headline` — `Icarus: …` where there is no headline. */
function visibleMessages(corpusCase: VerilogCorpusCase): string[] {
  return advise(corpusCase)
    .filter((d) => !isFollowOn(d))
    .sort(byLine)
    .map((d) => `${d.line} [${underlined(corpusCase, d) ?? ''}] ${d.advice?.headline ?? `Icarus: ${d.message}`}`);
}

const keyword = (word: string, meant: string) => `\`${word}\` is not a Verilog keyword — did you mean \`${meant}\`?`;
const keywordOnLine = (word: string, line: number, meant: string) =>
  `\`${word}\` (line ${line}) is not a Verilog keyword — did you mean \`${meant}\`?`;
const undeclared = (word: string, meant: string) => `\`${word}\` is not declared — did you mean \`${meant}\`?`;
const missingSemicolon = (line: number) => `Probably a missing \`;\` at the end of line ${line}.`;

const row = (
  line: number,
  underlinedText: string | undefined,
  headline: string | undefined,
  relatedLine: number | undefined,
  muted: number,
  visible: number,
): Outcome => ({ line, underlined: underlinedText, headline, relatedLine, muted, visible });

/** Research § 4, one row per mistake of § 2.1 (the two-mistake files are below). */
const EXPECTED: Readonly<Record<string, Outcome>> = {
  // Rule B on the reported line: Icarus reads a misspelled keyword as a module instance (F2)
  'module-typo': row(6, 'modul', keyword('modul', 'module'), undefined, 0, 1),
  'input-typo': row(8, 'inptu', keyword('inptu', 'input'), undefined, 0, 1),
  'output-typo': row(10, 'ouput', keyword('ouput', 'output'), undefined, 0, 1),
  'wire-typo': row(8, 'wrie', keyword('wrie', 'wire'), undefined, 0, 1),
  'reg-typo': row(29, 'rge', keyword('rge', 'reg'), undefined, 1, 1),
  'localparam-typo': row(22, 'localparm', keyword('localparm', 'localparam'), undefined, 1, 1),
  'always-typo': row(31, 'alwyas', keyword('alwyas', 'always'), undefined, 4, 2),
  'assign-typo': row(41, 'assgin', keyword('assgin', 'assign'), undefined, 1, 1),
  'posedge-typo': row(31, 'posedeg', keyword('posedeg', 'posedge'), undefined, 2, 1),
  'else-typo': row(35, 'esle', keyword('esle', 'else'), undefined, 1, 2),
  // Rule B on the previous code line: reported one code line late (F3)
  'begin-typo': row(32, undefined, keywordOnLine('begn', 31, 'begin'), 31, 3, 3),
  'end-typo': row(38, undefined, keywordOnLine('edn', 37, 'end'), 37, 0, 2),
  'endmodule-typo': row(52, undefined, keywordOnLine('endmodul', 51, 'endmodule'), 51, 0, 1),
  // Rule D: a missing `;`, reported at the next statement
  'semicolon-nonblocking': row(34, undefined, missingSemicolon(33), 33, 0, 1),
  'semicolon-decl': row(31, undefined, missingSemicolon(29), 29, 4, 3),
  'semicolon-localparam': row(26, undefined, missingSemicolon(22), 22, 1, 1),
  // Right as printed: line 41 names the statement itself (the markers plan reveals it)
  'semicolon-assign': row(41, undefined, undefined, undefined, 0, 2),
  // Still vague (§ 3, point 3, and the operator mistakes of § 4)
  'endmodule-missing': row(52, undefined, undefined, undefined, 0, 1),
  'end-missing': row(51, undefined, undefined, undefined, 0, 1),
  'begin-missing': row(38, undefined, undefined, undefined, 1, 1),
  'paren-missing': row(31, undefined, undefined, undefined, 5, 2),
  'assign-reversed': row(33, undefined, undefined, undefined, 1, 1),
  'compare-assign': row(32, undefined, undefined, undefined, 1, 1),
  // Rule C: undeclared names (F5)
  'undeclared-counter': row(36, 'conter', undeclared('conter', 'counter'), undefined, 0, 1),
  'undeclared-led': row(34, 'led_stat', undeclared('led_stat', 'led_state'), undefined, 0, 1),
  'undeclared-clock': row(31, 'CLOCK_50Hz', undeclared('CLOCK_50Hz', 'CLOCK_500Hz'), undefined, 0, 2),
  // Rule G: the silent bug — a warning on a successful compile (F4)
  'undeclared-port': row(
    41,
    'LEDRR',
    '`LEDRR` is not declared — did you mean `LEDR`? Verilog made a new, unconnected wire.',
    undefined,
    0,
    1,
  ),
  // Rule H: Icarus's own advice, rewritten for a beginner (F6)
  'assign-to-reg': row(
    41,
    'led_state',
    '`led_state` is a `reg`: drive it inside an `always` block, or declare it as `wire`.',
    undefined,
    0,
    1,
  ),
  'wire-in-always': row(
    34,
    'led_state',
    '`led_state` is a `wire`: only a `reg` can be assigned inside an `always` block — declare it as `reg`.',
    undefined,
    0,
    1,
  ),
  // Rule E: joined keywords
  elseif: row(35, 'elseif', '`elseif` (line 35) must be two words in Verilog: `else if`.', undefined, 1, 2),
  endif: row(38, undefined, '`endif` (line 37) is written `end` in Verilog.', 37, 0, 2),
};

/** Every message left visible: the two-mistake files, and the markers plan's own case. */
const EXPECTED_VISIBLE: Readonly<Record<string, readonly string[]>> = {
  // The second, independent mistake stays visible, and Rule D names it: Icarus says `45: Invalid module item.`
  'two-mistakes': [`31 [alwyas] ${keyword('alwyas', 'always')}`, '37 [] Icarus: syntax error', `45 [] ${missingSemicolon(41)}`],
  // The port dump stops at the first elaboration error: LEDRR is never reported (§ 2.1)
  'two-semantic': [`36 [conter] ${undeclared('conter', 'counter')}`],
  // docs/editor_diagnostics_implementation_plan.md A.7: line 19 already says it, so line 23 gets no Rule D
  'de1soc-semicolon': [
    '19 [] Icarus: Syntax error in left side of continuous assignment.',
    '23 [] Icarus: syntax error',
  ],
};

describe('the corpus', () => {
  test('every capture has an expected result', () => {
    const covered = [...Object.keys(EXPECTED), ...Object.keys(EXPECTED_VISIBLE)];
    expect(VERILOG_CORPUS.map((c) => c.id).sort()).toEqual(covered.sort());
  });

  test.each(['blinkTest.v', 'DE1_SoC.v'])(
    'was measured on the starter %s as it is now (re-run tools/iverilog-typo-corpus.mjs if it changed)',
    (name) => {
      const starter = EXAMPLE_FILES.find((file) => file.name === name);
      expect(VERILOG_CORPUS_BASES[name]).toBe(starter?.content.replace(/\r\n/g, '\n'));
    },
  );
});

describe('§ 4: one mistake', () => {
  test.each(Object.entries(EXPECTED))('%s', (id, expected) => {
    expect(outcome(caseById(id))).toEqual(expected);
  });

  test('24 of the 31 name the real mistake; 1 is right as printed, 6 stay vague', () => {
    const headlines = Object.keys(EXPECTED).filter((id) => outcome(caseById(id)).headline !== undefined);
    expect([headlines.length, Object.keys(EXPECTED).length]).toEqual([24, 31]);
  });

  test('27 of 70 messages are muted', () => {
    const totals = Object.keys(EXPECTED).map((id) => outcome(caseById(id)));
    const muted = totals.reduce((sum, o) => sum + o.muted, 0);
    const all = totals.reduce((sum, o) => sum + o.muted + o.visible, 0);
    expect([muted, all]).toEqual([27, 70]);
  });
});

describe('two mistakes: the independent one stays visible', () => {
  test.each(Object.entries(EXPECTED_VISIBLE))('%s', (id, expected) => {
    expect(visibleMessages(caseById(id))).toEqual(expected);
  });
});

describe('the reveal', () => {
  test.each([
    ['always-typo', 31],
    ['begin-typo', 31],
    ['endmodule-typo', 51],
    ['semicolon-localparam', 22],
    ['semicolon-decl', 29],
    ['endif', 37],
    ['de1soc-semicolon', 19],
  ])('%s reveals line %i', (id, line) => {
    expect(revealTarget(advise(caseById(id)))?.line).toBe(line);
  });

  test('a warning never moves the view (undeclared-port)', () => {
    expect(revealTarget(advise(caseById('undeclared-port')))).toBeUndefined();
  });
});

describe('the store and the wording, end to end', () => {
  test('the inline text is the advice', () => {
    const [line] = addToFiles(NO_DIAGNOSTICS, advise(caseById('always-typo')))[FILE_ID];
    expect(inlineText(line)).toBe(keyword('alwyas', 'always'));
  });

  test('the tooltip names Icarus in front of its own words, and keeps its hint', () => {
    const [line] = addToFiles(NO_DIAGNOSTICS, advise(caseById('module-typo')))[FILE_ID];
    expect(describeLine(line).split('\n').slice(0, 3)).toEqual([
      `error: ${keyword('modul', 'module')}`,
      '',
      'Icarus: syntax error',
    ]);
  });

  test('a cascade keeps its muted lines, without inline text', () => {
    const lines = addToFiles(NO_DIAGNOSTICS, advise(caseById('always-typo')))[FILE_ID];
    expect(lines.map(inlineText).filter((text) => text !== '')).toEqual([
      keyword('alwyas', 'always'),
      'syntax error',
    ]);
  });
});
