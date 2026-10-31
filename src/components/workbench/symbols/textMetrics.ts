// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { countLines, lineHeightOrFallback } from '../diagnosticLocation';
import type { TextMetrics } from './pointerPosition';

/** Characters measured at once: the average is exact to a fraction of a pixel. */
const SAMPLE_LENGTH = 100;
/** The CSS default `tab-size`. */
const DEFAULT_TAB_SIZE = 8;

let measuringContext: CanvasRenderingContext2D | null | undefined;

/** Width of one character in the textarea's font, letter-spacing included; 0 if it cannot be measured. */
function characterWidth(style: CSSStyleDeclaration): number {
  measuringContext ??= document.createElement('canvas').getContext('2d');
  if (!measuringContext) return 0;
  measuringContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const glyphWidth = measuringContext.measureText('0'.repeat(SAMPLE_LENGTH)).width / SAMPLE_LENGTH;
  return glyphWidth + (parseFloat(style.letterSpacing) || 0);
}

/** Reads the text box's layout from the textarea's computed style. */
export function measureText(textarea: HTMLTextAreaElement): TextMetrics {
  const style = getComputedStyle(textarea);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const textHeight = textarea.scrollHeight - paddingTop - (parseFloat(style.paddingBottom) || 0);
  return {
    paddingTop,
    paddingLeft: parseFloat(style.paddingLeft) || 0,
    paddingRight: parseFloat(style.paddingRight) || 0,
    lineHeight: lineHeightOrFallback(style.lineHeight, textHeight, countLines(textarea.value)), // `normal` too
    charWidth: characterWidth(style),
    tabSize: parseInt(style.tabSize, 10) || DEFAULT_TAB_SIZE,
  };
}
