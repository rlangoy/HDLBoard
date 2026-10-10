// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { TextMatch } from './findMatches';

/**
 * Which match is current (docs/impl_search.md D8, D10, D13, D14). The current
 * match is always derived from an *anchor* offset: the first match starting at
 * or after it, wrapping to the first. Opening sets the anchor to the caret,
 * stepping to the match stepped to, an edit in the code leaves it where it was,
 * and Replace moves it past the inserted text. Pure.
 */

/** The index of the first match starting at or after `offset`, wrapping to 0; -1 with no matches. */
export function firstAtOrAfter(matches: readonly TextMatch[], offset: number): number {
  if (matches.length === 0) return -1;
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (matches[mid].start < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo === matches.length ? 0 : lo;
}

/** The next (1) or previous (-1) index, wrapping around; -1 with no matches. */
export function stepIndex(index: number, count: number, dir: 1 | -1): number {
  if (count === 0) return -1;
  if (index < 0) return dir === 1 ? 0 : count - 1;
  return (index + dir + count) % count;
}

/** Where to look next after replacing `replaced` with `replacementLength` characters (D8). */
export function anchorAfterReplace(replaced: TextMatch, replacementLength: number): number {
  return replaced.start + replacementLength;
}
