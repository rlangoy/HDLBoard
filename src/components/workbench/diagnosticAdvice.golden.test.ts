// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The acceptance test of docs/editor_diagnostics_improvement_plan.md § 5: every
 * measured GHDL capture (diagnostics.corpus.ts) through parse → locate → advise →
 * store, compared with the expected result for that case.
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, revealTarget, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { CORPUS, CORPUS_BASES, corpusSource, type CorpusCase } from './diagnostics.corpus';
import { addToFiles, isFollowOn, NO_DIAGNOSTICS } from './diagnosticStore';
import { inlineText } from './diagnosticText';
import { STARTER_FILES } from './files';

const FILE_ID = 'corpus';

function caseById(id: string): CorpusCase {
  const found = CORPUS.find((c) => c.id === id);
  if (!found) throw new Error(`no corpus case ${id}`);
  return found;
}

function snapshotOf(corpusCase: CorpusCase): RunSnapshot {
  return { files: [{ id: FILE_ID, name: corpusCase.fileName, content: corpusSource(corpusCase) }] };
}

function advise(corpusCase: CorpusCase): AdvisedDiagnostic[] {
  const snapshot = snapshotOf(corpusCase);
  const located = locateDiagnostics(parseDiagnostics(corpusCase.output), snapshot, snapshot.files);
  return adviseDiagnostics(located, snapshot);
}

function byPosition(a: AdvisedDiagnostic, b: AdvisedDiagnostic): number {
  return a.line - b.line || (a.column ?? 0) - (b.column ?? 0);
}

/** The underlined text of a diagnostic, cut from the source GHDL saw. */
function underlined(corpusCase: CorpusCase, diagnostic: AdvisedDiagnostic): string | undefined {
  const span = diagnostic.advice?.span;
  const line = corpusSource(corpusCase).split('\n')[diagnostic.line - 1];
  return span && line.slice(span.start, span.end);
}

interface Outcome {
  readonly line: number;
  readonly underlined: string | undefined;
  /** `undefined`: GHDL's text is shown unchanged. */
  readonly headline: string | undefined;
  readonly relatedLine: number | undefined;
  readonly muted: number;
  readonly visible: number;
}

/** What § 5 lists for a case: its first error by position, and how many errors are muted. */
function outcome(corpusCase: CorpusCase): Outcome {
  const errors = advise(corpusCase).filter((d) => d.severity === 'error');
  const visible = errors.filter((d) => !isFollowOn(d)).sort(byPosition);
  const [first] = visible;
  return {
    line: first.line,
    underlined: underlined(corpusCase, first),
    headline: first.advice?.headline,
    relatedLine: first.advice?.relatedLine,
    muted: errors.length - visible.length,
    visible: visible.length,
  };
}

/** Every error left visible, as `line [underlined] headline` — `GHDL: …` where there is no headline. */
function visibleErrors(corpusCase: CorpusCase): string[] {
  return advise(corpusCase)
    .filter((d) => d.severity === 'error' && !isFollowOn(d))
    .sort(byPosition)
    .map((d) => `${d.line} [${underlined(corpusCase, d) ?? ''}] ${d.advice?.headline ?? `GHDL: ${d.message}`}`);
}

const keyword = (word: string, meant: string) => `\`${word}\` is not a VHDL keyword — did you mean \`${meant}\`?`;
const undeclared = (word: string, meant: string) => `\`${word}\` is not declared — did you mean \`${meant}\`?`;
const missingAtEnd = (symbol: string, line: number) => `Probably a missing \`${symbol}\` at the end of line ${line}.`;

