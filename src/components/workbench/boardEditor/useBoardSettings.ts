// SPDX-License-Identifier: GPL-2.0-only
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { BoardDocument } from '../../../boards/boardEditorModel';
import type { OpenProject } from '../projectFile';
import type { EditableBoardCatalog } from '../useBoards';
import type { BoardDraftPreview } from './useBoardDraftPreview';

interface BoardSettingsTarget {
  setProject: Dispatch<SetStateAction<OpenProject>>;
  stopSimulation: () => void;
}

export function useBoardSettings(catalog: EditableBoardCatalog, target: BoardSettingsTarget) {
  const [preview, setPreview] = useState<BoardDraftPreview | null>(null);
  const save = (document: BoardDocument, boardConfig: Record<string, unknown>) => {
    target.stopSimulation();
    catalog.applyDocument(document);
    target.setProject((current) => ({ ...current, board: String(boardConfig.id), boardConfig }));
  };
  return { preview, onPreview: setPreview, onSave: save };
}
