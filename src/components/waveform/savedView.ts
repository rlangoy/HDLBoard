// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform view as it is saved in the project file (docs/imp_wave_rearange.md § 11),
 * and back: the shown signals in their order, the vectors unfolded into bits, and the
 * "Show as" the student chose – also for a signal not shown, so it comes back when it is
 * ticked again. In the file a signal is named below its testbench (`dut/count`), so the
 * file reads well; in the view it has its full path (`counter_tb/dut/count`). The time
 * window and the cursor belong to one run and are not saved. Pure.
 */

import type { SavedWaveSignal, SavedWaveView } from '../../project/types';
import { isShowAs } from './radix';
import { childPath, isBelow, pathBelow, type SignalPath } from './signalRows';
import type { ViewLayout, ViewSetup } from './viewSetup';

/** One signal as it is saved: "Show as" only when chosen, `expanded` only when unfolded. */
function savedSignal(testbench: string, setup: ViewSetup, path: SignalPath): SavedWaveSignal {
  const showAs = setup.showAs.get(path);
  return {
    path: pathBelow(testbench, path),
    ...(showAs !== undefined ? { showAs } : {}),
    ...(setup.list.expanded.has(path) ? { expanded: true } : {}),
  };
}

/**
 * `signals` with those of `previous` that this run does not have, each after the signal
 * it followed before: a signal of the other language's testbench of the same name, or
 * one commented out for this run, is not lost by a save.
 */
function withAbsent(signals: readonly SavedWaveSignal[], previous: readonly SavedWaveSignal[], exists: (path: string) => boolean): SavedWaveSignal[] {
  const merged = [...signals];
  let at = 0;
  for (const signal of previous) {
    if (!exists(signal.path)) {
      merged.splice(at, 0, signal);
      at += 1;
      continue;
    }
    const index = merged.findIndex((kept) => kept.path === signal.path);
    if (index >= 0) at = index + 1;
  }
  return merged;
}

/** The testbench's signals not shown that have a "Show as" or are unfolded, by path. */
function notShownOf(testbench: string, setup: ViewSetup, known: ReadonlyMap<SignalPath, unknown>): SignalPath[] {
  const shown = new Set(setup.list.shown);
  const chosen = new Set([...setup.showAs.keys(), ...setup.list.expanded]);
  return [...chosen].filter((path) => isBelow(testbench, path) && !shown.has(path) && known.has(path)).sort();
}

/** The run a view is saved from, and the view saved before. */
export interface SaveContext {
  /** The run's signals, by path: a saved signal not among them is kept as it was. */
  readonly known: ReadonlyMap<SignalPath, unknown>;
  readonly previous?: SavedWaveView;
}

/**
 * What of `setup` is saved for `testbench`: its own shown signals in their order, and the
 * ones not shown that keep a choice. What the previous view held of signals this run does
 * not have is kept.
 */
export function savedViewOf(testbench: string, setup: ViewSetup, { known, previous }: SaveContext): SavedWaveView {
  const exists = (path: string) => known.has(childPath(testbench, path));
  const own = setup.list.shown.filter((path) => isBelow(testbench, path));
  const signals = withAbsent(own.map((path) => savedSignal(testbench, setup, path)), previous?.signals ?? [], exists);
  const chosen = notShownOf(testbench, setup, known).map((path) => savedSignal(testbench, setup, path));
  const notShown = [...chosen, ...(previous?.notShown ?? []).filter((signal) => !exists(signal.path))];
  return { signals, ...(notShown.length > 0 ? { notShown } : {}) };
}

/** A saved view as the layout the view starts from; a "Show as" this version does not know is left out. */
export function layoutOf(testbench: string, saved: SavedWaveView): ViewLayout {
  const inView = (signal: SavedWaveSignal): SavedWaveSignal => ({ ...signal, path: childPath(testbench, signal.path) });
  const shown = saved.signals.map(inView);
  const every = [...shown, ...(saved.notShown ?? []).map(inView)];
  return {
    shown: shown.map((signal) => signal.path),
    expanded: every.filter((signal) => signal.expanded === true).map((signal) => signal.path),
    showAs: every.flatMap(({ path, showAs }) => (showAs !== undefined && isShowAs(showAs) ? [[path, showAs] as const] : [])),
  };
}
