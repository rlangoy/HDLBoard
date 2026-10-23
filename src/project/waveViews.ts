// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `waveViews` field of a project file (docs/imp_wave_rearange.md § 11): for each
 * testbench, the signals its waveform view shows, in their order, with their "Show as"
 * and whether a vector's bits are unfolded, and the signals not shown that keep a
 * "Show as" or an unfolded vector. Reading is forgiving – the view is a
 * convenience, so a broken entry is left out with a warning and never stops a project
 * from opening. Whether a signal still exists is decided later, by the waveform view.
 * Plain TypeScript, like the rest of `src/project/`.
 */

import { isObject } from './jsonValue';
import type { Diagnostic, SavedWaveSignal, SavedWaveView, SavedWaveViews } from './types';

const FIELD = 'waveViews';

/** One signal as written in the file, or undefined when it is not usable. */
function parseSignal(raw: unknown): SavedWaveSignal | undefined {
  if (!isObject(raw) || typeof raw.path !== 'string' || raw.path === '') return undefined;
  return {
    path: raw.path,
    ...(typeof raw.showAs === 'string' ? { showAs: raw.showAs } : {}),
    ...(raw.expanded === true ? { expanded: true } : {}),
  };
}

/** The usable signals of a list; true in `broken` when some were left out. */
function parseSignals(raw: readonly unknown[]): { signals: SavedWaveSignal[]; broken: boolean } {
  const signals = raw.map(parseSignal).filter((signal): signal is SavedWaveSignal => signal !== undefined);
  return { signals, broken: signals.length < raw.length };
}

function parseView(testbench: string, raw: unknown, warnings: Diagnostic[]): SavedWaveView | undefined {
  if (!isObject(raw) || !Array.isArray(raw.signals)) {
    warnings.push({ severity: 'warning', message: `The saved waveform view of "${testbench}" is not usable and was left out` });
    return undefined;
  }
  const shown = parseSignals(raw.signals);
  const notShown = Array.isArray(raw.notShown) ? parseSignals(raw.notShown) : { signals: [], broken: raw.notShown !== undefined };
  if (shown.broken || notShown.broken) {
    warnings.push({ severity: 'warning', message: `Some signals of the saved waveform view of "${testbench}" are not usable and were left out` });
  }
  return { signals: shown.signals, ...(notShown.signals.length > 0 ? { notShown: notShown.signals } : {}) };
}

/** The saved waveform views of a project file, or undefined when it has none (or none usable). */
export function parseWaveViews(raw: unknown, warnings: Diagnostic[]): SavedWaveViews | undefined {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) {
    warnings.push({ severity: 'warning', message: `"${FIELD}" is not an object and was left out` });
    return undefined;
  }
  const views = Object.entries(raw).flatMap(([testbench, view]) => {
    const parsed = parseView(testbench, view, warnings);
    return parsed === undefined ? [] : [[testbench, parsed] as const];
  });
  return views.length > 0 ? Object.fromEntries(views) : undefined;
}

/**
 * The view saved for `testbench`. Only the views' own entries count: a testbench named
 * `constructor` or `toString` (legal in VHDL and Verilog) must not find a built-in.
 */
export function waveViewOf(views: SavedWaveViews | undefined, testbench: string): SavedWaveView | undefined {
  return views !== undefined && Object.prototype.hasOwnProperty.call(views, testbench) ? views[testbench] : undefined;
}

const serializableSignal = ({ path, showAs, expanded }: SavedWaveSignal): SavedWaveSignal => ({
  path,
  ...(showAs !== undefined ? { showAs } : {}),
  ...(expanded === true ? { expanded } : {}),
});

const serializableView = ({ signals, notShown }: SavedWaveView): SavedWaveView => ({
  signals: signals.map(serializableSignal),
  ...(notShown !== undefined && notShown.length > 0 ? { notShown: notShown.map(serializableSignal) } : {}),
});

/** The views as they are written: fields in a fixed order, so an unchanged view saves as the same text. */
export function serializableWaveViews(views: SavedWaveViews): SavedWaveViews {
  return Object.fromEntries(Object.entries(views).map(([testbench, view]) => [testbench, serializableView(view)]));
}

/** Whether two views would be saved as the same text. */
export function sameWaveView(a: SavedWaveView | undefined, b: SavedWaveView | undefined): boolean {
  const text = (view: SavedWaveView | undefined) => (view === undefined ? '' : JSON.stringify(serializableView(view)));
  return text(a) === text(b);
}

/**
 * The views with `testbench`'s replaced by `view`. A view showing nothing is not kept: it
 * would open as the first view anyway. The same object comes back when nothing changes.
 */
export function withWaveViewOf(views: SavedWaveViews | undefined, testbench: string, view: SavedWaveView): SavedWaveViews | undefined {
  if (sameWaveView(waveViewOf(views, testbench), view.signals.length > 0 ? view : undefined)) return views;
  const { [testbench]: _replaced, ...others } = views ?? {};
  const next = view.signals.length > 0 ? { ...views, [testbench]: view } : others;
  return Object.keys(next).length > 0 ? next : undefined;
}
