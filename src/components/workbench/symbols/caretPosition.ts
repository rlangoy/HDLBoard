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
  const before = text.slice(0, caret);
  const lineStart = before.lastIndexOf('\n') + 1;
  return { line: before.split('\n').length - 1, offset: caret - lineStart };
}

/**
 * The symbol the cursor touches: the one it is inside, or the one it sits just
 * after (`count|`), as editors do.
 */
export function symbolAtCaret(index: SymbolIndex, text: string, caret: number): HdlSymbol | undefined {
  const { line, offset } = cellAtCaret(text, caret);
  return index.symbolAt(line, offset) ?? (offset > 0 ? index.symbolAt(line, offset - 1) : undefined);
}
