// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * The Examples pane's catalogue: one card per example and language,
 * each naming the built-in files (files.ts) it copies into the project.
 * The built-in files themselves are never edited — opening an example
 * adds a copy to the Files panel, and that copy is what the student edits.
 * The copy is in the active board's port names: translateFromDefault for the boards
 * of the Default shape; for Basys 3, Nexys A7 and DE10-Lite, the files stored in
 * boardExamples/<board id>/, which declare only the ports they use.
 * ------------------------------------------------------------------ */

import { languageOfName } from './fileKinds';
import { EXAMPLE_FILES, STARTER_FILES, type VhdlFile } from './files';
import { boardTopName, generateBoardTop } from '../../boards/boardTop';
import { translateFromDefault, type Translation } from '../../boards/renamePorts';
import { DEFAULT_BOARD } from '../../boards/boardCatalog';
import { isDefaultShape } from '../../boards/shapeChange';
import type { BoardDefinition } from '../../boards/types';

export type ExampleLanguage = 'vhdl' | 'verilog';

export const EXAMPLE_LANGUAGES: readonly ExampleLanguage[] = ['vhdl', 'verilog'];

export const LANGUAGE_LABEL: Record<ExampleLanguage, string> = { vhdl: 'VHDL', verilog: 'Verilog' };

export interface Example {
  id: string;
  /** The catalogue entry the card belongs to, the same in both languages. */
  key: string;
  title: string;
  description: string;
  language: ExampleLanguage;
  /** The design drives the 7-segment displays: left out for the boards whose examples are written without them. */
  usesHex: boolean;
  /** A design or a testbench — picks the card's dot colour, as the editor's pane roles do. */
  role: 'design' | 'testbench';
  /** EXAMPLE_FILES ids. The first is the one opened in the editor; the rest come along so it runs (a testbench's design). */
  fileIds: readonly string[];
}

/** One catalogue entry, written once for both languages. */
interface ExampleEntry {
  key: string;
  title: string;
  description: string;
  usesHex?: boolean;
  role: Example['role'];
  /** EXAMPLE_FILES ids in each language, the file to open first. */
  files: Record<ExampleLanguage, readonly string[]>;
}

const CATALOGUE: readonly ExampleEntry[] = [
  {
    key: 'de1_soc',
    title: 'Board Top Level',
    description: "The board's top-level interface, with the switches wired to the LEDs.",
    role: 'design',
    files: { vhdl: ['de1_soc'], verilog: ['de1_soc_v'] },
  },
  {
    key: 'blink',
    title: 'Blink LED',
    description: 'Simple blinking LED example using a counter.',
    role: 'design',
    files: { vhdl: ['blink_test'], verilog: ['blink_test_v'] },
  },
  {
    key: 'key_counter',
    title: 'Key Counter to LED',
    description: 'Counts key presses and displays the count on the LEDs.',
    role: 'design',
    files: { vhdl: ['key_counter_2_led'], verilog: ['key_counter_2_led_v'] },
  },
  {
    key: 'key_counter_7seg',
    title: 'Key Counter to 7-Segment',
    description: 'Press KEY0 to count up on the 7-segment displays (00-99); KEY1 resets.',
    usesHex: true,
    role: 'design',
    files: { vhdl: ['key_counter_7seg'], verilog: ['key_counter_7seg_v'] },
  },
  {
    key: 'key_uart_tx',
    title: 'Key to UART Tx',
    description: "Press KEY0 to send 'A' and KEY1 to send 'B' over RS-232 (8N1, 9600 baud). Tx is shown on LEDR0, Busy on LEDR1.",
    role: 'design',
    files: {
      vhdl: ['key_uart_tx', 'uart_tx', 'uart_tx_tb'],
      verilog: ['key_uart_tx_v', 'uart_tx_v', 'uart_tx_tb_v'],
    },
  },
  {
    key: 'uart_tx_tb',
    title: 'UART Tx Testbench',
    description: "Sends 'A' once and shows the RS-232 frame and the transmitter's states in the waveform. Copies UART_Tx too.",
    role: 'testbench',
    files: { vhdl: ['uart_tx_tb', 'uart_tx'], verilog: ['uart_tx_tb_v', 'uart_tx_v'] },
  },
  {
    key: 'and_gate',
    title: 'AND Gate',
    description: 'Basic AND gate implementation.',
    role: 'design',
    files: { vhdl: ['and_gate'], verilog: ['and_gate_v'] },
  },
  {
    key: 'and_gate_tb',
    title: 'AND Gate Testbench',
    description: 'Self-checking testbench for the AND gate. Copies the AND gate too.',
    role: 'testbench',
    files: { vhdl: ['and_gate_tb', 'and_gate'], verilog: ['and_gate_tb_v', 'and_gate_v'] },
  },
  {
    key: 'and_gate_truthtable_tb',
    title: 'AND Gate Truth Table Testbench',
    description: 'Tests the AND gate and prints its truth table. Copies the AND gate too.',
    role: 'testbench',
    files: {
      vhdl: ['and_gate_truthtable_tb', 'and_gate'],
      verilog: ['and_gate_truthtable_tb_v', 'and_gate_v'],
    },
  },
];

