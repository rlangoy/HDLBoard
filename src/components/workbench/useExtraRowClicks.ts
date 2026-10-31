// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';
import { offsetOfLine } from './diagnosticLocation';
import { caretAtPointer, type CaretPlace, type TextRows } from './symbols/pointerPosition';
import { measureText } from './symbols/textMetrics';

/** A click on the drawn text: where its caret goes, and how far the view was scrolled then. */
interface Click {
  readonly place: CaretPlace;
  readonly scrollTop: number;
}

export interface ExtraRowClickHandlers {
  onPointerDown(event: PointerEvent<HTMLTextAreaElement>): void;
  onMouseDown(event: MouseEvent<HTMLTextAreaElement>): void;
}

/**
 * Puts the caret where the student clicked while extra rows are drawn
 * (extraRows.ts). Below an extra row the textarea's own text is a row higher than
 * the drawn text, so its own caret would land on the wrong line. The place is
 * read at `pointerdown`, while the rows are still drawn (that click clears them),
 * and the textarea's own caret placement at `mousedown` is replaced by it. The
 * view is scrolled back by the rows that went, from where it was at the click
 * (the browser may have moved it as the text got shorter), so the clicked code
 * stays under the pointer.
 */
export function useExtraRowClicks(text: TextRows): ExtraRowClickHandlers {
  const clicked = useRef<Click>();

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLTextAreaElement>) => {
      const textarea = event.currentTarget;
      const rect = textarea.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left - textarea.clientLeft,
        y: event.clientY - rect.top - textarea.clientTop,
        scrollLeft: textarea.scrollLeft,
        scrollTop: textarea.scrollTop,
      };
      const place = text.rows && caretAtPointer(pointer, measureText(textarea), text);
      clicked.current = place ? { place, scrollTop: textarea.scrollTop } : undefined;
    },
    [text],
  );

  const onMouseDown = useCallback((event: MouseEvent<HTMLTextAreaElement>) => {
    const click = clicked.current;
    clicked.current = undefined;
    if (click === undefined) return;
    const { place } = click;
    event.preventDefault();
    const textarea = event.currentTarget;
    const caret = offsetOfLine(textarea.value, place.line + 1) + place.offset;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(caret, caret);
    textarea.scrollTop = click.scrollTop - place.extraRowsAbove * measureText(textarea).lineHeight;
  }, []);

  return { onPointerDown, onMouseDown };
}
