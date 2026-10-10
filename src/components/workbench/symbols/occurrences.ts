// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { HdlSymbol, Occurrence } from './types';

const NONE: ReadonlyMap<number, readonly Occurrence[]> = new Map();

/** What to paint for a hovered symbol, by 0-based line: its declaration and every reference. Pure. */
export function occurrencesByLine(symbol: HdlSymbol | undefined): ReadonlyMap<number, readonly Occurrence[]> {
  if (!symbol) return NONE;
  const all: Occurrence[] = [
    { ...symbol.declaration, kind: 'declaration' },
    ...symbol.references.map((span): Occurrence => ({ ...span, kind: 'reference' })),
  ];
  const byLine = new Map<number, Occurrence[]>();
  for (const occurrence of all) {
    const list = byLine.get(occurrence.line);
    if (list) list.push(occurrence);
    else byLine.set(occurrence.line, [occurrence]);
  }
  return byLine;
}
