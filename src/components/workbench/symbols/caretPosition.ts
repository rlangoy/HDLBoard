// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Text cursor → symbol. Clicking a name, or moving the cursor onto it with the
 * keyboard, highlights it the way hovering does, and the highlight stays while the
 * pointer goes elsewhere. Pure.
 */

import type { TextCell } from './pointerPosition';
import type { HdlSymbol, SymbolIndex } from './types';

/** The line and offset of a character index into the whole text. */
export function cellAtCaret(text: string, caret: number): TextCell {
  let line = 0;
  let lineStart = 0;
  // Walks the line breaks before the caret without copying the text (it runs on every cursor move).
  for (let newline = text.indexOf('\n'); newline !== -1 && newline < caret; newline = text.indexOf('\n', newline + 1)) {
    line++;
    lineStart = newline + 1;
  }
  return { line, offset: caret - lineStart };
}

/**
 * Where a selection points: at its first non-blank character, if what it covers is
 * one name with blanks around it at most. A double-click on Windows selects the
 * word and the space after it (`a `). Undefined when it spans more than one name.
 */
export function caretOfSelection(text: string, start: number, end: number): number | undefined {
  const selected = text.slice(start, end);
  const isOneName = /^\s*\w*\s*$/.test(selected) && (selected === '' || selected.trim() !== '');
  if (!isOneName) return undefined;
  return start + selected.length - selected.trimStart().length;
}

/**
 * The symbol the cursor touches: the one it is inside, or the one it sits just
 * after (`count|`), as editors do.
 */
export function symbolAtCaret(index: SymbolIndex, text: string, caret: number): HdlSymbol | undefined {
  const { line, offset } = cellAtCaret(text, caret);
  return index.symbolAt(line, offset) ?? (offset > 0 ? index.symbolAt(line, offset - 1) : undefined);
}
