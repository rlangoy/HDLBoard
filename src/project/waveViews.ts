// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `waveViews` field of a project file (docs/imp_wave_rearange.md § 11): for each
 * testbench, the signals its waveform view shows, in their order, with their "Show as"
 * and whether a vector's bits are unfolded. Reading is forgiving – the view is a
 * convenience, so a broken entry is left out with a warning and never stops a project
 * from opening. Whether a signal still exists is decided later, by the waveform view.
 * Plain TypeScript, like the rest of `src/project/`.
 */

import type { Diagnostic, SavedWaveSignal, SavedWaveView, SavedWaveViews } from './types';

const FIELD = 'waveViews';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One signal as written in the file, or undefined when it is not usable. */
function parseSignal(raw: unknown): SavedWaveSignal | undefined {
  if (!isObject(raw) || typeof raw.path !== 'string' || raw.path === '') return undefined;
  return {
    path: raw.path,
    ...(typeof raw.showAs === 'string' ? { showAs: raw.showAs } : {}),
    ...(raw.expanded === true ? { expanded: true } : {}),
  };
}

function parseView(testbench: string, raw: unknown, warnings: Diagnostic[]): SavedWaveView | undefined {
  if (!isObject(raw) || !Array.isArray(raw.signals)) {
    warnings.push({ severity: 'warning', message: `The saved waveform view of "${testbench}" is not usable and was left out` });
    return undefined;
  }
  const signals = raw.signals.map(parseSignal).filter((signal): signal is SavedWaveSignal => signal !== undefined);
  if (signals.length < raw.signals.length) {
    warnings.push({ severity: 'warning', message: `Some signals of the saved waveform view of "${testbench}" are not usable and were left out` });
  }
  return { signals };
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

/** The views as they are written: fields in a fixed order, so an unchanged view saves as the same text. */
export function serializableWaveViews(views: SavedWaveViews): SavedWaveViews {
  const signal = ({ path, showAs, expanded }: SavedWaveSignal): SavedWaveSignal => ({
    path,
    ...(showAs !== undefined ? { showAs } : {}),
    ...(expanded === true ? { expanded } : {}),
  });
  return Object.fromEntries(Object.entries(views).map(([testbench, view]) => [testbench, { signals: view.signals.map(signal) }]));
}

/** Whether two views would be saved as the same text. */
export function sameWaveView(a: SavedWaveView | undefined, b: SavedWaveView | undefined): boolean {
  const text = (view: SavedWaveView | undefined) => (view === undefined ? '' : JSON.stringify(serializableWaveViews({ view }).view));
  return text(a) === text(b);
}

/**
 * The views with `testbench`'s replaced by `view`. A view showing nothing is not kept: it
 * would open as the first view anyway. The same object comes back when nothing changes.
 */
export function withWaveViewOf(views: SavedWaveViews | undefined, testbench: string, view: SavedWaveView): SavedWaveViews | undefined {
  if (sameWaveView(views?.[testbench], view.signals.length > 0 ? view : undefined)) return views;
  const { [testbench]: _replaced, ...others } = views ?? {};
  const next = view.signals.length > 0 ? { ...views, [testbench]: view } : others;
  return Object.keys(next).length > 0 ? next : undefined;
}
