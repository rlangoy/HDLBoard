// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GHDL's column is not a character index (measured,
 * docs/editor_diagnostics_improvement_plan.md § 2.4 and Appendix A.13): a tab
 * advances to the next multiple of 8, and every other character counts its UTF-8
 * bytes, because GHDL reads the file as bytes and the browser sends UTF-8. Pure.
 */

const GHDL_TAB_STOP = 8;
const UTF8_TWO_BYTES_FROM = 0x80;
const UTF8_THREE_BYTES_FROM = 0x800;
const UTF8_FOUR_BYTES_FROM = 0x10000;
/** A code point at or above each limit takes one more UTF-8 byte. */
const UTF8_BYTE_LIMITS: readonly number[] = [UTF8_TWO_BYTES_FROM, UTF8_THREE_BYTES_FROM, UTF8_FOUR_BYTES_FROM];

function utf8Length(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  return 1 + UTF8_BYTE_LIMITS.filter((limit) => codePoint >= limit).length;
}

/** GHDL's column of the character after `char`, which starts at `column`. */
function columnAfter(column: number, char: string): number {
  if (char !== '\t') return column + utf8Length(char);
  return Math.floor((column - 1) / GHDL_TAB_STOP) * GHDL_TAB_STOP + GHDL_TAB_STOP + 1;
}

/**
 * The index of the character GHDL's 1-based `column` falls on. A column inside a
 * tab or a multi-byte character rounds to that character; a column past the end
 * gives `line.length`.
 */
export function ghdlColumnToIndex(line: string, column: number): number {
  let index = 0;
  let start = 1;
  for (const char of line) {
    const next = columnAfter(start, char);
    if (column < next) return index;
    start = next;
    index += char.length;
  }
  return line.length;
}
