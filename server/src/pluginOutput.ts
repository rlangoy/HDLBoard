// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Plugin output of one run (docs/plugin_batch_implementation_plan.md § 6.1, § 6.2):
 * which stdout lines are plugin lines, and the budget they get. Plugin lines bypass the
 * 200 lines/s console budget (`outputLimiter.ts`) and have their own: a rate limit near
 * the measured maximum of a testbench-driven plugin, which only guards the socket
 * against a flood, and a cap per run, which is what bounds the frames one run can send.
 * Lines over budget are counted and reported as summary lines for the console.
 *
 * Pure: the clock is a parameter and nothing here sets a timer. `Session` offers each
 * line to `accept`, calls `flush` with the console limiter's timer and `finish` when the
 * run ends.
 */

import { routeOutputLine, type PluginLine } from './pluginLine.js';

/** ≈ the measured rate of a testbench that drives a plugin directly (§ 6.2): a flood guard, not a throttle. */
export const PLUGIN_LINES_PER_SECOND = 20_000;
/** A 60 s batch run could otherwise send well over a million frames. */
export const MAX_PLUGIN_LINES_PER_RUN = 100_000;
const WINDOW_MS = 1000;

export interface PluginLimits {
  readonly perSecond: number;
  readonly perRun: number;
}

const DEFAULT_LIMITS: PluginLimits = { perSecond: PLUGIN_LINES_PER_SECOND, perRun: MAX_PLUGIN_LINES_PER_RUN };

/** What becomes of one stdout line. */
export type OutputDecision =
  | { readonly to: 'plugin'; readonly line: PluginLine }
  | { readonly to: 'log'; readonly text: string }
  | { readonly to: 'dropped' };

export interface PluginOutput {
  /** Routes `text`: a plugin line within budget, a plugin line over budget, or console output. */
  accept(text: string): OutputDecision;
  /** The rate summary of a window that has ended, or nothing. Call periodically. */
  flush(): string[];
  /** Every summary still owed, ended window or not. Call when the run ends. */
  finish(): string[];
}

export interface PluginOutputOptions {
  readonly now: () => number;
  /** Kinds of the plugins switched off for this run: their lines are console output. */
  readonly disabledKinds: ReadonlySet<string>;
  readonly limits?: PluginLimits;
}

function summaryLine(dropped: number, limit: string): string {
  const noun = dropped === 1 ? 'line' : 'lines';
  return `… ${dropped} plugin ${noun} not shown (plugin limit: ${limit})`;
}

/** Lines per one-second window; the lines over the limit are counted and summarised per window. */
function createRateWindow(now: () => number, perSecond: number) {
  let windowStart = now();
  let inWindow = 0;
  let dropped = 0;
  /** Summaries of windows that ended while lines were arriving, not yet handed out. */
  let owed: string[] = [];

  function close(): void {
    if (dropped > 0) owed.push(summaryLine(dropped, `${perSecond} lines/s`));
    windowStart = now();
    inWindow = 0;
    dropped = 0;
  }

  const closeIfEnded = (): void => {
    if (now() - windowStart >= WINDOW_MS) close();
  };

  function handOut(): string[] {
    const summaries = owed;
    owed = [];
    return summaries;
  }

  return {
    /** True if one more line fits this window; a refused line is counted. */
    admit(): boolean {
      closeIfEnded();
      if (inWindow >= perSecond) {
        dropped += 1;
        return false;
      }
      inWindow += 1;
      return true;
    },
    flush(): string[] {
      closeIfEnded();
      return handOut();
    },
    finish(): string[] {
      close();
      return handOut();
    },
  };
}

/** Lines per run; once full, every further line is counted and summarised when the run ends. */
function createRunCap(perRun: number) {
  let sent = 0;
  let dropped = 0;
  return {
    /** True if one more line fits the run; a refused line is counted. */
    hasRoom(): boolean {
      if (sent < perRun) return true;
      dropped += 1;
      return false;
    },
    count(): void {
      sent += 1;
    },
    finish(): string[] {
      const summary = dropped > 0 ? [summaryLine(dropped, `${perRun} lines per run`)] : [];
      dropped = 0;
      return summary;
    },
  };
}

export function createPluginOutput({ now, disabledKinds, limits = DEFAULT_LIMITS }: PluginOutputOptions): PluginOutput {
  const rate = createRateWindow(now, limits.perSecond);
  const cap = createRunCap(limits.perRun);

  function accept(text: string): OutputDecision {
    const route = routeOutputLine(text, disabledKinds);
    if (route.to === 'log') return route;
    if (!cap.hasRoom() || !rate.admit()) return { to: 'dropped' };
    cap.count();
    return route;
  }

  return {
    accept,
    flush: () => rate.flush(),
    finish: () => [...rate.finish(), ...cap.finish()],
  };
}
