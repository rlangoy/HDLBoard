// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** A file's text as lines, for the Quick Fixes and the advice that read it. Pure. */

/** The file's lines, without line endings (a trailing `\r` is dropped, as GHDL reads it). */
export function splitLines(content: string): string[] {
  return content.split('\n').map((line) => line.replace(/\r$/, ''));
}

/** The line ending the file uses, for text inserted into it. */
export function lineEnding(content: string): '\r\n' | '\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/** The spaces and tabs a line starts with. */
export function indentOf(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

/** A change to one place in the file: `removed` characters at `offset` become `text`. */
export interface TextEdit {
  readonly offset: number;
  /** How many characters `text` replaces; 0 for an insertion. */
  readonly removed: number;
  readonly text: string;
  /** Where the caret goes once the edit is made: the end of what was added, so the student sees it. */
  readonly caret: number;
}

/** The file with the edit made. */
export function applyTextEdit(content: string, edit: TextEdit): string {
  return `${content.slice(0, edit.offset)}${edit.text}${content.slice(edit.offset + edit.removed)}`;
}
