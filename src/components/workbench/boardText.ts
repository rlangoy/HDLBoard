// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every word the board feature shows (docs/board_io_config_spec.md § 3), in one place,
 * so the tests can pin them and the components stay free of prose.
 */

import { displayRange, type PortRename } from '../../boards/boardPorts';
import type { BoardDefinition } from '../../boards/types';
import { REPO_URL } from './project';

export const BOARD_TEXT = {
  settingTitle: 'Board',
  settingNote: 'The board of the open project, also used for new projects.',
  settingMoreBoards: 'More boards with other port names can be added in boards/boards.json',
  settingHowTo: 'How to add a board',
  settingFixedShape: 'The number of switches, keys, LEDs and displays is the same on every board.',
  changeTitle: 'Change board?',
  mismatchTitle: 'Port names do not match the board',
  updateFiles: 'Update files',
  updateFilesNote: 'Renames these names in your files and changes the board.',
  boardOnly: 'Change board only',
  boardOnlyNote: 'Changes the board only; your files stay as they are.',
  cancel: 'Cancel',
  stringsNote: 'Strings are never changed. Nothing is saved until you save the project.',
  stopsSimulation: 'The running simulation is stopped.',
  cannotUpdate: 'The files cannot be updated automatically:',
  renameByHand: 'Rename it by hand, or choose Change board only.',
  undo: 'Undo',
  fix: 'Fix…',
  chooseBoard: 'Choose a board…',
  nothingToUndo:
    'Nothing to undo: the project has changed since the board was changed. Choose the previous board in Settings to rename back.',
  oldBackend:
    'This simulation backend is older than this page and simulates with the Default names only. ' +
    'Update HDLBoard (Windows: install the new version; Docker: pull the new backend image).',
} as const;

export const BOARDS_DOC_URL = `${REPO_URL}/blob/main/docs/BOARDS.md`;

/** At most this many file names are listed; the rest are counted. */
const LISTED_FILES = 5;

/** `Board I/O · DE1-SoC`. */
export function boardPaneTitle(paneTitle: string, board: BoardDefinition): string {
  return `${paneTitle} · ${board.name}`;
}

/** `Default → DE1-SoC`. */
export function boardChangeHeading(from: BoardDefinition, to: BoardDefinition): string {
  return `${from.name} → ${to.name}`;
}

/** `Your files use the Default board's port names.` */
export function filesUseNames(board: BoardDefinition): string {
  return `Your files use the ${board.name} board's port names.`;
}

/** One row of the rename list, the displays as one row: `HEX0_N … HEX5_N → HEX0 … HEX5`. */
export interface RenameRow {
  readonly from: string;
  readonly to: string;
}

const isDisplayRename = (rename: PortRename, board: BoardDefinition): boolean => board.ports.sevenSegment.includes(rename.from);

/** The renames as the dialog lists them: one row each, the six displays as one. */
export function renameRows(renames: readonly PortRename[], from: BoardDefinition): RenameRow[] {
  const displays = renames.filter((r) => isDisplayRename(r, from));
  const others = renames.filter((r) => !isDisplayRename(r, from)).map(({ from: old, to }) => ({ from: old, to }));
  if (displays.length < 2) return [...others, ...displays];
  return [...others, { from: displayRange(displays.map((r) => r.from)), to: displayRange(displays.map((r) => r.to)) }];
}

/** `3 files will change (41 names): DE1_SoC.vhdl, keyCounter7Seg.vhdl, DE1_SoC.v` — at most five named. */
export function filesWillChange(fileNames: readonly string[], nameCount: number): string {
  const listed = fileNames.slice(0, LISTED_FILES).join(', ');
  const more = fileNames.length > LISTED_FILES ? ` +${fileNames.length - LISTED_FILES} more` : '';
  const files = fileNames.length === 1 ? '1 file will change' : `${fileNames.length} files will change`;
  const names = nameCount === 1 ? '1 name' : `${nameCount} names`;
  return `${files} (${names}): ${listed}${more}`;
}

/** `counter_tb.vhd: KEY is already a name in this file.` */
export function conflictLine(fileName: string, reason: string): string {
  return `${fileName}: ${reason}.`;
}

/** `Board: DE1-SoC. Renamed 41 names in 3 files.` */
export function boardRenamedLog(board: BoardDefinition, nameCount: number, fileCount: number): string {
  const names = nameCount === 1 ? '1 name' : `${nameCount} names`;
  const files = fileCount === 1 ? '1 file' : `${fileCount} files`;
  return `Board: ${board.name}. Renamed ${names} in ${files}.`;
}

/** `Board: DE1-SoC (files unchanged)`. */
export function boardOnlyLog(board: BoardDefinition): string {
  return `Board: ${board.name} (files unchanged)`;
}

/** `Undone: the board is Default and the files are as they were.` */
export function boardUndoneLog(board: BoardDefinition): string {
  return `Undone: the board is ${board.name} and the files are as they were.`;
}

/** A run's first line: `Board: DE1-SoC`. */
export function runBoardLog(board: BoardDefinition): string {
  return `Board: ${board.name}`;
}

/** A project on a board that is not installed: `Board "de10" is not installed here; simulating with Default names.` */
export function notInstalledRunLog(id: string, fallback: BoardDefinition): string {
  return `Board "${id}" is not installed here; simulating with ${fallback.name} names.`;
}

/** The same on the Project page: `Board "de10-lite" is not installed here; using Default.` */
export function notInstalledNote(id: string, fallback: BoardDefinition): string {
  return `Board "${id}" is not installed here; using ${fallback.name}.`;
}

/** Settings' extra row for it: `de10-lite (not installed here, using Default)`. */
export function notInstalledOption(id: string, fallback: BoardDefinition): string {
  return `${id} (not installed here, using ${fallback.name})`;
}

/** `⚠ DE1_SoC.vhdl uses names of the DE1-SoC board (KEY, HEX0, HEX1), but the board is Default.` */
export function mismatchHint(fileName: string, names: readonly string[], other: BoardDefinition, active: BoardDefinition): string {
  return `⚠ ${fileName} uses names of the ${other.name} board (${names.join(', ')}), but the board is ${active.name}.`;
}

/** `DE1_SoC.vhdl uses the DE1-SoC names; the board is Default.` */
export function mismatchLead(fileName: string, other: BoardDefinition, active: BoardDefinition): string {
  return `${fileName} uses the ${other.name} names; the board is ${active.name}.`;
}

/** `Switch board to DE1-SoC`. */
export function switchBoardTo(board: BoardDefinition): string {
  return `Switch board to ${board.name}`;
}

/** `Rename files to Default names`. */
export function renameFilesTo(board: BoardDefinition): string {
  return `Rename files to ${board.name} names`;
}
