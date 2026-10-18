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

/** A time unit: its symbol and how many femtoseconds it holds. */
export type TimeUnit = readonly [symbol: string, fs: number];

/** The unit a time of `fs` femtoseconds reads best in: the largest that keeps it at 1 or more. */
export function unitFor(fs: number): TimeUnit {
  const magnitude = Math.abs(fs);
  return UNITS.find(([, size]) => magnitude >= size) ?? UNITS[UNITS.length - 1];
}

/** `value` with `decimals` decimals, trailing zeros of the fraction dropped: never those of a whole number (30, not 3). */
function trimmed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

const clampDecimals = (decimals: number): number => Math.min(MOST_DECIMALS, Math.max(0, decimals));

/**
 * The decimals that tell tick marks `stepFs` apart in a unit of `size` fs: zoomed in to
 * 0.1 ps steps near 20 ns, `20.0001 ns`, not `20 ns`. Three when no step is given.
 */
function stepDecimals(size: number, stepFs: number | undefined): number {
  if (stepFs === undefined || stepFs <= 0) return MAX_DECIMALS;
  return clampDecimals(Math.ceil(-Math.log10(stepFs / size) - Number.EPSILON * DECADE));
}

/**
 * The decimals a position known to `resolutionFs` deserves: the last digit is never finer
 * than half the resolution, so the cursor's time does not claim more than the screen can
 * point at. One pixel of 100 ns at 96 µs reads `96.9 µs`, not `96.930 µs`.
 */
function resolutionDecimals(size: number, resolutionFs: number | undefined): number {
  if (resolutionFs === undefined || resolutionFs <= 0) return MAX_DECIMALS;
  return clampDecimals(Math.floor(-Math.log10(resolutionFs / 2 / size) + Number.EPSILON * DECADE));
}

/**
 * A time for display: "0", "850 ns", "1.23 µs" – trailing zeros dropped, with the decimals
 * it takes to tell apart marks `stepFs` apart (three when no step is given).
 */
export function formatFs(fs: number, stepFs?: number): string {
  if (fs === 0) return '0';
  const unit = unitFor(fs);
  return `${formatFsIn(fs, unit, stepFs)} ${unit[0]}`;
}

/** A time as a bare number in `unit`, with the decimals marks `stepFs` apart need: `12.5` for 12.5 ns. */
export function formatFsIn(fs: number, [, size]: TimeUnit, stepFs?: number): string {
  return trimmed(fs / size, stepDecimals(size, stepFs));
}

/**
 * The cursor's time with a fixed number of decimals, so it does not jump while it moves:
 * as many as a position known to `resolutionFs` deserves (three when none is given).
 */
export function formatCursorFs(fs: number, resolutionFs?: number): string {
  const unit = cursorUnitFor(fs);
  return `${formatCursorIn(fs, unit, resolutionFs)} ${unit[0]}`;
}

/** The units the cursor's time can be read and typed in, largest first. */
export const CURSOR_UNITS: readonly TimeUnit[] = UNITS.filter(([, size]) => size >= FS_PER_PS);

/** The cursor unit a time reads best in: as `unitFor`, but nanoseconds for 0 and never below picoseconds. */
export function cursorUnitFor(fs: number): TimeUnit {
  if (fs === 0) return ['ns', FS_PER_NS];
  return CURSOR_UNITS.find(([, size]) => Math.abs(fs) >= size) ?? CURSOR_UNITS[CURSOR_UNITS.length - 1];
}

/** The cursor's time as a bare number in `unit`, with the decimals a position known to `resolutionFs` deserves. */
export function formatCursorIn(fs: number, [, size]: TimeUnit, resolutionFs?: number): string {
  return (fs / size).toFixed(resolutionDecimals(size, resolutionFs));
}

/**
 * A time typed into the cursor field, in femtoseconds: a bare number in `unit`
 * (`24.5`, or `24,5` with a decimal comma), or a number with its own unit (`3 us`).
 * Undefined when it is not a time of zero or more.
 */
export function parseTimeIn(text: string, [, size]: TimeUnit): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  const withUnit = parseSimTime(trimmed);
  if (withUnit !== undefined) return withUnit >= 0 ? withUnit : undefined;
  const value = Number(trimmed);
  return trimmed !== '' && Number.isFinite(value) && value >= 0 ? value * size : undefined;
}

/**
 * How finely the cursor can be placed: the time of one device pixel (a CSS pixel over
 * the screen's pixel ratio, which is below 1 when the browser is zoomed out), but never
 * finer than one tick of the file.
 */
export function pixelResolutionFs(view: TimeView, tickFs: number, pixelRatio = 1): number {
  return Math.max(tickFs, (view.ticksPerPx * tickFs) / (pixelRatio > 0 ? pixelRatio : 1));
}

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
