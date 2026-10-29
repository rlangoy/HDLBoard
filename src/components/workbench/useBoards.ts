// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useState } from 'react';
import { parsedDocument, type BoardDocument } from '../../boards/boardEditorModel';
import { editorCatalog, loadEditorCatalog } from '../../boards/boardEditorCatalog';
import { BUILT_IN_BOARD_IDS, initialBoardDocument } from '../../boards/boardEditorStorage';
import { catalogWithProjectBoard, projectBoard, withProjectBoard } from '../../boards/projectBoard';
import type { BoardCatalog, BoardDefinition } from '../../boards/types';

/**
 * Applied settings live in memory until the project is saved. Raw documents retain
 * extensions; the project's embedded board takes precedence over installed custom boards.
 */
export interface EditableBoardCatalog extends BoardCatalog {
  document: BoardDocument;
  editorBoards: readonly BoardDefinition[];
  builtInBoardIds: readonly string[];
  ready: boolean;
  boardConfigFor: (id: string) => Record<string, unknown> | undefined;
}

export function useBoards(boardConfig?: Record<string, unknown>, selectedBoardId?: string): EditableBoardCatalog {
  const [savedDocument, setDocument] = useState(initialBoardDocument);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [legacy, setLegacy] = useState<readonly BoardDefinition[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadEditorCatalog().then((loaded) => {
      if (cancelled) return;
      setDocument(loaded.file);
      setWarnings(loaded.warnings);
      setReady(true);
      setLegacy(loaded.legacy);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const embedded = useMemo(() => projectBoard(boardConfig, selectedBoardId), [boardConfig, selectedBoardId]);
  const document = useMemo(() => withProjectBoard(savedDocument, embedded.board ? boardConfig : undefined), [savedDocument, boardConfig, embedded]);
  const parsed = useMemo(() => {
    const installed = editorCatalog(savedDocument, legacy);
    return catalogWithProjectBoard(installed, boardConfig, selectedBoardId);
  }, [savedDocument, legacy, boardConfig, selectedBoardId]);
  const editorBoards = useMemo(() => parsedDocument(document).boards, [document]);
  const boardConfigFor = (id: string) => BUILT_IN_BOARD_IDS.includes(id) ? undefined : document.boards.find((board) => board.id === id);
  return { document, editorBoards, builtInBoardIds: BUILT_IN_BOARD_IDS, ready, boardConfigFor, boards: parsed.boards, warnings: [...warnings, ...parsed.warnings, ...embedded.warnings] };
}
