// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The view saved with the project (docs/imp_wave_rearange.md § 11): read when a
 * waveform arrives, written when the student changes which signals are shown, their
 * order, "Show as" or an unfolded vector. Only what the student does is written: the
 * first view, a remembered one, zooming and moving the cursor never make the project
 * read as changed.
 */

import { useEffect, useRef } from 'react';
import type { SavedWaveView } from '../../project/types';
import type { WaveformData } from './model';
import { layoutOf, savedViewOf } from './savedView';
import { signalsByPath, testbenchScope } from './signalRows';
import type { ViewLayout, ViewSetup } from './viewSetup';

/** Where the project keeps its waveform views, by testbench name (the Workbench gives it). */
export interface SavedViews {
  of(testbench: string): SavedWaveView | undefined;
  /** Replaces the testbench's view with what `next` makes of the one saved now. */
  save(testbench: string, next: (previous: SavedWaveView | undefined) => SavedWaveView): void;
}

/** A view's setup, the waveform it was made for, and how many changes to its signals the student has made. */
export interface EditedView {
  readonly data: WaveformData;
  readonly setup: ViewSetup;
  /** Counts up with each change to the signals; a new waveform keeps the count. */
  readonly edits: number;
}

/** The view saved for this waveform's testbench, as the layout the view starts from. */
export function savedLayoutFor(data: WaveformData, saved: SavedViews): ViewLayout | undefined {
  const testbench = testbenchScope(data)?.name;
  const view = testbench === undefined ? undefined : saved.of(testbench);
  return testbench === undefined || view === undefined ? undefined : layoutOf(testbench, view);
}

/**
 * Saves the view after each change to its signals, for the testbench of the waveform the
 * view was made for. A view that only arrived, zoomed or moved its cursor has no new edit.
 */
export function useSavedView(view: EditedView | null, saved: SavedViews): void {
  const savedEdits = useRef(0);
  useEffect(() => {
    if (view === null || view.edits === savedEdits.current) return;
    savedEdits.current = view.edits;
    const testbench = testbenchScope(view.data)?.name;
    if (testbench === undefined) return;
    const known = signalsByPath(view.data);
    saved.save(testbench, (previous) => savedViewOf(testbench, view.setup, { known, previous }));
  }, [view, saved]);
}
