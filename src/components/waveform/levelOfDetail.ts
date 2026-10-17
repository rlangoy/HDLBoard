// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What one row draws across the visible time window: its values as spans, with every
 * run of changes closer together than a pixel collapsed into one "busy" span
 * (docs/waveform_viewer_spec.md § 8.5). Each step is a binary search, so the cost
 * follows the screen's width, not the number of changes (NFR-1). Pure.
 */

import type { Ticks, Trace } from './model';
import { indexAt } from './valueAt';

export interface Span {
  readonly start: Ticks;
  readonly end: Ticks;
  /** Index into `trace.values`; -1 before the first change, `BUSY` for a collapsed run. */
  readonly value: number;
}

export const BUSY = -2;
export const NO_VALUE = -1;

/** The spans of `trace` between `from` and `to` when one pixel is `ticksPerPx`. */
export function visibleSpans(trace: Trace, from: Ticks, to: Ticks, ticksPerPx: number): Span[] {
  const { times, valueIndex } = trace;
  const n = times.length;
  const spans: Span[] = [];
  let i = indexAt(trace, from);
  let t = from;
  while (t < to) {
    const next = i + 1 < n ? times[i + 1] : to;
    if (next >= t + ticksPerPx || i + 1 >= n) {
      spans.push({ start: t, end: Math.min(next, to), value: i < 0 ? NO_VALUE : valueIndex[i] });
      t = next;
      i++;
      continue;
    }
    // Changes closer than a pixel: skip ahead to the first change that is followed by a full pixel of quiet.
    let j = i + 1;
    for (;;) {
      const k = indexAt(trace, times[j] + ticksPerPx);
      if (k === j) break;
      j = k;
    }
    spans.push({ start: t, end: Math.min(times[j], to), value: BUSY });
    t = times[j];
    i = j;
  }
  return spans;
}
