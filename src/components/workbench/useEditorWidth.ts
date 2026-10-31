// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import type { EditorWidth } from './extraRows';
import type { TextMetrics } from './symbols/pointerPosition';
import { measureText } from './symbols/textMetrics';

/** Before the textarea is measured, everything fits: no message moves below its line. */
const UNMEASURED: EditorWidth = { visibleColumns: Number.POSITIVE_INFINITY, tabSize: 4 };

function visibleColumns(viewWidth: number, metrics: TextMetrics): number {
  return Math.floor((viewWidth - metrics.paddingLeft - metrics.paddingRight) / metrics.charWidth);
}

/**
 * How many characters the textarea shows, so extraRows.ts can tell which messages
 * fit after their line. Measured again when the textarea's width (`viewWidth`) changes.
 */
export function useEditorWidth(textareaRef: RefObject<HTMLTextAreaElement>, viewWidth: number): EditorWidth {
  const [metrics, setMetrics] = useState<TextMetrics>();
  useLayoutEffect(() => {
    if (textareaRef.current) setMetrics(measureText(textareaRef.current));
  }, [textareaRef, viewWidth]);
  return useMemo(() => {
    if (metrics === undefined || metrics.charWidth <= 0) return UNMEASURED;
    return { visibleColumns: visibleColumns(viewWidth, metrics), tabSize: metrics.tabSize };
  }, [metrics, viewWidth]);
}
