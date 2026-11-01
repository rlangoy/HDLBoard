// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Quick Fixes for an architecture whose statements start without `begin`:
 * where the missing `begin` goes, or the misspelled word it replaces, as an
 * edit of the file. Pure.
 */

import { offsetOfLine } from './diagnosticLocation';
import { indentOf, lineEnding, splitLines, type TextEdit } from './textLines';
import { tokenizeVhdlLine } from './vhdlHighlight';
import { architectureMissingBegin, loneWord } from './vhdlStructure';

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
export function insertBegin(content: string, line: number): TextEdit | undefined {
  const lines = splitLines(content);
  const header = architectureMissingBegin(lines, line);
  if (header === undefined) return undefined;
  let before = line;
  while (before - 1 > header && isCommentOnly(lines[before - 2])) before--;
  const indent = indentOf(lines[header - 1]);
  const offset = offsetOfLine(content, before);
  return { offset, removed: 0, text: `${indent}${BEGIN}${lineEnding(content)}`, caret: offset + indent.length + BEGIN.length };
}

/**
 * `begin` in place of the misspelled word alone on `line` (`begisasa`).
 * `undefined` when the line no longer holds one word, or its architecture has a `begin`.
 */
export function replaceWithBegin(content: string, line: number): TextEdit | undefined {
  const lines = splitLines(content);
  const lone = loneWord(lines[line - 1] ?? '');
  if (lone === undefined || architectureMissingBegin(lines, line) === undefined) return undefined;
  const offset = offsetOfLine(content, line) + lone.start;
  return { offset, removed: lone.word.length, text: BEGIN, caret: offset + BEGIN.length };
}
