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

import type { SavedWaveViews } from '../project/types';
import type { PortRename } from './boardPorts';
import { renameWaveViews, type TestbenchLanguage } from './renamePorts';

/** `Files`: the files array type; compared by identity, never by content. */
export interface BoardChangeState<Files> {
  readonly files: Files;
  readonly board: string;
  /** The saved waveform views; compared by identity, like the files. */
  readonly waveViews: SavedWaveViews | undefined;
}

export interface BoardChangeRecord<Files> {
  /** Which project the change was made in: the key changes whenever another project replaces it. */
  readonly project: string;
  readonly before: BoardChangeState<Files>;
  readonly after: BoardChangeState<Files>;
  /** The renames the change made; Undo reverses them in views changed since. */
  readonly renames: readonly PortRename[];
}

/** What Undo compares with the record: the open project's key, files and board. */
export interface CurrentBoardState<Files> {
  readonly project: string;
  readonly files: Files;
  readonly board: string;
}

/** Undo is possible only in the same project, while the files and the board are exactly as the change left them. */
export function canUndo<Files>(record: BoardChangeRecord<Files>, current: CurrentBoardState<Files>): boolean {
  const { after } = record;
  return current.project === record.project && current.files === after.files && current.board === after.board;
}

/** The renames that take the names back. */
export function undoneRenames(renames: readonly PortRename[]): PortRename[] {
  return renames.map(({ from, to }) => ({ from: to, to: from }));
}

/**
 * The saved waveform views after Undo. Views left as the change made them are
 * restored exactly – their paths in the files' own spelling, which renaming back could
 * not know (`uut/key_n` written in lower case in a Verilog file). Views the student
 * changed since keep those changes, with the names renamed back.
 */
export function viewsAfterUndo<Files>(
  record: BoardChangeRecord<Files>,
  current: SavedWaveViews | undefined,
  languageOf: TestbenchLanguage,
): SavedWaveViews | undefined {
  if (current === record.after.waveViews) return record.before.waveViews;
  return renameWaveViews(current, undoneRenames(record.renames), languageOf);
}
