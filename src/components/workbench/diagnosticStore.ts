// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Per-file storage of located diagnostics, with the caps and dedup policy of
 * docs/editor_diagnostics_implementation_plan.md § 4.5.1. Pure: every function
 * returns a new object and never mutates its input. It does no text formatting
 * (that is `diagnosticText.ts`).
 */

import type { DiagnosticSeverity } from './diagnostics';
import type { LocatedDiagnostic } from './diagnosticLocation';

/** A runtime assertion with a changing text ($error("count=%0d", i)) would otherwise grow without bound. */
export const MAX_MESSAGES_PER_LINE = 5;
/** Bounds the DOM work of a file full of errors. */
export const MAX_MARKED_LINES_PER_FILE = 200;

/** One message on a line: a Diagnostic without its location. */
export interface LineMessage {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly details: readonly string[];
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

/** Errors first; equal severities keep arrival order (the sort is stable). */
export function byDisplayOrder(a: LineMessage, b: LineMessage): number {
  return Number(b.severity === 'error') - Number(a.severity === 'error');
}

export function countSeverities(lines: readonly LineDiagnostic[]): { errors: number; warnings: number } {
  const messages = lines.flatMap((line) => line.messages);
  const errors = messages.filter((m) => m.severity === 'error').length;
  return { errors, warnings: messages.length - errors };
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
function addToLines(lines: readonly LineDiagnostic[], diagnostic: LocatedDiagnostic): readonly LineDiagnostic[] {
  const message: LineMessage = {
    severity: diagnostic.severity,
    message: diagnostic.message,
    details: diagnostic.details,
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
export function addToFiles(byFile: DiagnosticsByFile, located: readonly LocatedDiagnostic[]): DiagnosticsByFile {
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