/** § 5, one row per mistake of § 2.2. */
const EXPECTED: Readonly<Record<string, Outcome>> = {
  'range-typo': { line: 33, underlined: 'rttange', headline: keyword('rttange', 'range'), relatedLine: undefined, muted: 0, visible: 1 },
  'range-underscore': { line: 33, underlined: 'ra_nge', headline: keyword('ra_nge', 'range'), relatedLine: undefined, muted: 0, visible: 1 },
  'range-swap': { line: 33, underlined: 'rnage', headline: keyword('rnage', 'range'), relatedLine: undefined, muted: 0, visible: 1 },
  'downto-typo': { line: 13, underlined: 'dwonto', headline: keyword('dwonto', 'downto'), relatedLine: undefined, muted: 11, visible: 3 },
  'signal-typo': { line: 34, underlined: 'signl', headline: keyword('signl', 'signal'), relatedLine: undefined, muted: 0, visible: 1 },
  'process-typo': { line: 38, underlined: 'proces', headline: keyword('proces', 'process'), relatedLine: undefined, muted: 17, visible: 3 },
  'begin-typo': { line: 39, underlined: 'begn', headline: keyword('begn', 'begin'), relatedLine: undefined, muted: 9, visible: 3 },
  'then-typo': { line: 40, underlined: 'than', headline: keyword('than', 'then'), relatedLine: undefined, muted: 1, visible: 2 },
  'then-missing': { line: 41, underlined: 'if', headline: missingAtEnd('then', 40), relatedLine: 40, muted: 0, visible: 1 },
  'endif-joined': {
    line: 48,
    underlined: 'end',
    headline: '`endif` (line 46) must be two words in VHDL: `end if`.',
    relatedLine: 46,
    muted: 2,
    visible: 1,
  },
  'architecture-typo': {
    line: 25,
    underlined: 'architecure',
    headline: keyword('architecure', 'architecture'),
    relatedLine: undefined,
    muted: 10,
    visible: 1,
  },
  'entity-typo': { line: 10, underlined: 'entitiy', headline: keyword('entitiy', 'entity'), relatedLine: undefined, muted: 10, visible: 1 },
  'is-missing': { line: 31, underlined: 'constant', headline: missingAtEnd('is', 25), relatedLine: 25, muted: 0, visible: 1 },
  'mode-typo': { line: 12, underlined: 'inn', headline: undeclared('inn', 'in'), relatedLine: undefined, muted: 1, visible: 1 },
  'others-typo': { line: 51, underlined: 'other', headline: undeclared('other', 'others'), relatedLine: undefined, muted: 0, visible: 1 },
  'semicolon-missing': { line: 33, underlined: '0', headline: undefined, relatedLine: undefined, muted: 0, visible: 1 },
  'semicolon-missing-assign': {
    line: 43,
    underlined: 'led_state',
    headline: missingAtEnd(';', 42),
    relatedLine: 42,
    muted: 1,
    visible: 1,
  },
  'assign-reversed': { line: 42, underlined: '=<', headline: undefined, relatedLine: undefined, muted: 0, visible: 1 },
  'const-assign': { line: 31, underlined: '=', headline: undefined, relatedLine: undefined, muted: 0, visible: 1 },
  'type-typo': { line: 34, underlined: 'std_logc', headline: undeclared('std_logc', 'std_logic'), relatedLine: undefined, muted: 0, visible: 3 },
  'function-typo': {
    line: 40,
    underlined: 'rising_egde',
    headline: undeclared('rising_egde', 'rising_edge'),
    relatedLine: undefined,
    muted: 0,
    visible: 1,
  },
  'signal-name-typo': { line: 45, underlined: 'couter', headline: undeclared('couter', 'counter'), relatedLine: undefined, muted: 0, visible: 1 },
};

/** § 5, the files of § 2.5 and the § 6.2 guards: every error left visible. */
const EXPECTED_VISIBLE: Readonly<Record<string, readonly string[]>> = {
  'range-typo+assign-reversed': [`33 [rttange] ${keyword('rttange', 'range')}`, `42 [=<] GHDL: "<=" or ":=" expected instead of '='`],
  'signal-typo+then-missing': [`34 [signl] ${keyword('signl', 'signal')}`, `41 [if] ${missingAtEnd('then', 40)}`],
  'then-missing+semicolon-missing-51': [
    `41 [if] ${missingAtEnd('then', 40)}`,
    "51 [)] GHDL: ';' expected at end of signal assignment",
  ],
  'downto-typo+then-typo': [
    `13 [dwonto] ${keyword('dwonto', 'downto')}`,
    "14 [KEY_N] GHDL: object class keyword such as 'variable' is expected",
    `15 [LEDR] GHDL: 'end' is expected instead of "ledr"`,
    `40 [than] ${keyword('than', 'then')}`,
    `41 [if] GHDL: "<=" or ":=" expected instead of 'if'`,
  ],
  'process-typo+semicolon-missing-51': [
    `38 [proces] ${keyword('proces', 'process')}`,
    "39 [begin] GHDL: '<=' is expected instead of 'begin'",
    "45 [<=] GHDL: ':' is expected instead of '<='",
  ],
  // After a syntax error GHDL does no semantic analysis: `couter` is never reported.
  'signal-typo+signal-name-typo': [`34 [signl] ${keyword('signl', 'signal')}`],
  'signal-name-typo+others-typo': [`45 [couter] ${undeclared('couter', 'counter')}`, `51 [other] ${undeclared('other', 'others')}`],
  'endif-far': ['60 [end] `endif` (line 46) must be two words in VHDL: `end if`.'],
  // `signed` is a library name two tokens away: never "corrected" to `signal`.
  'signed-downto-typo': [`34 [dwonto] ${keyword('dwonto', 'downto')}`],
  // A student's own `misspelling` after an independent syntax error stays visible.
  'range-typo+end-name-typo': [`33 [rttange] ${keyword('rttange', 'range')}`, '53 [rtll] GHDL: misspelling, "rtl" expected'],
  // `zignal` keeps no first letter of a keyword, and line 33 ends in `;`: no Rule B, no Rule D.
  'signal-first-letter': ["34 [zignal] GHDL: object class keyword such as 'variable' is expected"],
};

