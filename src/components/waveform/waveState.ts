// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform's life cycle in the browser (docs/waveform_viewer_spec.md § 8.7, W10):
 * a waveform belongs to one run; a new run marks the shown one stale at once, and only
 * the newest run's waveform is ever fetched and shown. A reducer, so every transition is
 * a pure, tested function; `useWaveform` wires it to the socket and the worker.
 */

import type { WaveReady } from '../workbench/hdlClient';
import type { WaveformData } from './model';

export interface WaveState {
  /** The newest run's offered waveform (`WAVE-READY`), or null. */
  readonly ready: WaveReady | null;
  /** The waveform shown, and the run it belongs to. */
  readonly data: WaveformData | null;
  readonly dataRun: number | null;
  /** The run being fetched and parsed. */
  readonly loading: number | null;
  /** Why the newest waveform could not be shown. */
  readonly error: string | null;
  /** A run has started since the shown waveform's: it is dimmed (§ 8.7). */
  readonly stale: boolean;
  /** The last run was a board run, which records nothing (W1). */
  readonly boardRun: boolean;
  /** The last run ended without a waveform: the stale one stays, with this note. */
  readonly noWaveNote: string | null;
  /** The view is open in place of the split view (W8). */
  readonly open: boolean;
  /** A waveform is ready that the student has not opened yet: the button's dot (S2). */
  readonly unseen: boolean;
}

export const INITIAL_WAVE_STATE: WaveState = {
  ready: null,
  data: null,
  dataRun: null,
  loading: null,
  error: null,
  stale: false,
  boardRun: false,
  noWaveNote: null,
  open: false,
  unseen: false,
};

export type WaveEvent =
  | { readonly type: 'run-started' }
  | { readonly type: 'board-run' }
  | { readonly type: 'ready'; readonly ready: WaveReady }
  | { readonly type: 'run-ended' }
  | { readonly type: 'fetching'; readonly run: number }
  | { readonly type: 'parsed'; readonly run: number; readonly data: WaveformData }
  | { readonly type: 'failed'; readonly run: number; readonly message: string }
  | { readonly type: 'none'; readonly run: number }
  | { readonly type: 'open' }
  | { readonly type: 'close' };

const NO_WAVE_NOTE = 'The last run did not record a waveform – it ended before the simulation started. This is the run before it.';
const GONE_NOTE = 'This waveform is no longer available. Run the testbench again.';

export function waveReducer(state: WaveState, event: WaveEvent): WaveState {
  switch (event.type) {
    case 'run-started':
      // The old waveform stays, dimmed, until the new one arrives, so the layout does not jump.
      return { ...state, ready: null, loading: null, error: null, noWaveNote: null, boardRun: false, stale: state.data !== null };
    case 'board-run':
      return { ...state, boardRun: true, open: false };
    case 'ready':
      return { ...state, ready: event.ready, unseen: !state.open, error: null, noWaveNote: null };
    case 'run-ended':
      return state.ready === null && !state.boardRun && state.data !== null ? { ...state, noWaveNote: NO_WAVE_NOTE } : state;
    case 'fetching':
      return { ...state, loading: event.run, error: null };
    case 'parsed':
      if (event.run !== state.ready?.run) return state; // a stopped or replaced run's waveform is never shown (W10)
      return { ...state, data: event.data, dataRun: event.run, loading: null, stale: false };
    case 'failed':
      if (event.run !== state.ready?.run) return state;
      return { ...state, loading: null, error: event.message };
    case 'none':
      if (event.run !== state.loading) return state;
      return { ...state, loading: null, error: GONE_NOTE };
    case 'open':
      return { ...state, open: true, unseen: false };
    case 'close':
      return { ...state, open: false };
  }
}

/** Whether the newest waveform must be fetched now: the view is open and does not show it yet. */
export function needsFetch(state: WaveState): number | null {
  const run = state.ready?.run;
  if (!state.open || run === undefined || state.dataRun === run || state.loading === run || state.error !== null) return null;
  return run;
}

export type ButtonState = 'disabled' | 'new' | 'enabled' | 'pressed';

/** The Waveform button's state (§ 8.6). */
export function buttonState(state: WaveState): ButtonState {
  if (state.open) return 'pressed';
  if (state.boardRun || (state.ready === null && state.data === null)) return 'disabled';
  return state.unseen ? 'new' : 'enabled';
}

export const BUTTON_TOOLTIP: Readonly<Record<ButtonState, string>> = {
  disabled: 'Run a testbench to see its waveform. Board simulations do not record waveforms.',
  new: 'Show the waveform of the last testbench run',
  enabled: 'Show the waveform of the last testbench run',
  pressed: 'Close the waveform and show the code',
};
