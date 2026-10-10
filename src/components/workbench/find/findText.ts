// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = MAC ? '⌘' : 'Ctrl+';

/**
 * Every string the Find bar and the Search button show (docs/impl_search.md § 5.3),
 * in one place so UI tests can check them exactly. English. Pure.
 */
export const FIND_TEXT = {
  findPlaceholder: 'Find',
  replacePlaceholder: 'Replace',
  noResults: 'No results',
  previous: 'Previous match (Shift+Enter)',
  next: 'Next match (Enter)',
  clearQuery: 'Clear',
  close: 'Close find',
  replaceToggle: 'Replace',
  showReplace: 'Show replace',
  hideReplace: 'Hide replace',
  replace: 'Replace',
  replaceTitle: 'Replace this match (Enter)',
  replaceAll: 'Replace All',
  replaceAllTitle: `Replace every match in this file (${MOD}Enter)`,
  searchTitle: `Find in this file (${MOD}F)`,
} as const;

export const searchLabel = (fileName: string): string => `Search in ${fileName}`;
export const findLabel = (fileName: string): string => `Find in ${fileName}`;
export const replaceLabel = (fileName: string): string => `Replace in ${fileName}`;

/** `x of n`, `x of 10000+` when capped (D15), `No results`, or nothing for an empty query. */
export function counterText(query: string, current: number, count: number, capped: boolean): string {
  if (query.length === 0) return '';
  if (count === 0) return FIND_TEXT.noResults;
  return `${current + 1} of ${count}${capped ? '+' : ''}`;
}

/** The Replace All confirmation (§ 5.3). */
export const replacedAll = (n: number): string => `Replaced ${n}`;

