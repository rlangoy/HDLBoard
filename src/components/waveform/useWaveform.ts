// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform side of the Workbench (docs/waveform_viewer_spec.md § 8.1, § 8.7): the
 * `WAVE-*` frames from `hdlClient`, the worker that parses a transfer, and the life cycle
 * of `waveState.ts`. A waveform is fetched only while the view is open (W5); Download
 * fetches it once more and saves the file instead of parsing it, so no copy of the raw
 * file is kept in the page (NFR-3).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { downloadBlob } from '../workbench/download';
import type { WaveClientHandlers, WaveReady } from '../workbench/hdlClient';
import type { WaveformData } from './model';
import { withVerilogMemories } from './verilogMemories';
import { loadRecordWaves, loadWaveOpenedOnce, saveRecordWaves, saveWaveOpenedOnce } from './wavePrefs';
import { INITIAL_WAVE_STATE, needsFetch, waveReducer, type WaveState } from './waveState';
import type { WorkerReply, WorkerRequest } from './workerMessages';

/** The run's sources and name, as the viewer needs them after the run. */
export interface RunInfo {
  /** The contents of the files the run sent: Verilog memories are found in them. */
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
}

/** Turns the downloaded transfer into a file named after the testbench (FR-20). */
async function saveTransfer(chunks: readonly ArrayBuffer[], ready: WaveReady, topFileName: string | undefined): Promise<void> {
  const compressed = new Blob(chunks.map((c) => new Uint8Array(c)));
  const plain = compressed.stream().pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const blob = await new Response(plain).blob();
  const base = topFileName?.replace(/\.[^.]+$/, '') || 'waveform';
  downloadBlob(blob, `${base}.${ready.format}`);
}

function createWorker(): Worker {
  return new Worker(new URL('./waveWorker.ts', import.meta.url), { type: 'module' });
}

/** `waveGet`: sends `WAVE-GET`; the client is created by the Workbench. */
export function useWaveform(waveGet: (run: number) => void): Waveform {
  const [state, dispatch] = useReducer(waveReducer, INITIAL_WAVE_STATE);
  const [recording, setRecordingState] = useState(loadRecordWaves);
  const [openedOnce, setOpenedOnce] = useState(loadWaveOpenedOnce);
  const stateRef = useRef(state);
  stateRef.current = state;
  const runInfo = useRef<RunInfo>({ sources: [], topFileName: undefined });
  const workerRef = useRef<Worker | null>(null);
  const waveGetRef = useRef(waveGet);
  waveGetRef.current = waveGet;
  /** What the transfer under way is for: the view, or a download of the file. */
  const purpose = useRef<{ run: number; kind: 'view' | 'download'; chunks: ArrayBuffer[] } | null>(null);
  const downloadPending = useRef<number | null>(null);

  const worker = useCallback((): Worker => {
    if (workerRef.current === null) {
      const created = createWorker();
      created.onmessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        if (reply.type === 'error') {
          dispatch({ type: 'failed', run: reply.run, message: reply.message });
          return;
        }
        const { sources } = runInfo.current;
        const data: WaveformData = withVerilogMemories(reply.data, sources);
        dispatch({ type: 'parsed', run: reply.run, data });
      };
      created.onerror = () => {
        const run = stateRef.current.loading;
        if (run !== null) dispatch({ type: 'failed', run, message: 'The waveform viewer could not start in this browser.' });
      };
      workerRef.current = created;
    }
    return workerRef.current;
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const post = useCallback((message: WorkerRequest, transfer: Transferable[] = []) => worker().postMessage(message, transfer), [worker]);

  // The open view shows the newest waveform: fetch it when it is not there yet (§ 8.7).
  const fetchRun = needsFetch(state);
  useEffect(() => {
    if (fetchRun === null || purpose.current !== null) return;
    dispatch({ type: 'fetching', run: fetchRun });
    purpose.current = { run: fetchRun, kind: 'view', chunks: [] };
    waveGetRef.current(fetchRun);
  }, [fetchRun]);

  const handlers = useMemo<WaveClientHandlers>(
    () => ({
      onReady: (ready) => dispatch({ type: 'ready', ready }),
      onBegin: (run) => {
        const transfer = purpose.current;
        if (transfer?.run !== run) return;
        const ready = stateRef.current.ready;
        if (transfer.kind === 'view' && ready?.run === run) post({ type: 'begin', run, format: ready.format, status: ready.status });
      },
      onChunk: (chunk) => {
        const transfer = purpose.current;
        if (transfer === null) return;
        if (transfer.kind === 'download') transfer.chunks.push(chunk);
        else post({ type: 'chunk', run: transfer.run, chunk }, [chunk]);
      },
      onEnd: (run) => {
        const transfer = purpose.current;
        if (transfer?.run !== run) return;
        purpose.current = null;
        const ready = stateRef.current.ready;
        if (transfer.kind === 'view') post({ type: 'end', run });
        else if (ready?.run === run) void saveTransfer(transfer.chunks, ready, runInfo.current.topFileName);
      },
      onNone: (run) => {
        if (purpose.current?.run === run) {
          if (purpose.current.kind === 'view') post({ type: 'abort' });
          purpose.current = null;
        }
        dispatch({ type: 'none', run });
      },
    }),
    [post],
  );

  // A download asked for while another transfer runs waits for it.
  useEffect(() => {
    const run = downloadPending.current;
    if (run === null || purpose.current !== null || state.loading !== null) return;
    downloadPending.current = null;
    purpose.current = { run, kind: 'download', chunks: [] };
    waveGetRef.current(run);
  });

  const setRecording = useCallback((on: boolean) => {
    setRecordingState(on);
    saveRecordWaves(on);
  }, []);

  const runStarted = useCallback((info: RunInfo) => {
    runInfo.current = info;
    purpose.current = null;
    downloadPending.current = null;
    workerRef.current?.postMessage({ type: 'abort' } satisfies WorkerRequest);
    dispatch({ type: 'run-started' });
  }, []);

  const open = useCallback(() => {
    dispatch({ type: 'open' });
    if (!loadWaveOpenedOnce()) saveWaveOpenedOnce();
    setOpenedOnce(true);
  }, []);

  const download = useCallback(() => {
    const run = stateRef.current.ready?.run;
    if (run === undefined) return;
    downloadPending.current = run;
    // Starts at once when nothing else is being transferred.
    if (purpose.current === null && stateRef.current.loading === null) {
      downloadPending.current = null;
      purpose.current = { run, kind: 'download', chunks: [] };
      waveGetRef.current(run);
    }
  }, []);

  return {
    state,
    recording,
    setRecording,
    openedOnce,
    handlers,
    runStarted,
    boardRunSeen: useCallback(() => dispatch({ type: 'board-run' }), []),
    runEnded: useCallback(() => dispatch({ type: 'run-ended' }), []),
    open,
    close: useCallback(() => dispatch({ type: 'close' }), []),
    download,
  };
}
