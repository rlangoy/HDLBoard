// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { keepIfSameSymbol } from './keepIfSameSymbol';
import { cellAtPointer, type TextCell, type TextMetrics, type TextRows } from './pointerPosition';
import { measureText } from './textMetrics';
import type { HdlSymbol, SymbolIndex } from './types';
import { useFileScopedState } from './useFileScopedState';

/** How long the pointer must rest before the highlight follows it (spec: 75–150 ms). */
export const HOVER_DELAY_MS = 100;

/** Spread these on the editor's `<textarea>`. */
export interface HoverHandlers {
  onPointerEnter: (event: PointerEvent<HTMLTextAreaElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLTextAreaElement>) => void;
  onPointerLeave: () => void;
}

export interface HoveredSymbol {
  /** The symbol under the resting pointer, or undefined. */
  symbol: HdlSymbol | undefined;
  handlers: HoverHandlers;
  /** Drops the highlight; call it when the text scrolls under a still pointer. */
  clear: () => void;
}

/**
 * Which symbol the pointer rests on. The hover only stores *where* the pointer is;
 * the symbol is looked up in the current index, so after an edit the highlight
 * follows the new text by itself and never shows stale positions.
 *
 * @param fileId The file shown; the hover is forgotten when it changes.
 * @param text The file's current lines, and the rows they are drawn on.
 * @param index The current symbol index (rebuilt by the caller on every edit).
 */
export function useHoveredSymbol(fileId: string, text: TextRows, index: SymbolIndex): HoveredSymbol {
  const [cell, setCell] = useFileScopedState<TextCell>(fileId);
  const timer = useRef<number | undefined>(undefined);
  const metrics = useRef<TextMetrics | undefined>(undefined);
  const textRef = useRef(text);
  textRef.current = text;
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerEnter = useCallback((event: PointerEvent<HTMLTextAreaElement>) => {
    metrics.current = measureText(event.currentTarget); // re-read in case the font size changed
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLTextAreaElement>) => {
    if (event.pointerType === 'touch') return;
    const textarea = event.currentTarget;
    if (!metrics.current) metrics.current = measureText(textarea);
    const rect = textarea.getBoundingClientRect();
    const next = cellAtPointer(
      {
        x: event.clientX - rect.left - textarea.clientLeft,
        y: event.clientY - rect.top - textarea.clientTop,
        scrollLeft: textarea.scrollLeft,
        scrollTop: textarea.scrollTop,
      },
      metrics.current,
      textRef.current,
    );
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCell((previous) => keepIfSameSymbol(previous, next, (cell) => indexRef.current.symbolAt(cell.line, cell.offset)));
    }, HOVER_DELAY_MS);
  }, [setCell]);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    setCell(undefined);
  }, [setCell]);

  const symbol = useMemo(() => (cell ? index.symbolAt(cell.line, cell.offset) : undefined), [cell, index]);
  const handlers = useMemo(() => ({ onPointerEnter, onPointerMove, onPointerLeave: clear }), [onPointerEnter, onPointerMove, clear]);
  return { symbol, handlers, clear };
}
