// SPDX-License-Identifier: GPL-2.0-only
import { BUILT_IN_BOARDS } from './boardCatalog';
import { parsedDocument, type BoardDocument } from './boardEditorModel';

export function withBoardConfig<T extends { board: string }>(project: T, boardConfig?: Record<string, unknown>): T {
  return { ...project, boardConfig };
}

/** Project definitions override an installed custom board with the same ID. */
export function withProjectBoard(file: BoardDocument, boardConfig?: Record<string, unknown>): BoardDocument {
  if (!boardConfig || !projectBoard(boardConfig).board) return file;
  return { ...file, boards: [...file.boards.filter((board) => board.id !== boardConfig.id), boardConfig] };
}

export function projectBoard(boardConfig?: Record<string, unknown>) {
  if (!boardConfig) return { board: undefined, warnings: [] as string[] };
  const parsed = parsedDocument({ version: 2, boards: [boardConfig] });
  const board = parsed.boards[0];
  if (board && BUILT_IN_BOARDS.some((builtin) => builtin.id === board.id || builtin.name.toLowerCase() === board.name.toLowerCase())) {
    return { board: undefined, warnings: ['The project boardConfig cannot replace a built-in board. Create a custom board with its own name and ID.'] };
  }
  return { board, warnings: parsed.warnings.map((warning) => `Project boardConfig: ${warning}`) };
}
