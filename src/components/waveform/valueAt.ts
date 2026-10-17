// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reading a trace at a time: binary search over its ascending change times
 * (docs/waveform_viewer_spec.md § 8.1). Pure.
 */

import type { Ticks, Trace } from './model';

/** The index of the last change at or before `time`, or -1 before the first change. */
export function indexAt(trace: Trace, time: Ticks): number {
  const { times } = trace;
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The value at `time`, or undefined before the trace's first change. */
export function valueAt(trace: Trace, time: Ticks): string | undefined {
  const i = indexAt(trace, time);
  return i < 0 ? undefined : trace.values[trace.valueIndex[i]];
}

/** The time of the first change after `time`, or undefined when there is none. */
export function nextChange(trace: Trace, time: Ticks): Ticks | undefined {
  const i = indexAt(trace, time) + 1;
  return i < trace.times.length ? trace.times[i] : undefined;
}

/** The time of the last change before `time`, or undefined when there is none. */
export function previousChange(trace: Trace, time: Ticks): Ticks | undefined {
  let i = indexAt(trace, time);
  if (i >= 0 && trace.times[i] === time) i--;
  return i >= 0 ? trace.times[i] : undefined;
}

/** The span `[start, end)` of the value shown at `time`; end is `endTime` for the last value. */
export function spanAt(trace: Trace, time: Ticks, endTime: Ticks): { start: Ticks; end: Ticks } | undefined {
  const i = indexAt(trace, time);
  if (i < 0) return undefined;
  return { start: trace.times[i], end: i + 1 < trace.times.length ? trace.times[i + 1] : endTime };
}
