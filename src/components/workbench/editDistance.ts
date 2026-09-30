// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Optimal string alignment distance — Levenshtein plus swapping two neighbouring
 * letters, the most common typing slip (`rnage`, `dwonto`) — for the "did you
 * mean" rules of docs/editor_diagnostics_improvement_plan.md § 4.4–4.5. Pure.
 */

interface Rows {
  /** 1-based row number: characters of the first word consumed so far. */
  readonly i: number;
  readonly previous: readonly number[];
  readonly beforePrevious: readonly number[];
}

/**
 * Case-insensitive. Returns `max + 1` as soon as the distance is known to exceed
 * `max`, so a word far from every keyword costs a row or two, not the full table.
 */
export function osaDistance(a: string, b: string, max: number): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const beyond = max + 1;
  if (Math.abs(s.length - t.length) > max) return beyond;
  let beforePrevious: readonly number[] = [];
  let previous: readonly number[] = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = nextRow(s, t, { i, previous, beforePrevious });
    // Every later row is at least this row's minimum (a swap reaches back two
    // rows, but row i - 1 was then already at `max` or more).
    if (Math.min(...row) > max) return beyond;
    beforePrevious = previous;
    previous = row;
  }
  return Math.min(previous[t.length], beyond);
}

function nextRow(s: string, t: string, { i, previous, beforePrevious }: Rows): number[] {
  const row = [i];
  for (let j = 1; j <= t.length; j++) {
    const substitution = previous[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1);
    const edit = Math.min(previous[j] + 1, row[j - 1] + 1, substitution);
    const swapped = i > 1 && j > 1 && isSwap(s.slice(i - 2, i), t.slice(j - 2, j));
    row.push(swapped ? Math.min(edit, beforePrevious[j - 2] + 1) : edit);
  }
  return row;
}

/** Two letters and the same two, swapped: `ng` and `gn`. */
function isSwap(pair: string, other: string): boolean {
  return pair[0] === other[1] && pair[1] === other[0];
}
