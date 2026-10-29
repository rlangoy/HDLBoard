// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every word the board feature shows (docs/board_io_config_spec.md § 3), in one place,
 * so the tests can pin them and the components stay free of prose.
 */

import type { ForeignNames } from '../../boards/boardMatch';
import type { PortRename } from '../../boards/boardPorts';
import { displayRange, groupHeading, sevenSegmentHeading, vectorHeading } from '../../boards/boardPortText';
import { buttonCount, displayCount, sevenSegmentNames } from '../../boards/boardShape';
import { DEFAULT_SHAPE } from '../../boards/shapeChange';
import type { BoardDefinition, ButtonGroup, SevenSegment, VectorPort } from '../../boards/types';
import { REPO_URL } from './project';

/** `10 switches, 4 keys and 6 displays`: the shape the built-in examples and an older backend need. */
export const DEFAULT_SHAPE_SUMMARY =
  `${DEFAULT_SHAPE.switches.count} switches, ${buttonCount(DEFAULT_SHAPE)} keys and ${displayCount(DEFAULT_SHAPE)} displays`;

export const BOARD_TEXT = {
  settingTitle: 'Board',
  settingHowTo: 'How to add a board',
  settingNote: 'The board of the open project, also used for new projects.',
  settingFileLead: 'Add or manage boards in Board settings, or edit boards/boards.json.',
  settingFileEdit: 'Edit boards/boards.json to add or manage boards.',
  settingManage: 'Manage board',
  layoutTitle: 'Board simulator layout',
  layoutSingle: 'Single column',
  layoutTwo: 'Two columns',
  changeTitle: 'Change board?',
  renamedInFiles: 'Renamed in your files:',
  changeByHand: 'Change by hand:',
  boardResources: 'Board resources:',
  newStarterFile: 'New starter file',
  newStarterFileNote: "Adds a top file in this board's names to your files: the LEDs follow the switches, the displays are off.",
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
  undoWhenFree: 'Undo has to wait while the project is loaded or saved, or a run compiles. Click Undo again when it is done.',
  oldBackend:
    'This simulation backend is older than this page and simulates with the Default names only. ' +
    'Update HDLBoard (Windows: install the new version; Docker: pull the new backend image).',
  oldBackendShape:
    `The simulator backend is older than this page and supports only boards with ${DEFAULT_SHAPE_SUMMARY} and a ${DEFAULT_SHAPE.clock.mhz} MHz clock. ` +
    'Update HDLBoard, or choose Default or DE1-SoC.',
} as const;

export const BOARDS_DOC_URL = `${REPO_URL}/blob/main/docs/BOARDS.md`;

/** At most this many file names are listed; the rest are counted. */
const LISTED_FILES = 5;

// --- The Board pane's headings (docs/board_io_v2_spec.md § 5.1) ----------------------

