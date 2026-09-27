// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A budget for the simulator's own output lines (docs/Verilog_implementation_plan.md
 * § 5.5). A design that prints on every clock edge produces hundreds of thousands of
 * lines a second — more than a WebSocket or a console can take — so at most
 * `LOG_LINES_PER_SECOND` are forwarded per one-second window. The rest are counted and
 * reported in one summary line when the window ends.
 *
 * Pure: the clock is a parameter and nothing here sets a timer. The caller offers each
 * line to `accept` and calls `flush` now and then, so a flood that stops still gets its
 * summary.
 */

export const LOG_LINES_PER_SECOND = 200;
const WINDOW_MS = 1000;

export interface OutputLimiter {
  /** The lines to forward for `line`: the previous window's summary if it just ended, then `line` while the budget lasts. */
  accept(line: string): string[];
  /** The summary of a window that has ended, or nothing. Call periodically. */
  flush(): string[];
  /** The summary of the window in progress, ended or not. Call when the run ends. */
  finish(): string[];
}

function summaryLine(dropped: number, limit: number): string {
  const noun = dropped === 1 ? 'line' : 'lines';
  return `… ${dropped} more ${noun} not shown (output limit: ${limit} lines/s)`;
}

export function createOutputLimiter(now: () => number, limit: number = LOG_LINES_PER_SECOND): OutputLimiter {
  let windowStart = now();
  let forwarded = 0;
  let dropped = 0;

  function closeWindow(): string[] {
    const summary = dropped > 0 ? [summaryLine(dropped, limit)] : [];
    windowStart = now();
    forwarded = 0;
    dropped = 0;
    return summary;
  }

  const windowHasEnded = (): boolean => now() - windowStart >= WINDOW_MS;

  function flush(): string[] {
    return windowHasEnded() ? closeWindow() : [];
  }

  function accept(line: string): string[] {
    const summary = flush();
    if (forwarded >= limit) {
      dropped += 1;
      return summary;
    }
    forwarded += 1;
    return [...summary, line];
  }

  return { accept, flush, finish: closeWindow };
}
