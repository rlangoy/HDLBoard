// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Simulated time on screen: ticks ↔ pixels, tick marks at 1-2-5 steps, and time as
 * text with a unit chosen for it (docs/waveform_viewer_spec.md FR-3, S4). Extends
 * `plugins/simTime.ts`, which knows nanoseconds only, down to fs and ps. Pure.
 */

import type { Ticks } from './model';

/** What part of the run is on screen: the time at the left edge and how much time one pixel is. */
export interface TimeView {
  readonly start: Ticks;
  readonly ticksPerPx: number;
}

const UNITS: ReadonlyArray<readonly [string, number]> = [
  ['s', 1e15],
  ['ms', 1e12],
  ['µs', 1e9],
  ['ns', 1e6],
  ['ps', 1e3],
  ['fs', 1],
];
const STEP_MULTIPLIERS = [1, 2, 5];
/** Labels need about this much room; ticks are never closer. */
export const MIN_TICK_SPACING_PX = 90;
const MAX_DECIMALS = 3;

export const timeToX = (view: TimeView, time: Ticks): number => (time - view.start) / view.ticksPerPx;
export const xToTime = (view: TimeView, x: number): Ticks => view.start + x * view.ticksPerPx;

/** The view that shows `[start, end]` across `widthPx`. */
export function viewOf(start: Ticks, end: Ticks, widthPx: number): TimeView {
  const span = Math.max(end - start, 1);
  return { start, ticksPerPx: span / Math.max(widthPx, 1) };
}

/** The unit a time of `fs` femtoseconds reads best in: the largest that keeps it at 1 or more. */
function unitFor(fs: number): readonly [string, number] {
  const magnitude = Math.abs(fs);
  return UNITS.find(([, size]) => magnitude >= size) ?? UNITS[UNITS.length - 1];
}

function trimmed(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

/** A time for display: "0", "850 ns", "1.23 µs" – up to three decimals, trailing zeros dropped. */
export function formatFs(fs: number): string {
  if (fs === 0) return '0';
  const [unit, size] = unitFor(fs);
  return `${trimmed(fs / size, MAX_DECIMALS)} ${unit}`;
}

/** The cursor's time, always with three decimals so it does not jump while it moves: "1.230 µs". */
export function formatCursorFs(fs: number): string {
  if (fs === 0) return '0 ns';
  const [unit, size] = unitFor(fs);
  return `${(fs / size).toFixed(MAX_DECIMALS)} ${unit}`;
}

/** The smallest 1-2-5 step, in femtoseconds, whose marks are at least `minPx` apart. */
export function tickStepFs(ticksPerPx: number, tickFs: number, minPx = MIN_TICK_SPACING_PX): number {
  const wanted = ticksPerPx * tickFs * minPx;
  let decade = 10 ** Math.floor(Math.log10(Math.max(wanted, tickFs)));
  for (;;) {
    for (const m of STEP_MULTIPLIERS) {
      const step = m * decade;
      if (step >= wanted && step >= tickFs) return step;
    }
    decade *= 10;
  }
}

export interface TickMark {
  readonly x: number;
  readonly label: string;
}

/** The tick marks across a canvas `widthPx` wide. */
export function tickMarks(view: TimeView, widthPx: number, tickFs: number): TickMark[] {
  const stepFs = tickStepFs(view.ticksPerPx, tickFs);
  const stepTicks = stepFs / tickFs;
  const marks: TickMark[] = [];
  const firstIndex = Math.ceil(view.start / stepTicks);
  // Each mark is index × step, not a running sum, so labels never drift (NFR-2).
  for (let k = firstIndex; ; k++) {
    const t = k * stepTicks;
    const x = timeToX(view, t);
    if (x > widthPx) break;
    marks.push({ x, label: formatFs(t * tickFs) });
  }
  return marks;
}

const SIM_TIME = /^(-?\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|sec|s)$/i;
const FS_PER: Readonly<Record<string, number>> = { fs: 1, ps: 1e3, ns: 1e6, us: 1e9, µs: 1e9, ms: 1e12, sec: 1e15, s: 1e15 };

/** A time as GHDL writes it – `1230ns`, `1.5us`, `0ms` – in femtoseconds, or undefined. */
export function parseSimTime(text: string): number | undefined {
  const match = SIM_TIME.exec(text.trim());
  if (!match) return undefined;
  return Math.round(Number(match[1]) * FS_PER[match[2].toLowerCase()]);
}