/** A compact, grammatically correct summary of the board's configured I/O. */
export function boardSummary(board: BoardDefinition): string {
  const { ports } = board;
  const count = (n: number, singular: string, plural: string) => n ? `${n} ${n === 1 ? singular : plural}` : '';
  const parts = [
    count(ports.leds.count, 'LED', 'LEDs'),
    count(displayCount(ports), 'HEX display', 'HEX displays'),
    count(ports.switches.count, 'switch', 'switches'),
    count(buttonCount(ports), 'button', 'buttons'),
    count(ports.resetButton ? 1 : 0, 'reset button', 'reset buttons'),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No LEDs, displays, switches or buttons configured';
}

/** `LEDs (led[15:0])`. */
export function ledsTitle(leds: VectorPort): string {
  return `LEDs (${vectorHeading(leds.port, leds.count)})`;
}

/** `Switches (sw[15:0])`. */
export function switchesTitle(switches: VectorPort): string {
  return `Switches (${vectorHeading(switches.port, switches.count)})`;
}

/** `Btn (KEY[1:0])`, or `Btn (btnC, btnU, btnL, btnR, btnD)`. */
export function buttonsTitle(buttons: ButtonGroup): string {
  return `Btn (${groupHeading(buttons.group)})`;
}

/** `7-seg (HEXn[7:0])`, or `7-seg (seg[6:0], dp, an[3:0])` for one multiplexed display. */
export function displaysTitle(displays: SevenSegment): string {
  return `7-seg (${sevenSegmentHeading(displays)})`;
}

/** `Board I/O · DE1-SoC`. */
export function boardPaneTitle(paneTitle: string, board: BoardDefinition): string {
  return `${paneTitle} · ${board.name}`;
}

/** `Default → DE1-SoC`. */
export function boardChangeHeading(from: BoardDefinition, to: BoardDefinition): string {
  return `${from.name} → ${to.name}`;
}

/**
 * Instead of the example cards on a board of another shape (§ 5.4): `The built-in examples
 * are written for boards with 10 switches, 4 keys and 6 displays (Default, DE1-SoC).`
 */
export function examplesNotice(defaultShapedBoards: readonly BoardDefinition[]): string {
  const names = defaultShapedBoards.map((board) => board.name).join(', ');
  return `The built-in examples are written for boards with ${DEFAULT_SHAPE_SUMMARY} (${names}).`;
}

/** Beside the notice above: the boards of another shape that have examples written for them. */
export function ownExamplesNotice(boards: readonly BoardDefinition[]): string {
  return `Examples are also built in for ${boards.map((board) => board.name).join(', ')}; available examples vary by board.`;
}

/** The lead of a change between boards of different shapes (§ 5.3). */
export function differentIo(to: BoardDefinition): string {
  return `These boards have different I/O. Your design will not run on ${to.name} until the changes listed below are made.`;
}

/** The first hand edit when Update files renames nothing between the two boards. */
export function portNamesByHand(to: BoardDefinition): string {
  return `Port names: use the ${to.name} board's names (Help lists them); they are not renamed for you.`;
}

/** The lead of a change between boards that differ only in their clock: the design runs, its timing changes. */
export function differentClock(to: BoardDefinition): string {
  return `These boards have a different clock. Your design runs on ${to.name}, but anything that counts clock cycles runs at another speed until the change below is made.`;
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

const isDisplayRename = (rename: PortRename, board: BoardDefinition): boolean => sevenSegmentNames(board.ports).includes(rename.from);

/** The renames as the dialog lists them: one row each, the 7-segment ports as one. */
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
export function mismatchHint(fileName: string, { board, names }: ForeignNames, active: BoardDefinition): string {
  return `⚠ ${fileName} uses names of the ${board.name} board (${names.join(', ')}), but the board is ${active.name}.`;
}

/** `DE1_SoC.vhdl uses the DE1-SoC names; the board is Default.` */
export function mismatchLead(fileName: string, other: BoardDefinition, active: BoardDefinition): string {
  return `${fileName} uses the ${other.name} names; the board is ${active.name}.`;
}

/**
 * A copied or new file still in the Default names: `UART_Tx.vhdl keeps the Default board's
 * names: CLK is already a name in this file. Rename by hand to use the Course board's.`
 */
export function untranslatedLog(fileName: string, board: BoardDefinition, reasons: readonly string[]): string {
  return `${fileName} keeps the Default board's names: ${reasons.join('; ')}. Rename by hand to use the ${board.name} board's.`;
}

/** `Switch board to DE1-SoC`. */
export function switchBoardTo(board: BoardDefinition): string {
  return `Switch board to ${board.name}`;
}

/** `Rename files to Default names`. */
export function renameFilesTo(board: BoardDefinition): string {
  return `Rename files to ${board.name} names`;
}

/**
 * A backend message about the board, with the board's name in it: the backend never
 * receives board names, so `STIM needs 21 bits …` becomes `Basys 3: STIM needs 21 bits …`,
 * and the width check's `but the board has 16 switches` becomes `but the Basys 3 board has …`.
 */
export function withBoardName(text: string, boardName: string): string {
  if (text.startsWith('STIM needs')) return `${boardName}: ${text}`;
  return text.replace(WIDTH_CHECK_LINE, (line) => line.replace(BOARD_HAS, `the ${boardName} board has`));
}

/**
 * A line of HDLBoard's own width check (server/src/engines/boardShapeCheck.ts), and only
 * such a line: a student's own report text that says "the board has" is left alone.
 */
const WIDTH_CHECK_LINE = /^.*(?:is declared as .*, but the board has|^Note: .* has a width HDLBoard cannot read|^Warning: .* is declared as .*, but the board has).*$/gm;
const BOARD_HAS = 'the board has';
