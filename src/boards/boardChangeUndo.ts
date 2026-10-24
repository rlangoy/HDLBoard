// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The one-step Undo of a board change (docs/board_io_config_spec.md § 3.3, D8). It
 * restores everything, or nothing, and only while nothing has changed since: file
 * state is immutable, and every edit, add, delete or rename makes a new array, so the
 * same array means exactly "nothing changed". After that, choosing the previous board
 * again is the way back — it renames with the same checks.
 */

import type { SavedWaveViews } from '../project/types';

export interface BoardChangeState<F> {
  readonly files: readonly F[];
  readonly board: string;
}

export interface BoardChangeRecord<F> {
  readonly before: BoardChangeState<F> & { readonly waveViews?: SavedWaveViews };
  readonly after: BoardChangeState<F>;
}

/** Undo is possible only while the files and the board are exactly as the change left them. */
export function canUndo<F>(record: BoardChangeRecord<F>, current: BoardChangeState<F>): boolean {
  return current.files === record.after.files && current.board === record.after.board;
}
