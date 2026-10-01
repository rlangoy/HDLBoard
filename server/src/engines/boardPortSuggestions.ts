// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * "Did you mean `SW`?" for a port that is not a board port: the board port a
 * misspelled name was most likely meant to be. Pure.
 */

import { BOARD_INPUT_NAMES, BOARD_OUTPUT_NAMES } from './boardPorts.js';

/** From this length on, a name may be two edits from the board port it was meant to be. */
const LONG_WORD_LENGTH = 3;
const MAX_EDITS_SHORT_WORD = 1;
const MAX_EDITS_LONG_WORD = 2;

/** Levenshtein distance: insert, delete, substitute. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (const char of a) {
    const row = [previous[0] + 1];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (char === b[j - 1] ? 0 : 1);
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, substitution);
    }
    previous = row;
  }
  return previous[b.length];
}

/**
 * The one candidate nearest to `name`: not declared by the entity already, starting
 * with the same letter, and within the edit allowance. A tie gives none.
 */
function nearestBoardPort(name: string, declared: ReadonlySet<string>, candidates: readonly string[]): string | undefined {
  const word = name.toLowerCase();
  const allowed = word.length >= LONG_WORD_LENGTH ? MAX_EDITS_LONG_WORD : MAX_EDITS_SHORT_WORD;
  const scored = candidates
    .filter((port) => !declared.has(port.toLowerCase()) && port[0].toLowerCase() === word[0])
    .map((port) => ({ port, distance: editDistance(word, port.toLowerCase()) }))
    .filter(({ distance }) => distance <= allowed);
  const best = Math.min(...scored.map((s) => s.distance));
  const nearest = scored.filter((s) => s.distance === best);
  return nearest.length === 1 ? nearest[0].port : undefined;
}

/** The board input a misspelled input was probably meant to be: `SdsW` → `SW`. `declared` is lower case. */
export function suggestBoardInput(name: string, declared: ReadonlySet<string>): string | undefined {
  return nearestBoardPort(name, declared, BOARD_INPUT_NAMES);
}

/** The board output a misspelled output was probably meant to be: `LEDRR` → `LEDR`. `declared` is lower case. */
export function suggestBoardOutput(name: string, declared: ReadonlySet<string>): string | undefined {
  return nearestBoardPort(name, declared, BOARD_OUTPUT_NAMES);
}
