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

import type { SavedWaveSignal, SavedWaveView, SavedWaveViews } from '../project/types';
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
export type CurrentBoardState<Files> = Pick<BoardChangeState<Files>, 'files' | 'board'> & { readonly project: string };

/** Undo is possible only in the same project, while the files and the board are exactly as the change left them. */
export function canUndo<Files>(record: BoardChangeRecord<Files>, current: CurrentBoardState<Files>): boolean {
  const { after } = record;
  return current.project === record.project && current.files === after.files && current.board === after.board;
}

/** The renames that take the names back. */
export function undoneRenames(renames: readonly PortRename[]): PortRename[] {
  return renames.map(({ from, to }) => ({ from: to, to: from }));
}

/** Every saved path of a view, the shown signals first: the order `renameWaveViews` keeps. */
const pathsOf = (view: SavedWaveView | undefined): string[] =>
  view === undefined ? [] : [...view.signals, ...(view.notShown ?? [])].map((signal) => signal.path);

/**
 * How the files spelled each name the change renamed, read from the views it renamed,
 * path by path and segment by segment: `KEY` was `key_n` in a Verilog file that wrote it so.
 */
function earlierSpellings(before: SavedWaveViews | undefined, after: SavedWaveViews | undefined): Map<string, string> {
  const spellings = new Map<string, string>();
  for (const [testbench, view] of Object.entries(after ?? {})) {
    const earlier = pathsOf(before?.[testbench]).map((path) => path.split('/'));
    pathsOf(view).forEach((path, index) =>
      path.split('/').forEach((segment, at) => {
        const was = earlier[index]?.[at];
        if (was !== undefined && was !== segment) spellings.set(segment, was);
      }),
    );
  }
  return spellings;
}

/** The views with each segment the change renamed spelled as it was before. */
function respelled(views: SavedWaveViews | undefined, spellings: ReadonlyMap<string, string>): SavedWaveViews | undefined {
  if (views === undefined || spellings.size === 0) return views;
  const respell = (signal: SavedWaveSignal): SavedWaveSignal => ({
    ...signal,
    path: signal.path.split('/').map((segment) => spellings.get(segment) ?? segment).join('/'),
  });
  return Object.fromEntries(
    Object.entries(views).map(([testbench, view]) => {
      const notShown = view.notShown === undefined ? {} : { notShown: view.notShown.map(respell) };
      return [testbench, { ...view, signals: view.signals.map(respell), ...notShown }];
    }),
  );
}

/**
 * The saved waveform views after Undo. Views left as the change made them are
 * restored exactly. In views the student changed since, each renamed name gets back the
 * spelling the files had – which renaming back alone could not know (`uut/key_n`
 * written in lower case in a Verilog file); a name only added since is renamed back.
 */
export function viewsAfterUndo<Files>(
  record: BoardChangeRecord<Files>,
  current: SavedWaveViews | undefined,
  languageOf: TestbenchLanguage,
): SavedWaveViews | undefined {
  const { before, after } = record;
  if (current === after.waveViews) return before.waveViews;
  const spelledAsBefore = respelled(current, earlierSpellings(before.waveViews, after.waveViews));
  return renameWaveViews(spelledAsBefore, undoneRenames(record.renames), languageOf);
}
