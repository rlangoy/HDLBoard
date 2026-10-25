// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Tab in the code editor, as in an IDE: Tab inserts a tab, or indents every selected
 * line; Shift+Tab takes one level of indentation off the caret's line or the selected
 * lines. Pure: it says what to replace and what to select afterwards.
 */

export interface IndentEdit {
  /** The range of the text to replace, and what replaces it. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** The selection afterwards. */
  readonly selectStart: number;
  readonly selectEnd: number;
}

const TAB = '\t';
/** One level of indentation written with spaces, as the editor shows a tab (CodeEditor.css tab-size). */
const SPACES_PER_LEVEL = 4;

/** The lines a selection touches: from the start of the first to the end of the last (a final newline ends it). */
function touchedLines(text: string, start: number, end: number): { from: number; to: number } {
  // lastIndexOf reads a negative index as 0, which would find a newline at index 0 from a start at 0.
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const lastCharacter = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const newline = text.indexOf('\n', lastCharacter);
  return { from, to: newline < 0 ? text.length : newline };
}

/** How many characters one level of indentation at the start of `line` takes: a tab, or up to four spaces. */
function indentationLength(line: string): number {
  if (line.startsWith(TAB)) return 1;
  let spaces = 0;
  while (spaces < SPACES_PER_LEVEL && line[spaces] === ' ') spaces++;
  return spaces;
}

/** The edit Tab (or Shift+Tab, `outdent`) makes, or undefined when there is nothing to take off. */
export function tabEdit(text: string, start: number, end: number, outdent: boolean): IndentEdit | undefined {
  const severalLines = text.slice(start, end).includes('\n');
  if (!outdent && !severalLines) return { start, end, text: TAB, selectStart: start + TAB.length, selectEnd: start + TAB.length };
  const { from, to } = touchedLines(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const removed = lines.map((line) => (outdent ? indentationLength(line) : 0));
  if (outdent && removed.every((count) => count === 0)) return undefined;
  // Empty lines stay empty, so no line is left with only a tab.
  const edited = lines.map((line, index) => (outdent ? line.slice(removed[index]) : line === '' ? line : `${TAB}${line}`)).join('\n');
  if (severalLines) return { start: from, end: to, text: edited, selectStart: from, selectEnd: from + edited.length };
  // One line, Shift+Tab: the caret stays where it was in the text, moved left by what was taken off.
  const caret = Math.max(from, start - removed[0]);
  return { start: from, end: to, text: edited, selectStart: caret, selectEnd: Math.max(from, end - removed[0]) };
}
