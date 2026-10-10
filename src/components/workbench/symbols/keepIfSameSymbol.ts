// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { HdlSymbol } from './types';

/**
 * The position to store when the pointer or text cursor moves, chosen so that React
 * sees an unchanged state, and skips re-rendering the editor, whenever the highlight
 * would not change:
 * - on the same symbol as before: the previous position;
 * - on no symbol: undefined (never a position, which a later edit could move onto a name).
 * Moving within a name, between keywords, or while typing then costs nothing. Pure.
 *
 * @param symbolOf Looks a position up in the current symbol index.
 */
export function keepIfSameSymbol<Position>(
  previous: Position | undefined,
  next: Position | undefined,
  symbolOf: (position: Position) => HdlSymbol | undefined,
): Position | undefined {
  const nextSymbol = next === undefined ? undefined : symbolOf(next);
  if (!nextSymbol) return undefined;
  const previousSymbol = previous === undefined ? undefined : symbolOf(previous);
  return previousSymbol === nextSymbol ? previous : next;
}
