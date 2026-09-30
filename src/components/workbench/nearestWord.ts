// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The "did you mean" search shared by the GHDL and Icarus advice
 * (docs/editor_diagnostics_improvement_plan.md § 4.4–4.5,
 * docs/editor_diagnostics_verilog_research.md § 3). Pure.
 */

import { osaDistance } from './editDistance';

/** From this length on, two edits are allowed: `rttange` → `range`. */
const TWO_EDIT_WORD_LENGTH = 6;

function maxEdits(word: string): number {
  return word.length >= TWO_EDIT_WORD_LENGTH ? 2 : 1;
}

export interface Nearest {
  readonly distance: number;
  /** Every candidate at that distance: a tie when there is more than one. */
  readonly names: readonly string[];
}

export interface NearestOptions {
  /**
   * Verilog is case-sensitive, so `Always` is a different word from `always`
   * and may be corrected to it. VHDL is not, so there the two are one word.
   */
  readonly caseSensitive?: boolean;
}

/**
 * The candidates nearest to `word` within its edit allowance, starting with the
 * same letter (every measured keyword typo keeps its first letter, and the test
 * removes `clock` → `block` and `dout` → `out`). The word itself is never its own
 * suggestion.
 */
export function nearest(word: string, candidates: readonly string[], options: NearestOptions = {}): Nearest | undefined {
  const lower = word.toLowerCase();
  const isSameWord = (name: string): boolean => (options.caseSensitive ? name === word : name.toLowerCase() === lower);
  const allowed = maxEdits(word);
  const scored = candidates
    .filter((name) => !isSameWord(name) && name[0]?.toLowerCase() === lower[0])
    .map((name) => ({ name, distance: osaDistance(word, name, allowed) }))
    .filter(({ distance }) => distance <= allowed);
  if (scored.length === 0) return undefined;
  const distance = Math.min(...scored.map((s) => s.distance));
  return { distance, names: scored.filter((s) => s.distance === distance).map((s) => s.name) };
}

/** The only name at the nearest distance; a tie gives none. */
export function uniqueNearest(word: string, candidates: readonly string[], options?: NearestOptions): string | undefined {
  const found = nearest(word, candidates, options);
  return found?.names.length === 1 ? found.names[0] : undefined;
}

/**
 * The nearest name over several groups of candidates. A tie between groups goes
 * to the earlier group; a tie inside the winning group gives no suggestion.
 */
export function nearestInGroups(
  word: string,
  groups: readonly (readonly string[])[],
  options?: NearestOptions,
): string | undefined {
  const found = groups.map((names) => nearest(word, names, options));
  const distances = found.flatMap((group) => (group ? [group.distance] : []));
  const winner = found.find((group) => group?.distance === Math.min(...distances));
  return winner?.names.length === 1 ? winner.names[0] : undefined;
}
