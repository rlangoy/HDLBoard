// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The split divider's geometry and the split's stored preferences
 * (docs/impl_split_screen.md § 4.8, § 4.9, § 6.4, § 6.7). The TB pane is the
 * primary pane: the fraction is its share of the editor column. Pure, apart
 * from the two localStorage helpers, which never throw.
 */

import type { SplitPreference } from './editorView';
import { EDITOR_MIN_W } from './paneLayout';

/** Each half must stay as usable as the editor alone. */
export const SPLIT_PANE_MIN_W = EDITOR_MIN_W;
/** = --wb-split-divider-w */
export const SPLIT_DIVIDER_W = 5;
export const SPLIT_DEFAULT_TB_FRACTION = 0.5;
export const SPLIT_KEY_STEP = 0.02;
export const SPLIT_KEY_STEP_LARGE = 0.1;

export const canSplit = (columnWidth: number): boolean => columnWidth >= 2 * SPLIT_PANE_MIN_W + SPLIT_DIVIDER_W;

export interface FractionBounds {
  readonly min: number;
  readonly max: number;
}

/** The TB fraction's bounds: each pane keeps its minimum width. */
export function fractionBounds(columnWidth: number): FractionBounds {
  const room = columnWidth - SPLIT_DIVIDER_W;
  if (room <= 2 * SPLIT_PANE_MIN_W) return { min: 0.5, max: 0.5 };
  const min = SPLIT_PANE_MIN_W / room;
  return { min, max: 1 - min };
}

export const clampFraction = (fraction: number, bounds: FractionBounds): number =>
  Math.min(Math.max(fraction, bounds.min), bounds.max);

/** A key on the focused divider: the new fraction, 'collapse' (Enter), or undefined (not ours). */
export function fractionForKey(
  key: string,
  shift: boolean,
  current: number,
  bounds: FractionBounds,
): number | 'collapse' | undefined {
  const step = shift ? SPLIT_KEY_STEP_LARGE : SPLIT_KEY_STEP;
  switch (key) {
    case 'ArrowLeft':
      return clampFraction(current - step, bounds);
    case 'ArrowRight':
      return clampFraction(current + step, bounds);
    case 'Home':
      return bounds.min;
    case 'End':
      return bounds.max;
    case 'Enter':
      return 'collapse';
    default:
      return undefined;
  }
}

export interface EditorSplitPrefs {
  readonly tbFraction: number;
  readonly preference: SplitPreference;
}

export const DEFAULT_SPLIT_PREFS: EditorSplitPrefs = { tbFraction: SPLIT_DEFAULT_TB_FRACTION, preference: 'auto' };

const STORAGE_KEY = 'hdlboard.editorSplit.v1';
const PREFERENCES: readonly SplitPreference[] = ['auto', 'always', 'never'];

const isFraction = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1;
const isPreference = (v: unknown): v is SplitPreference => PREFERENCES.includes(v as SplitPreference);

/** Anything missing or malformed falls back to the matching default, as parsePaneLayout does. */
export function parseEditorSplitPrefs(json: string | null, defaults: EditorSplitPrefs): EditorSplitPrefs {
  try {
    const raw: unknown = JSON.parse(json ?? 'null');
    if (!raw || typeof raw !== 'object') return defaults;
    const r = raw as Record<string, unknown>;
    return {
      tbFraction: isFraction(r.tbFraction) ? r.tbFraction : defaults.tbFraction,
      preference: isPreference(r.preference) ? r.preference : defaults.preference,
    };
  } catch {
    return defaults;
  }
}

export function loadEditorSplitPrefs(defaults: EditorSplitPrefs): EditorSplitPrefs {
  try {
    return parseEditorSplitPrefs(window.localStorage.getItem(STORAGE_KEY), defaults);
  } catch {
    return defaults;
  }
}

export function saveEditorSplitPrefs(prefs: EditorSplitPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked or full: the split just isn't remembered.
  }
}
