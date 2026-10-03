// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Offset <-> line helpers shared by the detector's stages. Pure. */

/** A function from an offset to its 1-based line, built once per text. */
export type LineOf = (offset: number) => number;

export function lineIndex(text: string): LineOf {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** `text[from, to)` with every character but newlines turned into a space. */
export function blankRange(chars: string[], from: number, to: number): void {
  for (let i = from; i < to && i < chars.length; i++) if (chars[i] !== '\n') chars[i] = ' ';
}

/** The offset of the next newline at or after `from`, or the text's length. */
export function endOfLine(text: string, from: number): number {
  const at = text.indexOf('\n', from);
  return at < 0 ? text.length : at;
}

/** The text with everything outside `ranges` blanked; same length, newlines kept. */
export function keepRanges(text: string, ranges: readonly { from: number; to: number }[]): string {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const parts: string[] = [];
  let at = 0;
  for (const { from, to } of sorted) {
    if (to <= at) continue;
    const start = Math.max(from, at);
    parts.push(blankText(text.slice(at, start)), text.slice(start, to));
    at = to;
  }
  parts.push(blankText(text.slice(at)));
  return parts.join('');
}

/** Every character but newlines turned into a space. */
export const blankText = (text: string): string => text.replace(/[^\n]/g, ' ');
