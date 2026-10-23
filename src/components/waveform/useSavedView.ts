// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The view saved with the project (docs/imp_wave_rearange.md § 11): read when a
 * waveform arrives, written when the student changes which signals are shown, their
 * order, "Show as" or an unfolded vector. Only what the student does is written: the
 * first view, a remembered one, zooming and moving the cursor never make the project
 * read as changed.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { SavedWaveView } from '../../project/types';
import type { WaveformData } from './model';
import { layoutOf, savedViewOf } from './savedView';
import { testbenchScope } from './signalRows';
import type { ViewLayout, ViewSetup } from './viewSetup';

/** Where the project keeps its waveform views, by testbench name (the Workbench gives it). */
export interface SavedViews {
  of(testbench: string): SavedWaveView | undefined;
  save(testbench: string, view: SavedWaveView): void;
}

/** The view saved for this waveform's testbench, as the layout the view starts from. */
export function savedLayoutFor(data: WaveformData, saved: SavedViews): ViewLayout | undefined {
  const testbench = testbenchScope(data)?.name;
  const view = testbench === undefined ? undefined : saved.of(testbench);
  return testbench === undefined || view === undefined ? undefined : layoutOf(testbench, view);
}

/**
 * Saves the view after the student has changed its signals. `changed` is called by
 * every such action, before the change; the setup it leads to is saved once it is there.
 */
export function useSavedView(data: WaveformData | null, setup: ViewSetup | null, saved: SavedViews): { readonly changed: () => void } {
  const pending = useRef(false);
  useEffect(() => {
    const testbench = data === null ? undefined : testbenchScope(data)?.name;
    if (!pending.current || setup === null || testbench === undefined) return;
    pending.current = false;
    saved.save(testbench, savedViewOf(testbench, setup));
  }, [data, setup, saved]);
  const changed = useCallback(() => {
    pending.current = true;
  }, []);
  return { changed };
}
