// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The one-step Undo of a board change (docs/board_io_config_spec.md § 3.3, D8). It
 * restores everything, or nothing, and only while nothing has changed since: file
 * state is immutable, and every edit, add, delete or rename makes a new array, so the
 * same array means exactly "nothing changed". Another project opened since – even one
 * with the same files and board, such as Close project – ends it too. After that,
 * choosing the previous board again is the way back – it renames with the same checks.
 */

import type { PortRename } from './boardPorts';

/** `Files`: the files array type; compared by identity, never by content. */
export interface BoardChangeState<Files> {
  readonly files: Files;
  readonly board: string;
  /** Which project is open: changes whenever another project replaces it. */
  readonly project: string;
}

export interface BoardChangeRecord<Files> {
  readonly before: BoardChangeState<Files>;
  readonly after: BoardChangeState<Files>;
  /** The renames the change made; Undo reverses them in the saved waveform views. */
  readonly renames: readonly PortRename[];
}

/** Undo is possible only in the same project, while the files and the board are exactly as the change left them. */
export function canUndo<Files>(record: BoardChangeRecord<Files>, current: BoardChangeState<Files>): boolean {
  const { after } = record;
  return current.project === after.project && current.files === after.files && current.board === after.board;
}

/**
 * The renames that take the names back. The waveform views are renamed back rather than
 * restored, so a view the student changed after the board change keeps those changes.
 */
export function undoneRenames(renames: readonly PortRename[]): PortRename[] {
  return renames.map(({ from, to }) => ({ from: to, to: from }));
}
