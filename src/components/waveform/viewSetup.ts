// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What the student has set up in the waveform view – which signals are shown and in
 * what order, which folders and vectors are unfolded, "Show as", the time window and the
 * cursor – and how each action changes it (docs/waveform_viewer_spec.md § 8.6, FR-17).
 * A reducer, so every change is a pure, tested function. Pure.
 */

import { firstShown, firstWindow, type RunMoments } from './initialView';
import type { Ticks, WaveformData } from './model';
import { SHOW_AS_LABELS, type ShowAs } from './radix';
import { signalsByPath, type ListState, type SignalPath } from './signalRows';

/** The time window on screen. */
export interface Window {
  readonly start: Ticks;
  readonly end: Ticks;
}

export interface ViewSetup {
  readonly list: ListState;
  readonly showAs: ReadonlyMap<SignalPath, ShowAs>;
  readonly window: Window;
  readonly cursor: Ticks;
  /** The femtoseconds in one tick of the waveform `window` and `cursor` count in. */
  readonly tickFs: number;
  /** The run's end, in the same ticks. */
  readonly runEnd: Ticks;
}

/** What is kept between runs and openings (FR-17), as plain data. */
export interface ViewMemory {
  readonly shown: readonly SignalPath[];
  readonly open: readonly string[];
  readonly expanded: readonly SignalPath[];
  readonly showAs: ReadonlyArray<readonly [SignalPath, ShowAs]>;
  readonly window: Window;
  readonly cursor: Ticks;
  /** The tick `window` and `cursor` count in: the next run may count in another (Icarus ps, GHDL fs). */
  readonly tickFs: number;
  /** That run's end: a window showing all of it shows all of the next run too, which may be longer or shorter. */
  readonly runEnd: Ticks;
}

/** The limits a window must stay inside. */
export interface WindowBounds {
  /** The run's length. */
  readonly end: Ticks;
  /** The narrowest window: a few pixels per tick of the file. */
  readonly minSpan: Ticks;
}

export function toMemory(setup: ViewSetup): ViewMemory {
  return {
    shown: setup.list.shown,
    open: [...setup.list.open],
    expanded: [...setup.list.expanded],
    showAs: [...setup.showAs],
    window: setup.window,
    cursor: setup.cursor,
    tickFs: setup.tickFs,
    runEnd: setup.runEnd,
  };
}

const isShowAs = (value: string): value is ShowAs => SHOW_AS_LABELS.some(([known]) => known === value);

/** The first view of a waveform (FR-5, FR-26). */
function firstSetup(data: WaveformData, moments: RunMoments, fittingRows: number): ViewSetup {
  const { start, end, cursor } = firstWindow(data, moments);
  const list: ListState = { shown: firstShown(data, fittingRows), open: new Set(), expanded: new Set() };
  return { list, showAs: new Map(), window: { start, end }, cursor, tickFs: data.tickFs, runEnd: data.endTime };
}

export interface SetupContext {
  readonly moments: RunMoments;
  /** How many rows fit the view's height: as many signals are shown at first (FR-5). */
  readonly fittingRows: number;
}

/** The first view, or the student's own setup for every signal that still exists (FR-17). */
export function setupFor(data: WaveformData, memory: ViewMemory | null, context: SetupContext): ViewSetup {
  const known = signalsByPath(data);
  const shown = memory?.shown.filter((path) => known.has(path)) ?? [];
  if (memory === null || shown.length === 0) return firstSetup(data, context.moments, context.fittingRows);
  const first = firstWindow(data, context.moments);
  // A run with an error still opens at it: start where the problem is (W11).
  const place = first.error === undefined ? rememberedPlace(memory, data) : { window: { start: first.start, end: first.end }, cursor: first.cursor };
  return {
    list: { shown, open: new Set(memory.open), expanded: new Set(memory.expanded.filter((path) => known.has(path))) },
    showAs: new Map(memory.showAs.filter(([path, showAs]) => known.has(path) && isShowAs(showAs))),
    ...place,
    tickFs: data.tickFs,
    runEnd: data.endTime,
  };
}

/**
 * The remembered window and cursor in a new run (FR-17): the same times, in this
 * waveform's ticks – a Verilog run (ps) after a VHDL one (fs) would otherwise open on a
 * sliver near 0 – and inside it. A window that showed the whole run shows the whole new
 * one, and a cursor at the run's end goes to the new end: a VHDL run of 480 ns and a
 * Verilog one of 231 ns of the same testbench each open whole.
 */
function rememberedPlace(memory: ViewMemory, data: WaveformData): { window: Window; cursor: Ticks } {
  const end = data.endTime;
  const scale = memory.tickFs / data.tickFs;
  const ticks = (time: Ticks) => Math.round(time * scale);
  const wasWhole = memory.window.start <= 0 && memory.window.end >= memory.runEnd;
  const window = wasWhole
    ? { start: 0, end }
    : clampWindow({ start: ticks(memory.window.start), end: ticks(memory.window.end) }, { end, minSpan: 1 });
  const cursor = memory.cursor >= memory.runEnd ? end : Math.min(Math.max(ticks(memory.cursor), 0), end);
  return { window, cursor };
}

/**
 * `window`, kept inside the run: not narrower than `minSpan`, never before 0 nor past
 * the run's end – zoomed all the way out it shows exactly the whole run.
 */
export function clampWindow(window: Window, bounds: WindowBounds): Window {
  const runEnd = Math.max(bounds.end, bounds.minSpan);
  const span = Math.min(Math.max(window.end - window.start, bounds.minSpan), runEnd);
  const start = Math.min(Math.max(window.start, 0), runEnd - span);
  return { start, end: start + span };
}

/** Zoomed by `factor` (below 1 zooms in) around `at`, which stays where it is on screen. */
export function zoomWindow(window: Window, factor: number, at: Ticks): Window {
  const span = window.end - window.start;
  const ratio = span === 0 ? 1 / 2 : (at - window.start) / span;
  const start = at - span * factor * ratio;
  return { start, end: start + span * factor };
}

/** The window moved so `time` is in it: unchanged when it already is, centred on it when not. */
export function windowShowing(window: Window, time: Ticks): Window {
  if (time >= window.start && time <= window.end) return window;
  const half = (window.end - window.start) / 2;
  return { start: time - half, end: time + half };
}

/** Where zooming in or out from the toolbar centres: the cursor when it is on screen, else the middle. */
export function zoomCentre(setup: ViewSetup): Ticks {
  const { window, cursor } = setup;
  return cursor >= window.start && cursor <= window.end ? cursor : (window.start + window.end) / 2;
}

function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(item)) next.add(item);
  return next;
}

/** A signal shown at the end of the list, or taken off it. */
export function toggleShown(setup: ViewSetup, path: SignalPath): ViewSetup {
  const { shown } = setup.list;
  const next = shown.includes(path) ? shown.filter((p) => p !== path) : [...shown, path];
  return { ...setup, list: { ...setup.list, shown: next } };
}

export const toggleOpen = (setup: ViewSetup, path: string): ViewSetup => ({ ...setup, list: { ...setup.list, open: toggled(setup.list.open, path) } });

export const toggleExpanded = (setup: ViewSetup, path: SignalPath): ViewSetup => ({
  ...setup,
  list: { ...setup.list, expanded: toggled(setup.list.expanded, path) },
});

export const withShowAs = (setup: ViewSetup, path: SignalPath, showAs: ShowAs): ViewSetup => ({
  ...setup,
  showAs: new Map(setup.showAs).set(path, showAs),
});
