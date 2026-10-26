// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { fetchBoardFile, mergeCatalog, USER_BOARD_FILE } from './boardCatalog';
import { parsedDocument, readDocument, type BoardDocument } from './boardEditorModel';
import { initialBoardDocument, loadBoardEdits } from './boardEditorStorage';
import { parseBoardFile } from './parseBoards';
import type { BoardDefinition } from './types';

export interface LoadedEditorCatalog { file: BoardDocument; warnings: string[]; legacy: readonly BoardDefinition[] }

/** Version-1 boards still run, but are never rewritten or silently migrated by this editor. */
async function loadHostedDocument(): Promise<LoadedEditorCatalog> {
  const file = initialBoardDocument();
  const fetched = await fetchBoardFile(USER_BOARD_FILE);
  if (fetched.kind === 'missing') return { file, warnings: [], legacy: [] };
  if (fetched.kind === 'failed') return { file, warnings: [fetched.reason], legacy: [] };
  const json: unknown = JSON.parse(fetched.text);
  if (typeof json === 'object' && json !== null && 'version' in json && json.version === 1) {
    const parsed = parseBoardFile(fetched.text, { fileName: USER_BOARD_FILE, origin: 'user' });
    return { file, warnings: [...parsed.warnings], legacy: parsed.boards };
  }
  return { file: combineDocument(file, readDocument(fetched.text)), warnings: [], legacy: [] };
}

export async function loadEditorCatalog(): Promise<LoadedEditorCatalog & { runtimeFile: BoardDocument }> {
  let hosted: LoadedEditorCatalog = { file: initialBoardDocument(), warnings: [], legacy: [] };
  try { hosted = await loadHostedDocument(); }
  catch (error) { hosted.warnings.push(error instanceof Error ? error.message : String(error)); }
  const runtimeFile = hosted.file;
  try {
    const saved = loadBoardEdits();
    if (saved) {
      if (parsedDocument(saved).boards.length === 0) throw new Error('No valid version-2 boards were found.');
      hosted.file = combineDocument(saved, hosted.file);
    }
  } catch (error) { hosted.warnings.push(`Saved board settings could not be read: ${error instanceof Error ? error.message : String(error)}`); }
  return { ...hosted, runtimeFile };
}

export function combineDocument(base: BoardDocument, user: BoardDocument): BoardDocument {
  const ids = new Set(base.boards.map((board) => board.id));
  // Retain all fields on the saved document and append newly installed boards without reordering existing entries.
  return { ...user, ...base, boards: [...base.boards, ...user.boards.filter((board) => !ids.has(board.id))] };
}

export function editorCatalog(file: BoardDocument, legacy: readonly BoardDefinition[]) {
  const parsed = parsedDocument(file);
  return mergeCatalog(parsed.boards, { boards: legacy, warnings: parsed.warnings });
}
