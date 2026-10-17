// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where the cursor goes with the arrow keys (FR-10): to the next or previous change of
 * the selected signal – or of any shown signal when none is selected – and, with Shift,
 * a small step of the window. Pure.
 */

import type { Ticks, Trace } from './model';
import { nextChange, previousChange } from './valueAt';

/** Shift + arrow moves the cursor by this share of the window. */
const FINE_STEP_SHARE = 0.01;

export type Direction = 'previous' | 'next';

/** The nearest change in `direction` among `traces`, or undefined when there is none. */
export function changeFrom(traces: readonly Trace[], time: Ticks, direction: Direction): Ticks | undefined {
  const found = traces
    .map((trace) => (direction === 'next' ? nextChange(trace, time) : previousChange(trace, time)))
    .filter((t): t is Ticks => t !== undefined);
  if (found.length === 0) return undefined;
  return direction === 'next' ? Math.min(...found) : Math.max(...found);
}

export function fineStep(time: Ticks, windowSpan: Ticks, direction: Direction): Ticks {
  const step = windowSpan * FINE_STEP_SHARE;
  return Math.max(0, direction === 'next' ? time + step : time - step);
}
