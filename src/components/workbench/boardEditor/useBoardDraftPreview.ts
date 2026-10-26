// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useEffect, useRef } from 'react';
import { parsedDocument } from '../../../boards/boardEditorModel';
import type { BoardDefinition } from '../../../boards/types';

export interface BoardDraftPreview { board: BoardDefinition; invalid: boolean }
export type BoardPreviewChange = (preview: BoardDraftPreview | null) => void;

/** Incomplete fields stay in the editor; the renderer receives only valid board shapes. */
export function useBoardDraftPreview(draft: Record<string, unknown>, onPreview?: BoardPreviewChange) {
  const lastValid = useRef<BoardDefinition>();
  useEffect(() => {
    const board = parsedDocument({ version: 2, boards: [draft] }).boards[0];
    if (board) lastValid.current = board;
    if (lastValid.current) onPreview?.({ board: lastValid.current, invalid: !board });
  }, [draft, onPreview]);
  useEffect(() => () => onPreview?.(null), [onPreview]);
}
