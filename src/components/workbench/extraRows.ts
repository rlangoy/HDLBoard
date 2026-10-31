// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The rows the editor adds under a marked line: the message, when it would not
 * fit after the code (the textarea scrolls only as far as its widest line, so a
 * message past that is out of reach), and the Quick Fix button. Pure.
 */

import type { QuickFix } from './diagnosticAdvice';
import { visualColumn } from './diagnosticLocation';
import { quickFixOf, type LineDiagnostic } from './diagnosticStore';
import type { DiagnosticSeverity } from './diagnostics';
import { fullMessageText, inlineText } from './diagnosticText';
import type { DrawnRow } from './symbols/pointerPosition';

/** Columns between the code and its inline message (CodeEditor.css `.wb-editor__diag-inline`). */
export const INLINE_GAP_COLUMNS = 3;
/** A message row is never narrower than this, however deeply the code is indented. */
const MIN_MESSAGE_COLUMNS = 20;
const LEADING_WHITESPACE = /^[ \t]*/;

export type ExtraRow =
  | { readonly kind: 'message'; readonly severity: DiagnosticSeverity; readonly indent: number; readonly text: string }
  | { readonly kind: 'fix'; readonly indent: number; readonly fix: QuickFix; readonly line: number };

/** Per 1-based line number, the rows drawn under it. */
export type ExtraRowsByLine = ReadonlyMap<number, readonly ExtraRow[]>;

/** The room the editor has, in characters: what it shows, and what it can scroll to. */
export interface EditorWidth {
  readonly visibleColumns: number;
  /** The widest line: the textarea scrolls no further. */
  readonly widestColumns: number;
  readonly tabSize: number;
}

/** Splits `text` at spaces into rows of at most `width` characters; a longer word gets a row of its own, cut. */
export function wrapWords(text: string, width: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(' ')) {
    const joined = row === '' ? word : `${row} ${word}`;
    if (joined.length <= width || row === '') row = joined;
    else {
      rows.push(row);
      row = word;
    }
  }
  rows.push(row);
  return rows.flatMap((wrapped) => cutToWidth(wrapped, width));
}

function cutToWidth(text: string, width: number): string[] {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += width) pieces.push(text.slice(start, start + width));
  return pieces.length > 0 ? pieces : [''];
}

/** The widest of `lines`, in columns. */
export function widestColumns(lines: readonly string[], tabSize: number): number {
  return lines.reduce((widest, line) => Math.max(widest, visualColumn(line, line.length, tabSize)), 0);
}

/** Whether the inline message after `code` can be seen, if need be by scrolling. */
function inlineIsReachable(code: string, inline: string, width: EditorWidth): boolean {
  const end = visualColumn(code, code.length, width.tabSize) + INLINE_GAP_COLUMNS + inline.length;
  return end <= Math.max(width.visibleColumns, width.widestColumns);
}

function messageRows(marked: LineDiagnostic, indent: number, width: EditorWidth): ExtraRow[] {
  const columns = Math.max(MIN_MESSAGE_COLUMNS, width.visibleColumns - indent);
  const text = fullMessageText(marked);
  return wrapWords(text, columns).map((row) => ({ kind: 'message', severity: marked.severity, indent, text: row }));
}

function rowsUnder(marked: LineDiagnostic, code: string, width: EditorWidth): ExtraRow[] {
  const indent = visualColumn(code, LEADING_WHITESPACE.exec(code)?.[0].length ?? 0, width.tabSize);
  const inline = inlineText(marked);
  const messages = inline && !inlineIsReachable(code, inline, width) ? messageRows(marked, indent, width) : [];
  const fix = quickFixOf(marked);
  return fix ? [...messages, { kind: 'fix', indent, fix, line: marked.line }] : messages;
}

/** The extra rows under each marked line of `lines` (the file's code, one entry per line). */
export function extraRowsByLine(marked: readonly LineDiagnostic[], lines: readonly string[], width: EditorWidth): ExtraRowsByLine {
  const byLine = new Map<number, readonly ExtraRow[]>();
  for (const line of marked) {
    const rows = rowsUnder(line, lines[line.line - 1] ?? '', width);
    if (rows.length > 0) byLine.set(line.line, rows);
  }
  return byLine;
}

/** Whether a line's message is drawn on rows of its own instead of after the code. */
export function hasMessageRows(rows: readonly ExtraRow[] | undefined): boolean {
  return rows?.some((row) => row.kind === 'message') ?? false;
}

/** Every row the editor draws, in order: each line of the file, then its extra rows. */
export function drawnRows(lineCount: number, extra: ExtraRowsByLine): DrawnRow[] {
  const rows: DrawnRow[] = [];
  for (let line = 0; line < lineCount; line++) {
    const extraRows = extra.get(line + 1) ?? [];
    rows.push({ line, extra: false }, ...extraRows.map(() => ({ line, extra: true })));
  }
  return rows;
}

export function countExtraRows(extra: ExtraRowsByLine): number {
  return [...extra.values()].reduce((count, rows) => count + rows.length, 0);
}
