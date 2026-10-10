// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useMemo, useRef, type SyntheticEvent } from 'react';
import { caretOfSelection, symbolAtCaret } from './caretPosition';
import { keepIfSameSymbol } from './keepIfSameSymbol';
import type { HdlSymbol, SymbolIndex } from './types';
import { useFileScopedState } from './useFileScopedState';

export interface CaretSymbol {
  /** The symbol at the text cursor, or undefined (also while text is selected across names). */
  symbol: HdlSymbol | undefined;
  /** Spread on the editor's `<textarea>`: React fires it whenever the cursor or selection moves. */
  onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
}

/** One version of the file: its text and the symbol index built from it. */
interface FileSnapshot {
  readonly text: string;
  readonly index: SymbolIndex;
}

/**
 * Which symbol the text cursor is on. Only the cursor's index is stored; the symbol
 * is looked up in the current index, so after an edit it follows the new text.
 *
 * @param fileId The file shown; the cursor position is forgotten when it changes.
 * @param text The file's current content.
 * @param index The current symbol index.
 */
export function useCaretSymbol(fileId: string, text: string, index: SymbolIndex): CaretSymbol {
  const [caret, setCaret] = useFileScopedState<number>(fileId);
  const latest = useRef<FileSnapshot>({ text, index }); // read by onSelect, which never changes
  latest.current = { text, index };

  const onSelect = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    const next = caretOfSelection(value, selectionStart, selectionEnd);
    const { text, index } = latest.current;
    setCaret((previous) => keepIfSameSymbol(previous, next, (caret) => symbolAtCaret(index, text, caret)));
  }, [setCaret]);

  const symbol = useMemo(() => (caret === undefined ? undefined : symbolAtCaret(index, text, caret)), [caret, index, text]);
  return { symbol, onSelect };
}
