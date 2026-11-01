// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Quick Fix for an architecture whose statements start without `begin`:
 * where the missing `begin` goes, as an insertion into the file. Pure.
 */

import { offsetOfLine } from './diagnosticLocation';
import type { TextInsertion } from './useClauseFix';
import { tokenizeVhdlLine } from './vhdlHighlight';
import { architectureMissingBegin } from './vhdlStructure';

const LEADING_WHITESPACE = /^[ \t]*/;

function isCommentOnly(line: string): boolean {
  const tokens = tokenizeVhdlLine(line).filter((token) => token.type !== 'whitespace');
  return tokens.length > 0 && tokens.every((token) => token.type === 'comment');
}

/**
 * `begin` on a line of its own, indented like the architecture's header, just
 * above the statement on `line` and the comments right above it: they belong to
 * the statement. `undefined` when that architecture has a `begin` already.
 */
export function insertBegin(content: string, line: number): TextInsertion | undefined {
  const lines = content.split('\n').map((text) => text.replace(/\r$/, ''));
  const header = architectureMissingBegin(lines, line);
  if (header === undefined) return undefined;
  let before = line;
  while (before - 1 > header && isCommentOnly(lines[before - 2])) before--;
  const indent = LEADING_WHITESPACE.exec(lines[header - 1])?.[0] ?? '';
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const offset = offsetOfLine(content, before);
  const text = `${indent}begin${eol}`;
  return { offset, text, caret: offset + indent.length + 'begin'.length };
}
