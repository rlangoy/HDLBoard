// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The messages between `useWaveform` and `waveWorker` (docs/waveform_viewer_spec.md § 8.4). Types only. */

import type { RunWaveStatus, WaveFormat, WaveformData } from './model';

export type WorkerRequest =
  | { readonly type: 'begin'; readonly run: number; readonly format: WaveFormat; readonly status: RunWaveStatus }
  | { readonly type: 'chunk'; readonly run: number; readonly chunk: ArrayBuffer }
  | { readonly type: 'end'; readonly run: number }
  | { readonly type: 'abort' };

export type WorkerReply =
  | { readonly type: 'done'; readonly run: number; readonly data: WaveformData }
  | { readonly type: 'error'; readonly run: number; readonly message: string };
