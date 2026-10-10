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
  return groupByLine(all);
}

/** Groups spans by their 0-based line, keeping their order. Pure. */
export function groupByLine<T extends { readonly line: number }>(items: readonly T[]): Map<number, T[]> {
  const byLine = new Map<number, T[]>();
  for (const item of items) {
    const list = byLine.get(item.line);
    if (list) list.push(item);
    else byLine.set(item.line, [item]);
  }
  return byLine;
}
