// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { cellAtPointer, sameCell, type TextCell, type TextMetrics } from './pointerPosition';
import type { HdlSymbol, SymbolIndex } from './types';

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
}

/** Reads the text box's layout from the textarea's computed style. */
function measureText(textarea: HTMLTextAreaElement): TextMetrics {
  const style = getComputedStyle(textarea);
  const context = document.createElement('canvas').getContext('2d');
  let charWidth = 0;
  if (context) {
    context.font = `${style.fontSize} ${style.fontFamily}`;
    charWidth = context.measureText('0'.repeat(100)).width / 100;
  }
  return {
    paddingTop: parseFloat(style.paddingTop) || 0,
    paddingLeft: parseFloat(style.paddingLeft) || 0,
    lineHeight: parseFloat(style.lineHeight) || 0,
    charWidth,
    tabSize: parseInt(style.tabSize, 10) || 4,
  };
}

/**
 * Which symbol the pointer rests on. The hover only stores *where* the pointer is;
 * the symbol is looked up in the current index, so after an edit the highlight
 * follows the new text by itself and never shows stale positions.
 *
 * @param lines The file's current lines.
 * @param index The current symbol index (rebuilt by the caller on every edit).
 */
export function useHoveredSymbol(lines: readonly string[], index: SymbolIndex): HoveredSymbol {
  const [cell, setCell] = useState<TextCell | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const metrics = useRef<TextMetrics | undefined>(undefined);
  const linesRef = useRef(lines);
  linesRef.current = lines;

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
      linesRef.current,
    );
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCell((previous) => (sameCell(previous, next) ? previous : next));
    }, HOVER_DELAY_MS);
  }, []);

  const onPointerLeave = useCallback(() => {
    window.clearTimeout(timer.current);
    setCell(undefined);
  }, []);

  const symbol = useMemo(() => (cell ? index.symbolAt(cell.line, cell.offset) : undefined), [cell, index]);
  const handlers = useMemo(() => ({ onPointerEnter, onPointerMove, onPointerLeave }), [onPointerEnter, onPointerMove, onPointerLeave]);
  return { symbol, handlers };
}
