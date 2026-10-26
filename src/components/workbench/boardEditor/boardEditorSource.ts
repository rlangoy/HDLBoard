// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import type { BoardDocument } from '../../../boards/boardEditorModel';
import type { BoardDefinition } from '../../../boards/types';

export interface BoardEditorSource {
  document: BoardDocument;
  boards: readonly BoardDefinition[];
  initialBoardId: string;
  builtInBoardIds?: readonly string[];
  onSave: (file: BoardDocument, board: Record<string, unknown>) => void | Promise<void>;
  onClose: () => void;
}
