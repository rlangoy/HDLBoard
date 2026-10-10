// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { isInside, markRanges, type CharRange, type MarkedToken, type Token } from '../vhdlHighlight';
import type { Occurrence, OccurrenceKind } from './types';

/** A piece of a highlighted line: its token colour, the diagnostic underline, and any occurrence highlight. */
export interface DecoratedPiece extends MarkedToken {
  readonly occurrence?: OccurrenceKind;
}

/**
 * Splits a line's tokens at every diagnostic and occurrence boundary (the existing
 * `markRanges` does the cutting) and labels each piece. The pieces put together
 * are the line, unchanged. Pure.
 */
export function decorateLine(
  tokens: readonly Token[],
  diagnosticRanges: readonly CharRange[],
  occurrences: readonly Occurrence[],
): DecoratedPiece[] {
  if (occurrences.length === 0) return markRanges(tokens, diagnosticRanges);
  const pieces = markRanges(tokens, [...diagnosticRanges, ...occurrences]);
  let offset = 0;
  return pieces.map((piece) => {
    const at = offset;
    offset += piece.text.length;
    const occurrence = occurrences.find((o) => o.start <= at && at < o.end)?.kind;
    return { ...piece, marked: isInside(at, diagnosticRanges), occurrence };
  });
}
