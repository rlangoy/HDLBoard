// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform transfers (docs/waveform_viewer_spec.md § 7.4, W5): the open view
 * fetches the newest run's waveform and hands it to the worker; Download fetches it once
 * more and saves the file instead, so no copy of the raw file is kept in the page
 * (NFR-3). One transfer at a time; a download asked for during another waits for it.
 */

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject } from 'react';
import { downloadBlob } from '../workbench/download';
import type { WaveClientHandlers, WaveReady } from '../workbench/hdlClient';
import type { WaveWorker } from './useWaveWorker';
import { needsFetch, type WaveEvent, type WaveState } from './waveState';

/** What the transfer under way is for: the view, or a download of the file. */
interface Transfer {
  readonly run: number;
  readonly kind: 'view' | 'download';
  readonly chunks: ArrayBuffer[];
}

export interface TransferInput {
  readonly state: WaveState;
  readonly stateRef: MutableRefObject<WaveState>;
  readonly dispatch: Dispatch<WaveEvent>;
  readonly worker: WaveWorker;
  /** Sends `WAVE-GET`. */
  readonly waveGet: (run: number) => void;
  /** The testbench's file name, for the downloaded file's name. */
  readonly fileName: () => string | undefined;
}

export interface WaveTransfers {
  readonly handlers: WaveClientHandlers;
  download(): void;
  /** Forgets any transfer under way: a new run, or a new project. */
  cancel(): void;
}

/** Turns the downloaded transfer into a file named after the testbench (FR-20). */
async function saveTransfer(chunks: readonly ArrayBuffer[], ready: WaveReady, fileName: string | undefined): Promise<void> {
  const compressed = new Blob(chunks.map((c) => new Uint8Array(c)));
  const plain = compressed.stream().pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const blob = await new Response(plain).blob();
  const base = fileName?.replace(/\.[^.]+$/, '') || 'waveform';
  downloadBlob(blob, `${base}.${ready.format}`);
}

function useHandlers(input: TransferInput, current: MutableRefObject<Transfer | null>): WaveClientHandlers {
  const { dispatch, stateRef, worker, fileName } = input;
  return useMemo<WaveClientHandlers>(() => {
    const finishView = (run: number) => worker.post({ type: 'end', run });
    const finishDownload = (transfer: Transfer) => {
      const ready = stateRef.current.ready;
      if (ready?.run === transfer.run) void saveTransfer(transfer.chunks, ready, fileName());
    };
    return {
      onReady: (ready) => dispatch({ type: 'ready', ready }),
      onBegin: (run) => {
        const ready = stateRef.current.ready;
        if (current.current?.run === run && current.current.kind === 'view' && ready?.run === run) {
          worker.post({ type: 'begin', run, format: ready.format, status: ready.status });
        }
      },
      onChunk: (chunk) => {
        const transfer = current.current;
        if (transfer?.kind === 'download') transfer.chunks.push(chunk);
        else if (transfer?.kind === 'view') worker.post({ type: 'chunk', run: transfer.run, chunk }, [chunk]);
      },
      onEnd: (run) => {
        const transfer = current.current;
        if (transfer?.run !== run) return;
        current.current = null;
        if (transfer.kind === 'view') finishView(run);
        else finishDownload(transfer);
      },
      onNone: (run) => {
        if (current.current?.run === run && current.current.kind === 'view') worker.abort();
        if (current.current?.run === run) current.current = null;
        dispatch({ type: 'none', run });
      },
    };
  }, [dispatch, stateRef, worker, fileName, current]);
}

export function useWaveTransfers(input: TransferInput): WaveTransfers {
  const { state, stateRef, dispatch, worker } = input;
  const current = useRef<Transfer | null>(null);
  const pendingDownload = useRef<number | null>(null);
  const waveGet = useRef(input.waveGet);
  waveGet.current = input.waveGet;

  const start = useCallback((run: number, kind: Transfer['kind']) => {
    current.current = { run, kind, chunks: [] };
    waveGet.current(run);
  }, []);

  // The open view shows the newest waveform: fetch it when it is not there yet (§ 8.7).
  const fetchRun = needsFetch(state);
  useEffect(() => {
    if (fetchRun === null || current.current !== null) return;
    dispatch({ type: 'fetching', run: fetchRun });
    start(fetchRun, 'view');
  }, [fetchRun, dispatch, start]);

  // A download asked for while another transfer ran starts once that one is done.
  useEffect(() => {
    const run = pendingDownload.current;
    if (run === null || current.current !== null || state.loading !== null) return;
    pendingDownload.current = null;
    start(run, 'download');
  });

  const download = useCallback(() => {
    const run = stateRef.current.ready?.run;
    if (run === undefined) return;
    if (current.current === null && stateRef.current.loading === null) start(run, 'download');
    else pendingDownload.current = run;
  }, [stateRef, start]);

  const cancel = useCallback(() => {
    current.current = null;
    pendingDownload.current = null;
    worker.abort();
  }, [worker]);

  return { handlers: useHandlers(input, current), download, cancel };
}
