// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Per-file storage of located diagnostics, with the caps and dedup policy of
 * docs/editor_diagnostics_implementation_plan.md § 4.5.1. Pure: every function
 * returns a new object and never mutates its input. It does no text formatting
 * (that is `diagnosticText.ts`).
 */

import type { Advice, AdvisedDiagnostic, Span } from './diagnosticAdvice';
import type { DiagnosticSeverity } from './diagnostics';

/** A runtime assertion with a changing text ($error("count=%0d", i)) would otherwise grow without bound. */
export const MAX_MESSAGES_PER_LINE = 5;
/** Bounds the DOM work of a file full of errors. */
export const MAX_MARKED_LINES_PER_FILE = 200;

/** One message on a line: a Diagnostic without its location. */
export interface LineMessage {
  readonly severity: DiagnosticSeverity;
  /** The compiler's text: what the dedup compares, and what the console shows. */
  readonly message: string;
  readonly details: readonly string[];
  /** What HDLBoard adds (docs/editor_diagnostics_improvement_plan.md § 4.1). */
  readonly advice?: Advice;
  /** Shown only in the gutter and the tooltip (`Diagnostic.quiet`). */
  readonly quiet?: boolean;
}

/** Everything reported on one line; `severity` is the worst of its messages. */
export interface LineDiagnostic {
  readonly line: number;
  readonly severity: DiagnosticSeverity;
  readonly messages: readonly LineMessage[];
}

/** Per file id, lines ascending. A file with nothing reported has no key. */
export type DiagnosticsByFile = Readonly<Record<string, readonly LineDiagnostic[]>>;

export const NO_DIAGNOSTICS: DiagnosticsByFile = {};

/** A muted follow-on error (Rule F): shown only in the gutter and the tooltip. */
export function isFollowOn(message: { readonly advice?: Advice }): boolean {
  return message.advice?.followOnOf !== undefined;
}

/** A line whose every message is a muted follow-on error. */
export function isFollowOnLine(line: LineDiagnostic): boolean {
  return line.messages.every(isFollowOn);
}

/**
 * Shown only in the gutter and the tooltip: a muted follow-on error, or a quiet
 * warning. Neither has inline text or an underline, counts on the file's tab, or is
 * where the editor jumps.
 */
export function isMuted(message: { readonly advice?: Advice; readonly quiet?: boolean }): boolean {
  return isFollowOn(message) || message.quiet === true;
}

/** A line whose every message is muted. */
export function isMutedLine(line: LineDiagnostic): boolean {
  return line.messages.every(isMuted);
}

/** A line whose every message is a quiet warning: its `!` stays, its tint goes. */
export function isQuietLine(line: LineDiagnostic): boolean {
  return line.messages.every((m) => m.quiet === true);
}

function displayRank(message: LineMessage): number {
  return (isMuted(message) ? 2 : 0) + (message.severity === 'error' ? 0 : 1);
}

/** Errors first, then warnings, then muted messages; equal ranks keep arrival order (the sort is stable). */
export function byDisplayOrder(a: LineMessage, b: LineMessage): number {
  return displayRank(a) - displayRank(b);
}

/** Counts the messages the student is meant to read: muted ones are left out. */
export function countSeverities(lines: readonly LineDiagnostic[]): { errors: number; warnings: number } {
  const messages = lines.flatMap((line) => line.messages).filter((m) => !isMuted(m));
  const errors = messages.filter((m) => m.severity === 'error').length;
  return { errors, warnings: messages.length - errors };
}

/** The words to underline on a line: those of its messages that are not muted. */
export function visibleSpans(line: LineDiagnostic): Span[] {
  return line.messages.flatMap((m) => (m.advice?.span && !isMuted(m) ? [m.advice.span] : []));
}

/**
 * The lines a message points at from elsewhere (Rules D and E), each with the
 * marked line that points there. A line that is marked itself gets no hint.
 */
export function hintLines(lines: readonly LineDiagnostic[]): ReadonlyMap<number, LineDiagnostic> {
  const marked = new Set(lines.map((line) => line.line));
  const hints = new Map<number, LineDiagnostic>();
  for (const line of lines) {
    for (const { advice } of line.messages) {
      const related = advice?.relatedLine;
      if (related !== undefined && !marked.has(related) && !hints.has(related)) hints.set(related, line);
    }
  }
  return hints;
}

function isDuplicate(messages: readonly LineMessage[], candidate: LineMessage): boolean {
  return messages.some((m) => m.severity === candidate.severity && m.message === candidate.message);
}

function withinMessageLimit(messages: readonly LineMessage[]): boolean {
  return messages.length < MAX_MESSAGES_PER_LINE;
}

function withinLineLimit(lines: readonly LineDiagnostic[]): boolean {
  return lines.length < MAX_MARKED_LINES_PER_FILE;
}

function worstSeverity(messages: readonly LineMessage[]): DiagnosticSeverity {
  return messages.some((m) => m.severity === 'error') ? 'error' : 'warning';
}

function lineWith(line: number, messages: readonly LineMessage[]): LineDiagnostic {
  return { line, severity: worstSeverity(messages), messages };
}

/** Adds one message to a file's lines; returns the input array itself when nothing was added. */
function addToLines(lines: readonly LineDiagnostic[], diagnostic: AdvisedDiagnostic): readonly LineDiagnostic[] {
  const message: LineMessage = {
    severity: diagnostic.severity,
    message: diagnostic.message,
    details: diagnostic.details,
    ...(diagnostic.advice && { advice: diagnostic.advice }),
    ...(diagnostic.quiet && { quiet: true }),
  };
  const existing = lines.find((l) => l.line === diagnostic.line);
  if (existing) {
    if (isDuplicate(existing.messages, message) || !withinMessageLimit(existing.messages)) return lines;
    const updated = lineWith(existing.line, [...existing.messages, message]);
    return lines.map((l) => (l === existing ? updated : l));
  }
  if (!withinLineLimit(lines)) return lines;
  return [...lines, lineWith(diagnostic.line, [message])].sort((a, b) => a.line - b.line);
}

/**
 * Groups by file and line. If nothing was added, returns `byFile` itself: up to
 * 200 LOG lines arrive per second, and once a repeating assertion is stored
 * each further frame must cost React no render.
 */
export function addToFiles(byFile: DiagnosticsByFile, located: readonly AdvisedDiagnostic[]): DiagnosticsByFile {
  let next = byFile;
  for (const diagnostic of located) {
    const before = next[diagnostic.fileId] ?? [];
    const after = addToLines(before, diagnostic);
    if (after !== before) next = { ...next, [diagnostic.fileId]: after };
  }
  return next;
}

/** Returns the same object when the file has no entry, so React does not re-render for nothing. */
export function withoutFile(byFile: DiagnosticsByFile, fileId: string): DiagnosticsByFile {
  if (!(fileId in byFile)) return byFile;
  const { [fileId]: _removed, ...rest } = byFile;
  return rest;
}
