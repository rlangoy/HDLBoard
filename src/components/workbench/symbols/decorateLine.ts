// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { isInside, markRanges, type CharRange, type MarkedToken, type Token } from '../vhdlHighlight';
import type { Occurrence, OccurrenceKind } from './types';

/** How a piece shows a search match (docs/impl_search.md § 5.4). */
export type FindMark = 'match' | 'current';

/** A piece of a highlighted line: its token colour, the diagnostic underline, any occurrence highlight and any search match. */
export interface DecoratedPiece extends MarkedToken {
  readonly occurrence?: OccurrenceKind;
  readonly find?: FindMark;
}

const NO_RANGES: readonly CharRange[] = [];

/**
 * Splits a line's tokens at every diagnostic, occurrence and search-match boundary
 * (the existing `markRanges` does the cutting) and labels each piece. The pieces
 * put together are the line, unchanged. Pure.
 */
export function decorateLine(
  tokens: readonly Token[],
  diagnosticRanges: readonly CharRange[],
  occurrences: readonly Occurrence[],
  findRanges: readonly CharRange[] = NO_RANGES,
  currentFind?: CharRange,
): DecoratedPiece[] {
  if (occurrences.length === 0 && findRanges.length === 0) return markRanges(tokens, diagnosticRanges);
  const pieces = markRanges(tokens, [...diagnosticRanges, ...occurrences, ...findRanges]);
  let offset = 0;
  return pieces.map((piece) => {
    const at = offset;
    offset += piece.text.length;
    const occurrence = occurrences.find((o) => o.start <= at && at < o.end)?.kind;
    const find = findMarkAt(at, findRanges, currentFind);
    return { ...piece, marked: isInside(at, diagnosticRanges), occurrence, find };
  });
}

function findMarkAt(at: number, findRanges: readonly CharRange[], current: CharRange | undefined): FindMark | undefined {
  if (current && current.start <= at && at < current.end) return 'current';
  return isInside(at, findRanges) ? 'match' : undefined;
}