const COLUMN_CASES = CORPUS.filter((c) => c.id.startsWith('column-')).map((c) => c.id);

describe('the corpus', () => {
  test('every capture has an expected result', () => {
    const covered = [...Object.keys(EXPECTED), ...Object.keys(EXPECTED_VISIBLE), ...COLUMN_CASES];
    expect(CORPUS.map((c) => c.id).sort()).toEqual(covered.sort());
  });

  test('was measured on the starter blinkTest.vhdl as it is now (re-run tools/ghdl-typo-corpus.mjs if it changed)', () => {
    const starter = STARTER_FILES.find((file) => file.name === 'blinkTest.vhdl');
    expect(CORPUS_BASES['blinkTest.vhdl']).toBe(starter?.content.replace(/\r\n/g, '\n'));
  });
});

describe('§ 5: one mistake', () => {
  test.each(Object.entries(EXPECTED))('%s', (id, expected) => {
    expect(outcome(caseById(id))).toEqual(expected);
  });

  test('19 of the 22 name the real mistake; the other 3 keep GHDL’s correct text', () => {
    const headlines = Object.keys(EXPECTED).filter((id) => outcome(caseById(id)).headline !== undefined);
    expect(headlines.length).toBe(19);
  });

  test('62 of 93 errors are muted', () => {
    const totals = Object.keys(EXPECTED).map((id) => outcome(caseById(id)));
    const muted = totals.reduce((sum, o) => sum + o.muted, 0);
    const all = totals.reduce((sum, o) => sum + o.muted + o.visible, 0);
    expect([muted, all]).toEqual([62, 93]);
  });
});

describe('§ 2.5 and § 6.2: independent mistakes stay visible', () => {
  test.each(Object.entries(EXPECTED_VISIBLE))('%s', (id, expected) => {
    expect(visibleErrors(caseById(id))).toEqual(expected);
  });

  test('dwonto + than: 12 of 17 errors muted', () => {
    const errors = advise(caseById('downto-typo+then-typo'));
    expect([errors.filter(isFollowOn).length, errors.length]).toEqual([12, 17]);
  });
});

describe('§ 2.4: the underline lands on the typo whatever the indentation', () => {
  test.each(COLUMN_CASES)('%s', (id) => {
    expect(outcome(caseById(id)).underlined).toBe('rttange');
  });
});

describe('§ 4.10: the reveal', () => {
  test.each([
    ['range-typo', 33],
    ['process-typo', 38],
    ['is-missing', 25],
    ['then-missing', 40],
    ['endif-joined', 46],
    ['endif-far', 60],
    ['downto-typo+then-typo', 13],
  ])('%s reveals line %i', (id, line) => {
    expect(revealTarget(advise(caseById(id)))?.line).toBe(line);
  });
});

describe('the store and the wording, end to end', () => {
  test('the reported case: the inline text is the advice', () => {
    const [line] = addToFiles(NO_DIAGNOSTICS, advise(caseById('range-typo')))[FILE_ID];
    expect(inlineText(line)).toBe(keyword('rttange', 'range'));
  });

  test('a cascade keeps its muted lines, without inline text', () => {
    const lines = addToFiles(NO_DIAGNOSTICS, advise(caseById('architecture-typo')))[FILE_ID];
    expect(lines.map(inlineText).filter((text) => text !== '')).toEqual([keyword('architecure', 'architecture')]);
  });
});
