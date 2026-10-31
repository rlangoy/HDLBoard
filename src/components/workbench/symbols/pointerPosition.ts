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
  readonly paddingRight: number;
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

/**
 * One row the editor draws: a line of the file, or an extra row the editor adds
 * under it (an error message that would not fit after the code, a Quick Fix).
 * The textarea has no extra rows, so below one its text is a row higher than drawn.
 */
export interface DrawnRow {
  /** 0-based: the line shown, or the line an extra row sits under. */
  readonly line: number;
  readonly extra: boolean;
}

/** The file's lines, and the rows they are drawn on; without `rows`, row n shows line n. */
export interface TextRows {
  readonly lines: readonly string[];
  readonly rows?: readonly DrawnRow[];
}

/** Where the pointer is in the drawn text: which row, and how many columns from the left. */
interface DrawnPlace {
  readonly row: DrawnRow;
  /** 0-based. */
  readonly rowIndex: number;
  readonly column: number;
}

function drawnPlace(pointer: PointerInText, metrics: TextMetrics, text: TextRows): DrawnPlace | undefined {
  const top = pointer.y + pointer.scrollTop - metrics.paddingTop;
  const left = pointer.x + pointer.scrollLeft - metrics.paddingLeft;
  if (top < 0 || metrics.lineHeight <= 0 || metrics.charWidth <= 0) return undefined;
  const rowIndex = Math.floor(top / metrics.lineHeight);
  const row = text.rows ? text.rows[rowIndex] : rowIndex < text.lines.length ? { line: rowIndex, extra: false } : undefined;
  return row && { row, rowIndex, column: Math.floor(left / metrics.charWidth) };
}

/** The character under the pointer, or undefined over padding, past a line's end, on an extra row, or below the last line. */
export function cellAtPointer(pointer: PointerInText, metrics: TextMetrics, text: TextRows): TextCell | undefined {
  const place = drawnPlace(pointer, metrics, text);
  if (place === undefined || place.row.extra || place.column < 0) return undefined;
  const { line } = place.row;
  const offset = offsetAtColumn(text.lines[line], place.column, metrics.tabSize);
  return offset === undefined ? undefined : { line, offset };
}

/** Where a click puts the caret, and how many extra rows are drawn above its line. */
export interface CaretPlace extends TextCell {
  readonly extraRowsAbove: number;
}

/** How many extra rows are drawn above a line: how far below its textarea row it shows. */
function extraRowsAbove(line: number, text: TextRows): number {
  const drawnAt = text.rows?.findIndex((row) => !row.extra && row.line === line) ?? line;
  return Math.max(0, drawnAt - line);
}

/**
 * Where a click on the drawn text puts the caret, as the textarea would without
 * extra rows: on the character clicked, at the end of a line clicked past, and at
 * the end of the line above for an extra row. Undefined below the last row.
 */
export function caretAtPointer(pointer: PointerInText, metrics: TextMetrics, text: TextRows): CaretPlace | undefined {
  const place = drawnPlace(pointer, metrics, text);
  if (place === undefined) return undefined;
  const { line, extra } = place.row;
  const length = text.lines[line].length;
  const clicked = extra ? length : offsetAtColumn(text.lines[line], Math.max(0, place.column), metrics.tabSize);
  return { line, offset: clicked ?? length, extraRowsAbove: extraRowsAbove(line, text) };
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
