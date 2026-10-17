// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Web Worker that parses waveform transfers (docs/waveform_viewer_spec.md § 8.4):
 * made when first needed, ended with the component, and its replies turned into life
 * cycle events.
 */

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject } from 'react';
import type { WaveformData } from './model';
import type { WaveEvent, WaveState } from './waveState';
import type { WorkerReply, WorkerRequest } from './workerMessages';

const NO_WORKER_MESSAGE = 'The waveform viewer could not start in this browser.';

export interface WaveWorker {
  post(message: WorkerRequest, transfer?: Transferable[]): void;
  /** Drops the transfer the worker is parsing, if any, without making the worker. */
  abort(): void;
}

export interface WorkerInput {
  readonly dispatch: Dispatch<WaveEvent>;
  readonly stateRef: MutableRefObject<WaveState>;
  /** Applied to every parsed waveform before it is shown: adds what the sources know. */
  readonly complete: (data: WaveformData) => WaveformData;
}

function createWorker(): Worker {
  return new Worker(new URL('./waveWorker.ts', import.meta.url), { type: 'module' });
}

export function useWaveWorker({ dispatch, stateRef, complete }: WorkerInput): WaveWorker {
  const workerRef = useRef<Worker | null>(null);
  const completeRef = useRef(complete);
  completeRef.current = complete;

  const worker = useCallback((): Worker => {
    if (workerRef.current !== null) return workerRef.current;
    const created = createWorker();
    created.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === 'error') dispatch({ type: 'failed', run: reply.run, message: reply.message });
      else dispatch({ type: 'parsed', run: reply.run, data: completeRef.current(reply.data) });
    };
    created.onerror = () => {
      const run = stateRef.current.loading;
      if (run !== null) dispatch({ type: 'failed', run, message: NO_WORKER_MESSAGE });
    };
    workerRef.current = created;
    return created;
  }, [dispatch, stateRef]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const post = useCallback((message: WorkerRequest, transfer: Transferable[] = []) => worker().postMessage(message, transfer), [worker]);
  const abort = useCallback(() => workerRef.current?.postMessage({ type: 'abort' } satisfies WorkerRequest), []);
  // One object for the component's life: hooks that depend on it must not run again on every render.
  return useMemo(() => ({ post, abort }), [post, abort]);
}
