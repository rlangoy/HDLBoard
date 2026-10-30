// SPDX-License-Identifier: GPL-2.0-only
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { BoardDocument } from '../../../boards/boardEditorModel';
import type { OpenProject } from '../projectFile';
import type { EditableBoardCatalog } from '../useBoards';
import type { BoardDraftPreview } from './useBoardDraftPreview';
import { findBoard } from '../../../boards/boardCatalog';
import { displayCount } from '../../../boards/boardShape';
import { withVisibilityCounts } from '../../../project/displaySettings';

interface BoardSettingsTarget {
  setProject: Dispatch<SetStateAction<OpenProject>>;
  stopSimulation: () => void;
}

export function useBoardSettings(catalog: EditableBoardCatalog, target: BoardSettingsTarget) {
  const [preview, setPreview] = useState<BoardDraftPreview | null>(null);
  const save = (document: BoardDocument, boardConfig: Record<string, unknown>) => {
    target.stopSimulation();
    catalog.applyDocument(document);
    target.setProject((current) => {
      const ports = findBoard(catalog, current.board).board.ports;
      return { ...current, board: String(boardConfig.id), boardConfig, displaySettings: withVisibilityCounts(current.displaySettings, { leds: ports.leds.count, switches: ports.switches.count, sevenSegment: displayCount(ports) }) };
    });
  };
  return { preview, onPreview: setPreview, onSave: save };
}