/** One card per catalogue entry and language. */
export const EXAMPLES: readonly Example[] = CATALOGUE.flatMap(({ key, files, usesHex = false, ...text }) =>
  EXAMPLE_LANGUAGES.map((language) => ({ ...text, key, usesHex, id: `${key}_${language}`, language, fileIds: files[language] })),
);

/**
 * The examples written out per board, in boardExamples/<board id>/<vhdl|verilog>/. A board
 * of the Default shape has no folder: its examples are the built-in files, renamed. The
 * other boards' files are written in the board's own names and declare only the ports they
 * use. A file the folder lacks (the AND gate, the UART transmitter) names no board port and
 * is the built-in one. The 7-segment example is left out: the displays are not wired up
 * on these boards yet.
 */
const BOARD_SOURCES: Record<string, string> = import.meta.glob('./boardExamples/*/*/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Each board's own files by board id, under the id of the built-in file each one replaces. */
const BOARD_EXAMPLE_FILES: ReadonlyMap<string, ReadonlyMap<string, VhdlFile>> = (() => {
  const boards = new Map<string, Map<string, VhdlFile>>();
  for (const [path, content] of Object.entries(BOARD_SOURCES)) {
    const [, boardId, folder, name] = /boardExamples\/([^/]+)\/(vhdl|verilog)\/([^/]+)$/.exec(path) ?? [];
    if (boardId === undefined) throw new Error(`Unexpected board example path "${path}"`);
    const builtIn = EXAMPLE_FILES.find((f) => f.folder === folder && f.name.toLowerCase() === name.toLowerCase());
    // The one file with no built-in twin is the board's own top level.
    const id = builtIn?.id ?? (folder === 'vhdl' ? 'de1_soc' : 'de1_soc_v');
    boards.set(boardId, (boards.get(boardId) ?? new Map()).set(id, { id, name, folder: folder as VhdlFile['folder'], content }));
  }
  return boards;
})();

/** What a board's card says where the built-in text names a key or an LED of another board. */
const BOARD_DESCRIPTIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  basys3: {
    key_uart_tx: "Press btnC to send 'A' and btnU to send 'B' over RS-232 (8N1, 9600 baud). Tx is shown on led[0], Busy on led[1].",
  },
  'nexys-a7': {
    key_uart_tx: "Press BTNC to send 'A' and BTNU to send 'B' over RS-232 (8N1, 9600 baud). Tx is shown on LED[0], Busy on LED[1].",
  },
};

/** The board has files of its own (Basys 3, Nexys A7, DE10-Lite) rather than the renamed built-in ones. */
function writtenForBoard(board: BoardDefinition): boolean {
  return !isDefaultShape(board.ports) && BOARD_EXAMPLE_FILES.has(board.id);
}

/** The board is offered examples at all: those of the Default shape, or its own. */
export function hasExamples(board: BoardDefinition): boolean {
  return isDefaultShape(board.ports) || writtenForBoard(board);
}

/** The examples the Examples pane lists for `board`: all on the Default shape, those without displays on a board with files of its own. */
export function examplesFor(board: BoardDefinition): readonly Example[] {
  if (isDefaultShape(board.ports)) return EXAMPLES;
  if (!writtenForBoard(board)) return [];
  const descriptions = BOARD_DESCRIPTIONS[board.id] ?? {};
  return EXAMPLES.filter((e) => !e.usesHex).map((e) => ({ ...e, description: descriptions[e.key] ?? e.description }));
}

/** The built-in file an example names. The catalogue is fixed (and tested), so a missing id is a bug. */
function exampleFile(id: string, board: BoardDefinition = DEFAULT_BOARD): VhdlFile {
  const own = writtenForBoard(board) ? BOARD_EXAMPLE_FILES.get(board.id)?.get(id) : undefined;
  const file = own ?? EXAMPLE_FILES.find((f) => f.id === id);
  if (!file) throw new Error(`No built-in file "${id}"`);
  return file;
}

