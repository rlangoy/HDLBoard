// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The view's state for one waveform (docs/waveform_viewer_spec.md § 8.6, § 8.7): the
 * first view, the student's remembered one or the one saved with the project when a
 * waveform arrives, every action the pane offers, the memory kept for the next run
 * (FR-17), and the view saved with the project after the student changes its signals
 * (docs/imp_wave_rearange.md § 11). The rules live in `viewSetup.ts`; this hook only
 * holds the state.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { RunMoments } from './initialView';
import type { Ticks, WaveformData } from './model';
import type { ShowAs } from './radix';
import type { Move } from './signalOrder';
import { listRows, type ListModel, type SignalPath } from './signalRows';
import { savedLayoutFor, useSavedView, type EditedView, type SavedViews } from './useSavedView';
import {
  clampWindow,
  setupFor,
  toggleExpanded,
  toggleOpen,
  toggleShown,
  toMemory,
  windowShowing,
  withMove,
  withShowAs,
  zoomCentre,
  zoomWindow,
  type ViewMemory,
  type ViewSetup,
  type Window,
} from './viewSetup';

/** A console link asked for this time (FR-16); `id` makes the same time twice two requests. */
export interface WaveFocus {
  readonly fs: number;
  readonly id: number;
}

export interface WaveViewInput {
  readonly data: WaveformData | null;
  readonly moments: RunMoments;
  readonly memory: MutableRefObject<ViewMemory | null>;
  readonly focus: WaveFocus | null;
  /** How many rows fit the view's height, and how much time one pixel is at the narrowest. */
  readonly fittingRows: number;
  readonly minSpan: Ticks;
  readonly end: Ticks;
  /** The views saved with the project: read for a new waveform, written when the student changes its signals. */
  readonly saved: SavedViews;
}

export interface WaveViewActions {
  toggleShown(path: SignalPath): void;
  /** A shown signal to another place in its section (docs/imp_wave_rearange.md). */
  move(move: Move): void;
  toggleOpen(path: string): void;
  toggleExpanded(path: SignalPath): void;
  setShowAs(path: SignalPath, showAs: ShowAs): void;
  setCursor(time: Ticks): void;
  /** The cursor to `time`, and the window after it when it would leave the screen. */
  showCursor(time: Ticks): void;
  setWindow(window: Window): void;
  /** By `factor` (below 1 zooms in) around `at`, or around the cursor. */
  zoom(factor: number, at?: Ticks): void;
  scroll(ticks: number): void;
  fit(): void;
}

export interface WaveView {
  readonly setup: ViewSetup | null;
  readonly list: ListModel;
  readonly actions: WaveViewActions;
}

const NO_ROWS: ListModel = { rows: [], tops: [], height: 0 };

interface FocusInput {
  readonly focus: WaveFocus | null;
  readonly data: WaveformData | null;
  /** Whether the view has its setup yet: a focus waits for it. */
  readonly ready: boolean;
}

/** Applies each console time link once: a waveform arriving later must not move the cursor back to it. */
function useFocus({ focus, data, ready }: FocusInput, apply: (time: Ticks) => void): void {
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (focus === null || data === null || !ready || applied.current === focus.id) return;
    applied.current = focus.id;
    apply(focus.fs / data.tickFs);
  }, [focus, data, apply, ready]);
}

/** A change to the setup; `edit` when it changes the signals, so it is saved with the project. */
type Update = (change: (setup: ViewSetup) => ViewSetup, edit?: boolean) => void;

function useActions(update: Update, input: WaveViewInput): WaveViewActions {
  const { minSpan, end } = input;
  return useMemo(() => {
    const setWindow = (window: Window) => update((s) => ({ ...s, window: clampWindow(window, { end, minSpan }) }));
    const updateSignals: Update = (change) => update(change, true);
    return {
      toggleShown: (path) => updateSignals((s) => toggleShown(s, path)),
      move: (move) => updateSignals((s) => withMove(s, move)),
      toggleOpen: (path) => update((s) => toggleOpen(s, path)),
      toggleExpanded: (path) => updateSignals((s) => toggleExpanded(s, path)),
      setShowAs: (path, showAs) => updateSignals((s) => withShowAs(s, path, showAs)),
      setCursor: (cursor) => update((s) => ({ ...s, cursor })),
      showCursor: (cursor) => update((s) => ({ ...s, cursor, window: windowShowing(s.window, cursor) })),
      setWindow,
      zoom: (factor, at) => update((s) => ({ ...s, window: clampWindow(zoomWindow(s.window, factor, at ?? zoomCentre(s)), { end, minSpan }) })),
      scroll: (ticks) => update((s) => ({ ...s, window: clampWindow({ start: s.window.start + ticks, end: s.window.end + ticks }, { end, minSpan }) })),
      fit: () => update((s) => ({ ...s, window: { start: 0, end } })),
    };
  }, [update, minSpan, end]);
}

export function useWaveView(input: WaveViewInput): WaveView {
  const { data, moments, memory, focus, saved } = input;
  const [view, setView] = useState<EditedView | null>(null);
  const setup = view?.setup ?? null;
  const fittingRows = useRef(input.fittingRows);
  fittingRows.current = input.fittingRows;

  // Only a new waveform starts a new setup; the console growing during a run does not.
  const momentsRef = useRef(moments);
  momentsRef.current = moments;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    if (data === null) return;
    const context = { moments: momentsRef.current, fittingRows: fittingRows.current, saved: savedLayoutFor(data, savedRef.current) };
    const next = setupFor(data, memory.current, context);
    setView((old) => ({ data, setup: next, edits: old?.edits ?? 0 }));
  }, [data, memory]);

  useEffect(() => {
    if (setup !== null) memory.current = toMemory(setup);
  }, [setup, memory]);

  // An edit counts only when there is a setup to change: one before it is never saved later.
  const update: Update = useCallback(
    (change, edit = false) =>
      setView((old) => {
        if (old === null) return old;
        const next = change(old.setup);
        return next === old.setup && !edit ? old : { ...old, setup: next, edits: old.edits + (edit ? 1 : 0) };
      }),
    [],
  );
  useSavedView(view, saved);
  const actions = useActions(update, input);
  useFocus({ focus, data, ready: setup !== null }, actions.showCursor);

  const list = useMemo(() => (data === null || setup === null ? NO_ROWS : listRows(data, setup.list)), [data, setup]);
  return { setup, list, actions };
}
