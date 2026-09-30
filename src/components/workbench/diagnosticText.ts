// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every piece of text the student reads about a diagnostic — kept apart from
 * parsing and storage so the wording can change without touching them
 * (docs/editor_diagnostics_implementation_plan.md § 4.5, and the advice of
 * docs/editor_diagnostics_improvement_plan.md § 4.9). Pure.
 */

import {
  byDisplayOrder,
  countSeverities,
  isFollowOn,
  isFollowOnLine,
  type LineDiagnostic,
  type LineMessage,
} from './diagnosticStore';

export const INLINE_MESSAGE_MAX_CHARS = 120;
const ELLIPSIS = '…';
const DETAIL_INDENT = '  ';
export const CLEAR_HINT = 'Click or type in the file to clear the markers.';
/** Put in front of the compiler's own sentence when advice is the headline. */
const COMPILER_PREFIX = 'GHDL: ';
const ENDS_A_SENTENCE = /[.?!]$/;

const code = (text: string): string => `\`${text}\``;

/**
 * The advice headlines (improvement plan § 4.9): the student's own word in code
 * font, one sentence, a question only for a guess, "Probably" where a rule
 * infers a cause, and none of the compiler's vocabulary.
 */
export const adviceText = {
  /** Rule B. */
  keywordTypo: (word: string, keyword: string): string =>
    `${code(word)} is not a VHDL keyword — did you mean ${code(keyword)}?`,
  /** Rule C. */
  undeclared: (word: string, suggestion: string): string =>
    `${code(word)} is not declared — did you mean ${code(suggestion)}?`,
  /** Rule D, when GHDL names what it expected. */
  missingAtEnd: (symbol: string, line: number): string => `Probably a missing ${code(symbol)} at the end of line ${line}.`,
  /** Rule D otherwise. */
  checkEndOfLine: (line: number): string =>
    `GHDL noticed this at the start of the line — check the end of line ${line}.`,
  /** Rule E: `end if` is two words, `elsif` one. */
  joinedKeyword: (word: string, line: number, wanted: string): string =>
    wanted.includes(' ')
      ? `${code(word)} (line ${line}) must be two words in VHDL: ${code(wanted)}.`
      : `${code(word)} (line ${line}) is written ${code(wanted)} in VHDL.`,
  /** Rule F. */
  followOn: (line: number): string => `Probably caused by the error on line ${line} — fix that one first and run again.`,
  /** Rule F, on the line of the first error itself. */
  followOnSameLine: (): string => 'Probably caused by the first error on this line — fix that one first and run again.',
};

function inDisplayOrder(line: LineDiagnostic): LineMessage[] {
  return [...line.messages].sort(byDisplayOrder);
}

function visibleInDisplayOrder(line: LineDiagnostic): LineMessage[] {
  return inDisplayOrder(line).filter((m) => !isFollowOn(m));
}

/** What the student reads first about a message: the advice when there is one, else the compiler's text. */
function headlineOf(message: LineMessage): string {
  return message.advice?.headline ?? message.message;
}

function truncate(text: string): string {
  return text.length <= INLINE_MESSAGE_MAX_CHARS ? text : `${text.slice(0, INLINE_MESSAGE_MAX_CHARS - 1)}${ELLIPSIS}`;
}

function describeMessage(m: LineMessage): string {
  const details = m.details.map((d) => `${DETAIL_INDENT}${d}`);
  const headline = m.advice?.headline;
  if (headline === undefined) return [`${m.severity}: ${m.message}`, ...details].join('\n');
  return [`${m.severity}: ${headline}`, '', `${COMPILER_PREFIX}${m.message}`, ...details].join('\n');
}

/**
 * The tooltip: every kept message, errors first, each detail on its own indented
 * line. With advice, the headline comes first and the compiler's own sentence
 * follows after a blank line, prefixed `GHDL:`; a blank line then also separates
 * the messages.
 */
export function describeLine(line: LineDiagnostic): string {
  const hasAdvice = line.messages.some((m) => m.advice?.headline !== undefined);
  return inDisplayOrder(line).map(describeMessage).join(hasAdvice ? '\n\n' : '\n');
}

/** The tooltip of a line that Rules D or E point at from `from`. */
export function describeHint(from: LineDiagnostic): string {
  const [first] = visibleInDisplayOrder(from);
  return first ? `Line ${from.line}: ${headlineOf(first)}` : '';
}

/**
 * The text after the line's code: the first message (its advice headline when
 * there is one), truncated, plus how many more there are. Muted follow-ons are
 * not counted, and a line of only muted follow-ons has no inline text.
 */
export function inlineText(line: LineDiagnostic): string {
  const [first, ...others] = visibleInDisplayOrder(line);
  if (first === undefined) return '';
  return `${truncate(headlineOf(first))}${others.length > 0 ? ` (+${others.length} more)` : ''}`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function asSentence(text: string): string {
  return ENDS_A_SENTENCE.test(text) ? text : `${text}.`;
}

/** The screen-reader and status summary of one file; `''` when nothing is marked. */
export function summarize(fileName: string, lines: readonly LineDiagnostic[]): string {
  const shown = lines.filter((line) => !isFollowOnLine(line));
  if (shown.length === 0) return '';
  const { errors, warnings } = countSeverities(lines);
  const totals = [errors > 0 && count(errors, 'error'), warnings > 0 && count(warnings, 'warning')].filter(Boolean);
  const first = [...shown].sort((a, b) => a.line - b.line)[0];
  const [message] = visibleInDisplayOrder(first);
  return `${fileName}: ${totals.join(', ')}. First on line ${first.line}: ${asSentence(headlineOf(message))} ${CLEAR_HINT}`;
}
