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