/** Everything a search matches against: title, description, language and file names. */
function searchText(example: Example, board: BoardDefinition): string {
  const fileNames = example.fileIds.map((id) => exampleFile(id, board).name);
  return [example.title, example.description, LANGUAGE_LABEL[example.language], ...fileNames].join(' ').toLowerCase();
}

/** The examples in one of `languages` whose search text (file names as `board` has them) contains every word of `query`. */
export function filterExamples(
  examples: readonly Example[],
  query: string,
  languages: ReadonlySet<ExampleLanguage> = new Set(EXAMPLE_LANGUAGES),
  board: BoardDefinition = DEFAULT_BOARD,
): readonly Example[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return examples.filter(
    (example) => languages.has(example.language) && words.every((word) => searchText(example, board).includes(word)),
  );
}

export interface ExampleCopy {
  /** Copies to append to the project — only files whose name it does not already have. */
  added: VhdlFile[];
  /** Names left alone because the project already has a file by that name. */
  kept: string[];
  /** The project file to open: the new copy of the first file, or the existing one it matched. */
  openId: string;
  /**
   * What each added file is for, by its name: the description of the example card the file
   * opens itself (the AND gate a testbench brings along is described as the AND gate), else
   * the opened example's. Goes into the project's file list.
   */
  descriptions: Record<string, string>;
  /** Copies still in the Default names, because the board's names clash with names they use. */
  untranslated: UntranslatedFile[];
}

/** A copied file that could not be put in the board's names, and why. */
export interface UntranslatedFile {
  readonly name: string;
  readonly reasons: readonly string[];
}

/** A built-in file in `board`'s port names, or as written when they clash with its own names. */
function onBoard(source: VhdlFile, board: BoardDefinition): Translation {
  if (writtenForBoard(board)) return { text: source.content };
  const language = languageOfName(source.name);
  return language === undefined ? { text: source.content } : translateFromDefault(source.content, language, board);
}

/**
 * The files a fresh workspace starts with, in `board`'s port names. One whose names clash
 * with the board's stays in the Default names; the run's mismatch hint then offers the way out.
 * A board of another shape gets its generated top instead, under the same ids, named
 * after the board (`Nexys_A7.vhdl`, `Nexys_A7.v`) as the entity or module in it (§ 5.4).
 */
export function starterFilesFor(board: BoardDefinition): VhdlFile[] {
  if (!isDefaultShape(board.ports)) return STARTER_FILES.map((file) => generatedStarter(file, board));
  return STARTER_FILES.map((file) => ({ ...file, content: onBoard(file, board).text }));
}

/** A starter file as `board`'s generated top, in the file's language. */
function generatedStarter(file: VhdlFile, board: BoardDefinition): VhdlFile {
  const language = languageOfName(file.name) ?? 'vhdl';
  const name = boardTopName(board);
  return { ...file, name: `${name}${file.name.slice(file.name.lastIndexOf('.'))}`, content: generateBoardTop(board, language, name) };
}

/** The description of the example `fileId` is the first file of, else of `example`, which it came with. */
function descriptionOf(fileId: string, example: Example, board: BoardDefinition): string {
  return (examplesFor(board).find((other) => other.fileIds[0] === fileId) ?? example).description;
}

/**
 * What opening `example` does to `files`: each of its files is copied in under
 * a fresh id (`newId`), unless a file of the same name (ignoring case) is already
 * there — that one is kept untouched, so a student's edits are never overwritten.
 * Each copy is written in `board`'s port names.
 */
export function copyExample(example: Example, files: readonly VhdlFile[], newId: () => string, board: BoardDefinition): ExampleCopy {
  const added: VhdlFile[] = [];
  const kept: string[] = [];
  const descriptions: Record<string, string> = {};
  const untranslated: UntranslatedFile[] = [];
  const projectIdOf = (source: VhdlFile): string => {
    const existing = files.find((f) => f.name.toLowerCase() === source.name.toLowerCase());
    if (existing) {
      kept.push(existing.name);
      return existing.id;
    }
    const translation = onBoard(source, board);
    const copy = { ...source, id: newId(), content: translation.text };
    added.push(copy);
    if (translation.untranslated) untranslated.push({ name: copy.name, reasons: translation.untranslated });
    descriptions[copy.name] = descriptionOf(source.id, example, board);
    return copy.id;
  };
  const [openId] = example.fileIds.map((id) => projectIdOf(exampleFile(id, board)));
  return { added, kept, openId, descriptions, untranslated };
}
