// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { WaveformData } from './model';
import { buttonState, INITIAL_WAVE_STATE, needsFetch, waveReducer, type WaveEvent, type WaveState } from './waveState';

const DATA = { endTime: 1 } as unknown as WaveformData;
const ready = (run: number): WaveEvent => ({ type: 'ready', ready: { run, format: 'ghw', bytes: 10, status: 'complete' } });
const play = (...events: WaveEvent[]): WaveState => events.reduce(waveReducer, INITIAL_WAVE_STATE);

describe('the waveform life cycle', () => {
  test('before any testbench run there is nothing to show', () => {
    expect(buttonState(INITIAL_WAVE_STATE)).toBe('empty');
  });

  test('a ready waveform is highlighted, and fetched only once the view opens (W5)', () => {
    const offered = play({ type: 'run-started' }, ready(1));
    expect(buttonState(offered)).toBe('new');
    expect(needsFetch(offered)).toBeNull();
    const opened = waveReducer(offered, { type: 'open' });
    expect(needsFetch(opened)).toBe(1);
    expect(buttonState(opened)).toBe('pressed');
    const loading = waveReducer(opened, { type: 'fetching', run: 1 });
    expect(needsFetch(loading)).toBeNull();
    const shown = waveReducer(loading, { type: 'parsed', run: 1, data: DATA });
    expect(shown).toMatchObject({ data: DATA, dataRun: 1, loading: null });
    expect(needsFetch(shown)).toBeNull();
    expect(buttonState(waveReducer(shown, { type: 'close' }))).toBe('enabled');
  });

  test('with the view open, a new run’s waveform is fetched by itself', () => {
    const shown = play(ready(1), { type: 'open' }, { type: 'fetching', run: 1 }, { type: 'parsed', run: 1, data: DATA });
    const rerun = waveReducer(shown, { type: 'run-started' });
    expect(rerun.stale).toBe(true);
    expect(rerun.data).toBe(DATA);
    const next = waveReducer(rerun, ready(2));
    expect(next.unseen).toBe(false);
    expect(needsFetch(next)).toBe(2);
  });

  test('an older run’s parse result is never shown (W10)', () => {
    const state = play(ready(1), { type: 'open' }, { type: 'fetching', run: 1 }, { type: 'run-started' }, ready(2));
    expect(waveReducer(state, { type: 'parsed', run: 1, data: DATA }).data).toBeNull();
  });

  test('a board run closes the view and leaves nothing to show', () => {
    const state = play(ready(1), { type: 'open' }, { type: 'run-started' }, { type: 'board-run' });
    expect(state.open).toBe(false);
    expect(buttonState(state)).toBe('empty');
  });

  test('a run that ends without a waveform keeps the stale one, with a note', () => {
    const state = play(ready(1), { type: 'parsed', run: 1, data: DATA }, { type: 'run-started' }, { type: 'run-ended' });
    expect(state).toMatchObject({ stale: true, data: DATA });
    expect(state.noWaveNote).toMatch(/did not record/);
  });

  test('a parse error and a vanished file are one sentence each', () => {
    const failed = play(ready(1), { type: 'open' }, { type: 'fetching', run: 1 }, { type: 'failed', run: 1, message: 'damaged' });
    expect(failed.error).toBe('damaged');
    expect(needsFetch(failed)).toBeNull();
    const gone = play(ready(1), { type: 'open' }, { type: 'fetching', run: 1 }, { type: 'none', run: 1 });
    expect(gone.error).toMatch(/no longer available/);
  });

  test('another project forgets the waveform', () => {
    const state = play(ready(1), { type: 'open' }, { type: 'parsed', run: 1, data: DATA }, { type: 'reset' });
    expect(state).toEqual(INITIAL_WAVE_STATE);
  });
});
