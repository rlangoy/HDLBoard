// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every piece of text the student reads about a diagnostic — kept apart from
 * parsing and storage so the wording can change without touching them
 * (docs/editor_diagnostics_implementation_plan.md § 4.5). Pure.
 */

import { byDisplayOrder, countSeverities, type LineDiagnostic, type LineMessage } from './diagnosticStore';

export const INLINE_MESSAGE_MAX_CHARS = 120;
const ELLIPSIS = '…';
const DETAIL_INDENT = '  ';
export const CLEAR_HINT = 'Click or type in the file to clear the markers.';

function inDisplayOrder(line: LineDiagnostic): LineMessage[] {
  return [...line.messages].sort(byDisplayOrder);
}

function truncate(text: string): string {
  return text.length <= INLINE_MESSAGE_MAX_CHARS ? text : `${text.slice(0, INLINE_MESSAGE_MAX_CHARS - 1)}${ELLIPSIS}`;
}

/** The tooltip: every kept message, errors first, each detail on its own indented line. */
export function describeLine(line: LineDiagnostic): string {
  return inDisplayOrder(line)
    .map((m) => [`${m.severity}: ${m.message}`, ...m.details.map((d) => `${DETAIL_INDENT}${d}`)].join('\n'))
    .join('\n');
}

/** The text after the line's code: the first message, truncated, plus how many more there are. */
export function inlineText(line: LineDiagnostic): string {
  const [first] = inDisplayOrder(line);
  const more = line.messages.length - 1;
  return `${truncate(first.message)}${more > 0 ? ` (+${more} more)` : ''}`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** The screen-reader and status summary of one file; `''` when nothing is marked. */
export function summarize(fileName: string, lines: readonly LineDiagnostic[]): string {
  if (lines.length === 0) return '';
  const { errors, warnings } = countSeverities(lines);
  const totals = [errors > 0 && count(errors, 'error'), warnings > 0 && count(warnings, 'warning')].filter(Boolean);
  const first = [...lines].sort((a, b) => a.line - b.line)[0];
  const [message] = inDisplayOrder(first);
  return `${fileName}: ${totals.join(', ')}. First on line ${first.line}: ${message.message}. ${CLEAR_HINT}`;
}
