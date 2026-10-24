// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform side of the Workbench (docs/waveform_viewer_spec.md § 8.1, § 8.7): the
 * life cycle of `waveState.ts`, the worker (`useWaveWorker`), the transfers
 * (`useWaveTransfers`) and the two settings kept in this browser. A waveform is fetched
 * only while the view is open (W5).
 */

import { useCallback, useReducer, useRef, useState } from 'react';
import type { WaveClientHandlers } from '../workbench/hdlClient';
import type { WaveformData } from './model';
import { useWaveTransfers } from './useWaveTransfers';
import { useWaveWorker } from './useWaveWorker';
import { withVerilogMemories } from './verilogMemories';
import { verilogModulesIn } from './verilogModules';
import { withVerilogStateNames } from './verilogStates';
import { loadRecordWaves, loadWaveOpenedOnce, saveRecordWaves, saveWaveOpenedOnce } from './wavePrefs';
import { INITIAL_WAVE_STATE, waveReducer, type WaveState } from './waveState';

/** The run's sources and name, as the viewer needs them after the run. */
export interface RunInfo {
  /** The contents of the files the run sent: Verilog memories and state names are found in them. */
  readonly sources: readonly string[];
  /** The testbench's file name, for the downloaded waveform's name. */
  readonly topFileName: string | undefined;
}

export interface Waveform {
  readonly state: WaveState;
  /** Waveforms are recorded for testbench runs (FR-1). */
  readonly recording: boolean;
  setRecording(on: boolean): void;
  /** The student has opened a waveform in this browser before (FR-25). */
  readonly openedOnce: boolean;
  /** The handlers `HdlClient` calls with the `WAVE-*` frames. */
  readonly handlers: WaveClientHandlers;
  runStarted(info: RunInfo): void;
  boardRunSeen(): void;
  runEnded(): void;
  open(): void;
  close(): void;
  download(): void;
  /** Forgets the waveform altogether: another project was opened. */
  reset(): void;
}

function usePrefs() {
  const [recording, setRecordingState] = useState(loadRecordWaves);
  const [openedOnce, setOpenedOnce] = useState(loadWaveOpenedOnce);
  const setRecording = useCallback((on: boolean) => {
    setRecordingState(on);
    saveRecordWaves(on);
  }, []);
  const markOpened = useCallback(() => {
    if (!loadWaveOpenedOnce()) saveWaveOpenedOnce();
    setOpenedOnce(true);
  }, []);
  return { recording, setRecording, openedOnce, markOpened };
}

/** What the file leaves out and the sources say: Verilog memories, and state names. The modules are found once for both. */
function withSourceDetails(data: WaveformData, sources: readonly string[]): WaveformData {
  const modules = verilogModulesIn(sources);
  return withVerilogStateNames(withVerilogMemories(data, modules), modules);
}

/** `waveGet`: sends `WAVE-GET`; the client is created by the Workbench. */
export function useWaveform(waveGet: (run: number) => void): Waveform {
  const [state, dispatch] = useReducer(waveReducer, INITIAL_WAVE_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const runInfo = useRef<RunInfo>({ sources: [], topFileName: undefined });
  const complete = useCallback((data: WaveformData) => withSourceDetails(data, runInfo.current.sources), []);
  const worker = useWaveWorker({ dispatch, stateRef, complete });
  const fileName = useCallback(() => runInfo.current.topFileName, []);
  const transfers = useWaveTransfers({ state, stateRef, dispatch, worker, waveGet, fileName });
  const prefs = usePrefs();
  const { cancel } = transfers;
  const { markOpened } = prefs;
  return {
    state,
    ...prefs,
    handlers: transfers.handlers,
    download: transfers.download,
    runStarted: useCallback(
      (info: RunInfo) => {
        runInfo.current = info;
        cancel();
        dispatch({ type: 'run-started' });
      },
      [cancel],
    ),
    boardRunSeen: useCallback(() => dispatch({ type: 'board-run' }), []),
    runEnded: useCallback(() => dispatch({ type: 'run-ended' }), []),
    open: useCallback(() => {
      dispatch({ type: 'open' });
      markOpened();
    }, [markOpened]),
    close: useCallback(() => dispatch({ type: 'close' }), []),
    reset: useCallback(() => {
      cancel();
      dispatch({ type: 'reset' });
    }, [cancel]),
  };
}
