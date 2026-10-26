// SPDX-License-Identifier: GPL-2.0-only
import { changeAt, type BoardPath } from '../../../boards/boardEditorModel';

type RawBoard = Record<string, unknown>;
export interface BoardEditorState {
  draft: RawBoard;
  saved: RawBoard;
  originalId: string;
  isNew: boolean;
  saving: boolean;
  error: string;
}
export type BoardEditorAction =
  | { type: 'reset' | 'copy' | 'saved'; board: RawBoard }
  | { type: 'change'; path: BoardPath; value: unknown }
  | { type: 'rename'; name: string; id: string }
  | { type: 'saving' }
  | { type: 'failed'; error: string };

export function initialEditorState(board: RawBoard): BoardEditorState {
  return { draft: board, saved: board, originalId: String(board.id), isNew: false, saving: false, error: '' };
}

export function boardEditorReducer(state: BoardEditorState, action: BoardEditorAction): BoardEditorState {
  switch (action.type) {
    case 'reset':
    case 'saved': return initialEditorState(action.board);
    case 'copy': return { ...state, draft: action.board, isNew: true, error: '' };
    case 'change': return { ...state, draft: changeAt(state.draft, action.path, action.value) as RawBoard, error: '' };
    case 'rename': return { ...state, draft: { ...state.draft, name: action.name, id: action.id }, error: '' };
    case 'saving': return { ...state, saving: true, error: '' };
    case 'failed': return { ...state, saving: false, error: action.error };
  }
}
