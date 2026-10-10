// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useMemo, useState, type SyntheticEvent } from 'react';
import { symbolAtCaret } from './caretPosition';
import type { HdlSymbol, SymbolIndex } from './types';

export interface CaretSymbol {
  /** The symbol at the text cursor, or undefined (also while text is selected across names). */
  symbol: HdlSymbol | undefined;
  /** Spread on the editor's `<textarea>`: React fires it whenever the cursor or selection moves. */
  onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
}

/**
 * Which symbol the text cursor is on. Only the cursor's index is stored; the symbol
 * is looked up in the current index, so after an edit it follows the new text.
 *
 * @param text The file's current content.
 * @param index The current symbol index.
 */
export function useCaretSymbol(text: string, index: SymbolIndex): CaretSymbol {
  const [caret, setCaret] = useState<number | undefined>(undefined);

  const onSelect = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    const selected = event.currentTarget.value.slice(selectionStart, selectionEnd);
    // A selection that crosses a name boundary (`a <= b`) points at no single symbol.
    setCaret(/^\w*$/.test(selected) ? selectionStart : undefined);
  }, []);

  const symbol = useMemo(() => (caret === undefined ? undefined : symbolAtCaret(index, text, caret)), [caret, index, text]);
  return { symbol, onSelect };
}
