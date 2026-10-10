// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { CharRange } from '../vhdlHighlight';

/**
 * Text search in one file (docs/impl_search.md § 6.2): literal, always
 * case-insensitive (S2), non-overlapping, never across a line break. Pure.
 */

/** A match as offsets into the whole text, end exclusive. */
export interface TextMatch {
  readonly start: number;
  readonly end: number;
}

/** At most this many matches per file are counted, listed and highlighted (D15). Tune from profiling. */
export const MAX_MATCHES = 10_000;

/** The longest selection Ctrl+F takes as the query (D10). */
export const MAX_SEED_LENGTH = 200;

export interface FindResult {
  readonly matches: readonly TextMatch[];
  /** More matches exist than MAX_MATCHES. */
  readonly capped: boolean;
}

const NO_RESULT: FindResult = { matches: [], capped: false };

/** What the Find field keeps of pasted or seeded text: line breaks become spaces. */
export function cleanQuery(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ');
}

/**
 * Every match of `query` in `text`. Offsets always point into `text` itself: the
 * quick path lowercases the whole text only when that keeps its length, and
 * otherwise characters are compared one at a time (D3; `İ` lowercases to two).
 */
export function findMatches(text: string, query: string, max: number = MAX_MATCHES): FindResult {
  if (query.length === 0 || query.includes('\n')) return NO_RESULT;
  const lowerText = text.toLowerCase();
  const sameLength = lowerText.length === text.length;
  const lowerQuery = query.toLowerCase();
  const matches: TextMatch[] = [];
  if (sameLength && lowerQuery.length === query.length) {
    let at = lowerText.indexOf(lowerQuery);
    while (at !== -1) {
      if (matches.length === max) return { matches, capped: true };
      matches.push({ start: at, end: at + query.length });
      at = lowerText.indexOf(lowerQuery, at + query.length);
    }
    return { matches, capped: false };
  }
  // One entry per UTF-16 unit, as the text is indexed: an emoji is two units on both sides.
  const queryChars = Array.from({ length: query.length }, (_, k) => query[k].toLowerCase());
  const last = text.length - query.length;
  for (let i = 0; i <= last; i++) {
    if (!matchesAt(text, i, queryChars)) continue;
    if (matches.length === max) return { matches, capped: true };
    matches.push({ start: i, end: i + query.length });
    i += query.length - 1;
  }
  return { matches, capped: false };
}

/** Whether `text` holds the query at `at`, one UTF-16 unit at a time, each lowercased on its own. */
function matchesAt(text: string, at: number, queryChars: readonly string[]): boolean {
  for (let k = 0; k < queryChars.length; k++) {
    if (text[at + k].toLowerCase() !== queryChars[k]) return false;
  }
  return true;
}

/** Whether the text at `match` still reads as `query` (D8: a stale current match is not replaced). */
export function stillMatches(text: string, match: TextMatch, query: string): boolean {
  const found = findMatches(text.slice(match.start, match.end), query, 1).matches[0];
  return found !== undefined && found.start === 0 && found.end === match.end - match.start;
}

/** Matches grouped by 0-based line, as ranges relative to the line's start (for decorateLine). */
export function matchesByLine(text: string, matches: readonly TextMatch[]): ReadonlyMap<number, readonly CharRange[]> {
  const byLine = new Map<number, CharRange[]>();
  let line = 0;
  let lineStart = 0;
  let nextBreak = text.indexOf('\n');
  for (const match of matches) {
    // Matches are in order and never cross '\n', so the line only moves forward.
    while (nextBreak !== -1 && nextBreak < match.start) {
      line += 1;
      lineStart = nextBreak + 1;
      nextBreak = text.indexOf('\n', lineStart);
    }
    const range = { start: match.start - lineStart, end: match.end - lineStart };
    const list = byLine.get(line);
    if (list) list.push(range);
    else byLine.set(line, [range]);
  }
  return byLine;
}

/**
 * `next`, with each line's ranges replaced by `previous`'s array for that line
 * when they are equal, so a memoised line whose matches did not change is not
 * drawn again after an edit elsewhere (docs/impl_search.md AC-14). Pure.
 */
export function keepUnchangedLines(
  previous: ReadonlyMap<number, readonly CharRange[]>,
  next: ReadonlyMap<number, readonly CharRange[]>,
): ReadonlyMap<number, readonly CharRange[]> {
  if (previous.size === 0) return next;
  const kept = new Map<number, readonly CharRange[]>();
  for (const [line, ranges] of next) {
    const before = previous.get(line);
    kept.set(line, before && sameRanges(before, ranges) ? before : ranges);
  }
  return kept;
}

function sameRanges(a: readonly CharRange[], b: readonly CharRange[]): boolean {
  return a.length === b.length && a.every((r, i) => r.start === b[i].start && r.end === b[i].end);
}

/** The 0-based line `offset` is on. */
export function lineOfOffset(text: string, offset: number): number {
  let line = 0;
  for (let nl = text.indexOf('\n'); nl !== -1 && nl < offset; nl = text.indexOf('\n', nl + 1)) line += 1;
  return line;
}

/** The text with every match replaced, and where the last replacement ends in it (D7). */
export function replaceAllText(text: string, matches: readonly TextMatch[], replacement: string): { text: string; caret: number } {
  let out = '';
  let from = 0;
  let caret = 0;
  for (const match of matches) {
    out += text.slice(from, match.start) + replacement;
    caret = out.length;
    from = match.end;
  }
  return { text: out + text.slice(from), caret };
}
