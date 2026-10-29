// SPDX-License-Identifier: GPL-2.0-only
import { BUILT_IN_BOARDS } from './boardCatalog';
import { parsedDocument, type BoardDocument } from './boardEditorModel';
import type { BoardCatalog } from './types';

export function withBoardConfig<T extends { board: string }>(project: T, boardConfig?: Record<string, unknown>): T {
  return { ...project, boardConfig };
}

/** Project definitions override an installed custom board with the same ID. */
export function withProjectBoard(file: BoardDocument, boardConfig?: Record<string, unknown>): BoardDocument {
  if (!boardConfig || !projectBoard(boardConfig).board) return file;
  return { ...file, boards: [...file.boards.filter((board) => board.id !== boardConfig.id), boardConfig] };
}

export function projectBoard(boardConfig?: Record<string, unknown>, expectedId?: string) {
  if (!boardConfig) return { board: undefined, warnings: [] as string[] };
  const parsed = parsedDocument({ version: 2, boards: [boardConfig] });
  const board = parsed.boards[0];
  if (board && expectedId !== undefined && board.id !== expectedId) {
    return { board: undefined, warnings: [`Project boardConfig defines "${board.id}" but the project selects "${expectedId}".`] };
  }
  if (board && BUILT_IN_BOARDS.some((builtin) => builtin.id === board.id || builtin.name.toLowerCase() === board.name.toLowerCase())) {
    return { board: undefined, warnings: ['The project boardConfig cannot replace a built-in board. Create a custom board with its own name and ID.'] };
  }
  return { board, warnings: parsed.warnings.map((warning) => `Project boardConfig: ${warning}`) };
}

/** Do not silently substitute an installed definition for an invalid embedded board. */
export function catalogWithProjectBoard(installed: BoardCatalog, boardConfig?: Record<string, unknown>, selectedId?: string): BoardCatalog {
  const embedded = projectBoard(boardConfig, selectedId);
  const board = embedded.board;
  if (board) return { ...installed, boards: [...installed.boards.filter((candidate) => candidate.id !== board.id), board] };
  if (boardConfig && selectedId !== undefined) return { ...installed, boards: installed.boards.filter((board) => board.id !== selectedId) };
  return installed;
}
