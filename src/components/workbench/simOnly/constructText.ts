// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Lines and offsets of a unit's blanked code (rules.ts `UnitText`), as the
 * construct matchers need them. Pure.
 */

import type { UnitText } from '../tbDetect/rules';

export type Range = { readonly from: number; readonly to: number };

/** File offsets of every match of `pattern`, with the match. */
export const matchesIn = (t: UnitText, pattern: RegExp): [number, RegExpMatchArray][] =>
  [...t.code.matchAll(pattern)].map((m) => [t.base + (m.index ?? 0), m]);

/** The lines of every match of `pattern`; `keep` may drop a match. */
export function linesOf(t: UnitText, pattern: RegExp, keep: (at: number, m: RegExpMatchArray) => boolean = () => true): number[] {
  return matchesIn(t, pattern).filter(([at, m]) => keep(at, m)).map(([at]) => t.lineOf(at));
}

export const inside = (at: number, ranges: readonly Range[]): boolean => ranges.some((r) => at >= r.from && at < r.to);

/** The unit's code from file offset `from` to the next `;` (or the end). */
export function statementFrom(t: UnitText, from: number): string {
  const local = from - t.base;
  const end = t.code.indexOf(';', local);
  return t.code.slice(local, end < 0 ? t.code.length : end);
}

/** The blocks of the unit that contain file offset `at`. */
export const blockAt = (t: UnitText, at: number) => t.unit.blocks.find((b) => at >= b.from && at < b.to);

/** The unit's code of a block. */
export const blockText = (t: UnitText, block: Range): string => t.code.slice(block.from - t.base, block.to - t.base);

/** `text` as a literal inside a regular expression. */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
