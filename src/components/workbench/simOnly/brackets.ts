// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Brackets in blanked HDL code (no comments, no strings): `( )`, `[ ]` and `{ }`, read
 * by depth. One place for what the register and wait checks of both languages need.
 * Pure.
 */

const OPENING = '([{';
const CLOSING = ')]}';

/** The offset of the bracket that closes the one at `open`, or -1 when it is not closed. */
export function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (OPENING.includes(text[i])) depth++;
    else if (CLOSING.includes(text[i])) depth--;
    if (depth === 0) return i;
  }
  return -1;
}

/** The text inside the bracket that opens at `open`; the rest of the text when it is not closed. */
export function bracketed(text: string, open: number): string {
  const close = closingBracket(text, open);
  return text.slice(open + 1, close < 0 ? text.length : close);
}

/** The text with what is inside brackets blanked, offsets kept: only its top level is left. */
export function topLevel(text: string): string {
  let depth = 0;
  return [...text]
    .map((ch) => {
      if (OPENING.includes(ch)) depth++;
      const shown = depth === 0 ? ch : ' ';
      if (CLOSING.includes(ch)) depth--;
      return shown;
    })
    .join('');
}

/** Without the parentheses around the whole of it, and its blanks: `( (a) )` is `a`. */
export function unwrapped(text: string): string {
  const t = text.trim();
  return t.startsWith('(') && closingBracket(t, 0) === t.length - 1 ? unwrapped(t.slice(1, -1)) : t;
}

/** The parts of a list at its top level: `a, {b, c}, d[1:0]` is three. */
export function topLevelItems(list: string, separator = ','): string[] {
  const top = topLevel(list);
  const items: string[] = [];
  let from = 0;
  for (let i = top.indexOf(separator); i >= 0; i = top.indexOf(separator, i + 1)) {
    items.push(list.slice(from, i));
    from = i + 1;
  }
  return [...items, list.slice(from)];
}
