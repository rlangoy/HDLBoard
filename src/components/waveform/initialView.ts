// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The first view of a waveform (docs/waveform_viewer_spec.md FR-5, FR-26, W11): which
 * signals are shown, which part of the run, and where the cursor is. Start where the
 * problem is – after a failing check, zoomed in at the first error. Pure.
 */

import { NO_TRACE, type Ticks, type WaveformData } from './model';
import { childPath, testbenchScope, type SignalPath } from './signalRows';

/** Around an error the view shows a tenth of the run … */
const ERROR_WINDOW_FRACTION = 0.1;
/** … and at least this many clock periods, when a clock is found. */
const ERROR_WINDOW_MIN_PERIODS = 20;
/** Changes looked at to decide whether a signal is a clock. */
const CLOCK_SAMPLE_CHANGES = 9;
const CLOCK_NAME = /cl(oc)?k/i;

/** The testbench's own signals in declaration order, as many as `maxRows` (FR-5). */
export function firstShown(data: WaveformData, maxRows: number): SignalPath[] {
  const tb = testbenchScope(data);
  if (tb === undefined) return [];
  return tb.signals
    .filter((signal) => signal.trace !== NO_TRACE)
    .slice(0, Math.max(0, maxRows))
    .map((signal) => childPath(tb.name, signal.name));
}

/** The period of the testbench's clock in ticks: a one-bit signal that toggles at a fixed rate. */
export function clockPeriod(data: WaveformData): Ticks | undefined {
  const tb = testbenchScope(data);
  if (tb === undefined) return undefined;
  const candidates = tb.signals.filter((s) => s.kind === 'logic');
  candidates.sort((a, b) => Number(CLOCK_NAME.test(b.name)) - Number(CLOCK_NAME.test(a.name)));
  for (const signal of candidates) {
    const times = data.traces.get(signal.trace)?.times;
    if (times === undefined || times.length < CLOCK_SAMPLE_CHANGES) continue;
    // Skip the first change: a clock usually starts at its initial value at time 0.
    const period = times[3] - times[1];
    let regular = period > 0;
    for (let i = 1; regular && i + 2 < CLOCK_SAMPLE_CHANGES; i++) regular = times[i + 2] - times[i] === period;
    if (regular) return period;
  }
  return undefined;
}

export interface TimeWindow {
  readonly start: Ticks;
  readonly end: Ticks;
  readonly cursor: Ticks;
  /** The first error's time, drawn as a red marker, and its message for the marker's tooltip. */
  readonly error?: { readonly time: Ticks; readonly text: string };
}

export interface RunMoments {
  /** The first failing check, in femtoseconds (`consoleTimes.firstError`). */
  readonly firstError?: { readonly fs: number; readonly text: string };
  /** The last line that names a time, in femtoseconds. */
  readonly lastReportFs?: number;
}

/** The run's length on screen: the file's last change, or a later reported time. */
export function runEnd(data: WaveformData, moments: RunMoments): Ticks {
  const toTicks = (fs: number | undefined) => (fs === undefined ? 0 : fs / data.tickFs);
  return Math.max(data.endTime, toTicks(moments.firstError?.fs), toTicks(moments.lastReportFs), 1);
}

export function firstWindow(data: WaveformData, moments: RunMoments): TimeWindow {
  const end = runEnd(data, moments);
  const error = moments.firstError;
  if (error === undefined) {
    const cursor = moments.lastReportFs === undefined ? 0 : moments.lastReportFs / data.tickFs;
    return { start: 0, end, cursor };
  }
  const at = error.fs / data.tickFs;
  const period = clockPeriod(data);
  const width = Math.min(end, Math.max(end * ERROR_WINDOW_FRACTION, (period ?? 0) * ERROR_WINDOW_MIN_PERIODS));
  const start = Math.max(0, Math.min(at - width / 2, end - width));
  return { start, end: start + width, cursor: at, error: { time: at, text: error.text } };
}
