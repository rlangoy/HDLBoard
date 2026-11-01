// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Quick Fix for an architecture whose statements start without `begin`:
 * where the missing `begin` goes, as an insertion into the file. Pure.
 */

import { offsetOfLine } from './diagnosticLocation';
import { indentOf, lineEnding, splitLines } from './textLines';
import type { TextInsertion } from './useClauseFix';
import { tokenizeVhdlLine } from './vhdlHighlight';
import { architectureMissingBegin } from './vhdlStructure';

const BEGIN = 'begin';

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
  const lines = splitLines(content);
  const header = architectureMissingBegin(lines, line);
  if (header === undefined) return undefined;
  let before = line;
  while (before - 1 > header && isCommentOnly(lines[before - 2])) before--;
  const indent = indentOf(lines[header - 1]);
  const offset = offsetOfLine(content, before);
  return { offset, text: `${indent}${BEGIN}${lineEnding(content)}`, caret: offset + indent.length + BEGIN.length };
}
