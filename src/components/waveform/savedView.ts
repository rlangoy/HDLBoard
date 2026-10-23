// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform view as it is saved in the project file (docs/imp_wave_rearange.md § 11),
 * and back: the shown signals in their order, the vectors unfolded into bits, and the
 * "Show as" the student chose. In the file a signal is named below its testbench
 * (`dut/count`), so the file reads well; in the view it has its full path
 * (`counter_tb/dut/count`). The time window and the cursor belong to one run and are
 * not saved. Pure.
 */

import type { SavedWaveSignal, SavedWaveView } from '../../project/types';
import { isShowAs } from './radix';
import type { SignalPath } from './signalRows';
import type { ViewLayout, ViewSetup } from './viewSetup';

const SEPARATOR = '/';

const inFile = (testbench: string, path: SignalPath): string => path.slice(testbench.length + SEPARATOR.length);
const inView = (testbench: string, path: string): SignalPath => `${testbench}${SEPARATOR}${path}`;

/** One shown signal as it is saved: "Show as" only when chosen, `expanded` only when unfolded. */
function savedSignal(testbench: string, setup: ViewSetup, path: SignalPath): SavedWaveSignal {
  const showAs = setup.showAs.get(path);
  return {
    path: inFile(testbench, path),
    ...(showAs !== undefined ? { showAs } : {}),
    ...(setup.list.expanded.has(path) ? { expanded: true } : {}),
  };
}

/** What of `setup` is saved for `testbench`: its own shown signals, in their order. */
export function savedViewOf(testbench: string, setup: ViewSetup): SavedWaveView {
  const own = setup.list.shown.filter((path) => path.startsWith(`${testbench}${SEPARATOR}`));
  return { signals: own.map((path) => savedSignal(testbench, setup, path)) };
}

/** A saved view as the layout the view starts from; a "Show as" this version does not know is left out. */
export function layoutOf(testbench: string, saved: SavedWaveView): ViewLayout {
  const signals = saved.signals.map((signal) => ({ ...signal, path: inView(testbench, signal.path) }));
  return {
    shown: signals.map((signal) => signal.path),
    expanded: signals.filter((signal) => signal.expanded === true).map((signal) => signal.path),
    showAs: signals.flatMap(({ path, showAs }) => (showAs !== undefined && isShowAs(showAs) ? [[path, showAs] as const] : [])),
  };
}
