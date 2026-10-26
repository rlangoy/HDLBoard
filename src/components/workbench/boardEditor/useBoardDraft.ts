// SPDX-License-Identifier: GPL-2.0-only
import { useMemo, useReducer, useRef } from 'react';
import { boardImportSettings } from '../../../boards/boardImportSettings';
import { valueAt, type BoardPath } from '../../../boards/boardEditorModel';
import { boardIdFromName } from '../../../boards/boardEditorIdentity';
import { validateBoardDraft } from '../../../boards/boardEditorValidation';
import { BUILT_IN_BOARD_IDS } from '../../../boards/boardEditorStorage';
import { newComponent, type OptionalComponent } from '../../../boards/optionalComponents';
import { boardEditorReducer, initialEditorState } from './boardEditorState';
import type { BoardEditorSource } from './boardEditorSource';
import { useRepresentations } from './useRepresentations';

export function useBoardDraft(source: BoardEditorSource) {
  const [state, dispatch] = useReducer(boardEditorReducer, source, (initial) => {
    const id = initial.boards.find((board) => board.id === initial.initialBoardId)?.id ?? initial.boards[0].id;
    return initialEditorState(initial.document.boards.find((board) => board.id === id) ?? initial.document.boards[0]);
  });
  const boardId = String(state.draft.id);
  const board = source.boards.find((item) => item.id === boardId) ?? source.boards[0];
  const defaults = useMemo(() => boardImportSettings(board), [board]);
  const readOnly = (source.builtInBoardIds ?? BUILT_IN_BOARD_IDS).includes(boardId) && !state.isNew;
  const savedId = state.isNew ? undefined : state.originalId;
  const errors = useMemo(
    () => validateBoardDraft(state.draft, defaults, { boards: source.document.boards, editingId: savedId }),
    [state.draft, defaults, source.document, savedId],
  );
  return { state, dispatch, boardId, defaults, readOnly, errors };
}
export type BoardDraftSession = ReturnType<typeof useBoardDraft>;

export function useBoardMutations(session: BoardDraftSession, source: BoardEditorSource) {
  const { state, dispatch, readOnly, defaults } = session;
  const removed = useRef(new Map<string, unknown>());
  const get = (path: BoardPath) => valueAt(state.draft, path) ?? editorDefault(defaults, path);
  const change = (path: BoardPath, value: unknown) => {
    if (!readOnly && !state.saving) dispatch({ type: 'change', path, value });
  };
  const changeBoardName = (name: string) => {
    if (readOnly || state.saving) return;
    const keepingId = state.isNew ? undefined : state.originalId;
    dispatch({ type: 'rename', name, id: boardIdFromName(name, source.document.boards, keepingId) });
  };
  const removeComponent = (component: OptionalComponent) => {
    const current = get(['ports', component]);
    if (current !== undefined) removed.current.set(`${state.originalId}:${component}`, current);
    change(['ports', component], undefined);
  };
  const addComponent = (component: OptionalComponent) => {
    change(['ports', component], get(['ports', component]) ?? removed.current.get(`${state.originalId}:${component}`) ?? newComponent(component));
  };
  const changeRepresentation = useRepresentations(state.draft, change);
  return { get, change, changeBoardName, changeRepresentation, addComponent, removeComponent };
}

const ACTIVE_LOW_KEYS = ['activeLow', 'digitEnablesActiveLow'];
const IMPORTED_DEFAULT_KEYS = ['clockMHz', 'clock500Hz', 'description', 'resources'];

/** What a field shows while the board leaves it unset: polarity is active-low, the rest come from the imported board. */
function editorDefault(defaults: unknown, path: BoardPath) {
  const last = String(path[path.length - 1]);
  if (ACTIVE_LOW_KEYS.includes(last)) return true;
  if (path[0] === 'labels' || IMPORTED_DEFAULT_KEYS.includes(last)) return valueAt(defaults, path);
  return undefined;
}
