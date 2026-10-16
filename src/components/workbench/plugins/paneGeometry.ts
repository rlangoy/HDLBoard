// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The arithmetic of the plugin pane: which rows of a long list are on screen, and how
 * wide the pane is beside the console. Pure, apart from the two localStorage helpers,
 * which never throw.
 */

/** Rows drawn above and below the visible ones, so a fast scroll shows no gap. */
const OVERSCAN_ROWS = 10;

export interface RowRange {
  /** First row to draw. */
  readonly start: number;
  /** One past the last row to draw. */
  readonly end: number;
}

/** The rows a viewport of `height` pixels shows at `scrollTop`, with `OVERSCAN_ROWS` around them. */
export function visibleRows(scrollTop: number, height: number, rowHeight: number, count: number): RowRange {
  const first = Math.floor(scrollTop / rowHeight);
  const shown = Math.ceil(height / rowHeight);
  return { start: Math.max(0, first - OVERSCAN_ROWS), end: Math.min(count, first + shown + OVERSCAN_ROWS) };
}

/** The pane's share of the console's width: room for both, whatever was stored. */
const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.8;
export const DEFAULT_PANE_FRACTION = 0.45;

export const clampPaneFraction = (fraction: number): number =>
  Number.isFinite(fraction) ? Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, fraction)) : DEFAULT_PANE_FRACTION;

/** The pane's share after the splitter was dragged to `pointerX` in an area spanning `left`..`left + width`. */
export function paneFractionAt(pointerX: number, left: number, width: number): number {
  return clampPaneFraction(width > 0 ? (left + width - pointerX) / width : DEFAULT_PANE_FRACTION);
}

const STORAGE_KEY = 'hdlboard.pluginPaneFraction.v1';

export function loadPaneFraction(): number {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_PANE_FRACTION : clampPaneFraction(Number(stored));
  } catch {
    return DEFAULT_PANE_FRACTION;
  }
}

export function savePaneFraction(fraction: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(fraction));
  } catch {
    // Storage blocked or full: the width just isn't remembered.
  }
}
