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

const FS_PER_PS = 1e3;
const FS_PER_NS = 1e6;
const FS_PER_US = 1e9;
const FS_PER_MS = 1e12;
const FS_PER_S = 1e15;

const UNITS: ReadonlyArray<readonly [string, number]> = [
  ['s', FS_PER_S],
  ['ms', FS_PER_MS],
  ['µs', FS_PER_US],
  ['ns', FS_PER_NS],
  ['ps', FS_PER_PS],
  ['fs', 1],
];
const DECADE = 10;
/** Tick steps of 1, 2 and 5 times a power of ten. */
const STEP_MULTIPLIERS = [1, 2, DECADE / 2];
/** Labels need about this much room; ticks are never closer. */
export const MIN_TICK_SPACING_PX = 90;
const MAX_DECIMALS = 3;
/** More would only show the noise of floating point. */
const MOST_DECIMALS = 9;

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

/**
 * The decimals a time in a unit of `size` fs needs so that times `resolutionFs` apart
 * read differently: zoomed in to 0.1 ps steps near 20 ns, `20.0001 ns`, not `20 ns`.
 * Never fewer than three.
 */
function decimalsFor(size: number, resolutionFs: number | undefined): number {
  if (resolutionFs === undefined || resolutionFs <= 0) return MAX_DECIMALS;
  const needed = Math.ceil(-Math.log10(resolutionFs / size) - Number.EPSILON * DECADE);
  return Math.min(MOST_DECIMALS, Math.max(MAX_DECIMALS, needed));
}

/**
 * A time for display: "0", "850 ns", "1.23 µs" – trailing zeros dropped, and as many
 * decimals as it takes to tell apart times `resolutionFs` apart (three at least).
 */
export function formatFs(fs: number, resolutionFs?: number): string {
  if (fs === 0) return '0';
  const [unit, size] = unitFor(fs);
  return `${trimmed(fs / size, decimalsFor(size, resolutionFs))} ${unit}`;
}

/** The cursor's time with a fixed number of decimals, so it does not jump while it moves: "1.230 µs". */
export function formatCursorFs(fs: number, resolutionFs?: number): string {
  if (fs === 0) return '0 ns';
  const [unit, size] = unitFor(fs);
  return `${(fs / size).toFixed(decimalsFor(size, resolutionFs))} ${unit}`;
}

/** The time one pixel shows, or one tick of the file when that is longer: how finely the cursor can stand. */
export const pixelResolutionFs = (view: TimeView, tickFs: number): number => Math.max(tickFs, view.ticksPerPx * tickFs);

/** The smallest 1-2-5 step, in femtoseconds, whose marks are at least `minPx` apart. */
export function tickStepFs(ticksPerPx: number, tickFs: number, minPx = MIN_TICK_SPACING_PX): number {
  const wanted = ticksPerPx * tickFs * minPx;
  let decade = DECADE ** Math.floor(Math.log10(Math.max(wanted, tickFs)));
  for (;;) {
    for (const m of STEP_MULTIPLIERS) {
      const step = m * decade;
      if (step >= wanted && step >= tickFs) return step;
    }
    decade *= DECADE;
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
    marks.push({ x, label: formatFs(t * tickFs, stepFs) });
  }
  return marks;
}

const SIM_TIME = /^(-?\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|sec|s)$/i;
const FS_PER: Readonly<Record<string, number>> = { fs: 1, ps: FS_PER_PS, ns: FS_PER_NS, us: FS_PER_US, µs: FS_PER_US, ms: FS_PER_MS, sec: FS_PER_S, s: FS_PER_S };

/** A time as GHDL writes it – `1230ns`, `1.5us`, `0ms` – in femtoseconds, or undefined. */
export function parseSimTime(text: string): number | undefined {
  const match = SIM_TIME.exec(text.trim());
  if (!match) return undefined;
  return Math.round(Number(match[1]) * FS_PER[match[2].toLowerCase()]);
}
