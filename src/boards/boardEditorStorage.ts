// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import builtin from './builtinBoards.json';
import { readDocument, type BoardDocument } from './boardEditorModel';
export const BOARD_SETTINGS_STORAGE_KEY = 'hdlboard.boardSettings.v2';
export function initialBoardDocument(): BoardDocument { return readDocument(JSON.stringify(builtin)); }
export const BUILT_IN_BOARD_IDS = initialBoardDocument().boards.map((board) => String(board.id));
/** Compatibility with editor settings saved before boards moved into project files. */
export function loadBoardEdits(): BoardDocument | undefined {
  const text = window.localStorage.getItem(BOARD_SETTINGS_STORAGE_KEY);
  return text === null ? undefined : readDocument(text);
}
