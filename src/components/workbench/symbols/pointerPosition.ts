// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Pointer position → line and character, by arithmetic. The editor's text is
 * monospace, never wraps, and every line has the same height, so no DOM lookup is
 * needed. (The highlight `<pre>` has `pointer-events: none` and sits under the
 * textarea, so `caretRangeFromPoint` would only ever find the textarea.) Pure.
 */

/** The text box's layout, read once from the textarea's computed style. */
export interface TextMetrics {
  readonly paddingTop: number;
  readonly paddingLeft: number;
  readonly lineHeight: number;
  /** Width of one character of the monospace font, in px. */
  readonly charWidth: number;
  readonly tabSize: number;
}

/** A pointer position inside the textarea's padding box, plus how far it is scrolled. */
export interface PointerInText {
  readonly x: number;
  readonly y: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

/** A character of the file: 0-based line and 0-based offset in that line. */
export interface TextCell {
  readonly line: number;
  readonly offset: number;
}

/** The character under the pointer, or undefined over padding, past a line's end, or below the last line. */
export function cellAtPointer(
  pointer: PointerInText,
  metrics: TextMetrics,
  lines: readonly string[],
): TextCell | undefined {
  const top = pointer.y + pointer.scrollTop - metrics.paddingTop;
  const left = pointer.x + pointer.scrollLeft - metrics.paddingLeft;
  if (top < 0 || left < 0 || metrics.lineHeight <= 0 || metrics.charWidth <= 0) return undefined;
  const line = Math.floor(top / metrics.lineHeight);
  if (line >= lines.length) return undefined;
  const offset = offsetAtColumn(lines[line], Math.floor(left / metrics.charWidth), metrics.tabSize);
  return offset === undefined ? undefined : { line, offset };
}

/** The character drawn at a visual column, counting a tab as reaching the next tab stop. */
export function offsetAtColumn(text: string, column: number, tabSize: number): number | undefined {
  let visual = 0;
  for (let offset = 0; offset < text.length; offset++) {
    const width = text[offset] === '\t' ? tabSize - (visual % tabSize) : 1;
    if (column < visual + width) return offset;
    visual += width;
  }
  return undefined;
}

export function sameCell(a: TextCell | undefined, b: TextCell | undefined): boolean {
  return a?.line === b?.line && a?.offset === b?.offset;
}
