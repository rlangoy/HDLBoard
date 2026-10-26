// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { editableCopy } from '../../../boards/boardEditorIdentity';
import type { BoardEditorSource } from './boardEditorSource';
import { useBoardDraft, useBoardMutations } from './useBoardDraft';
import { useBoardEditorNavigation } from './useBoardEditorNavigation';
import { useBoardPersistence } from './useBoardPersistence';

export function useBoardEditor(source: BoardEditorSource) {
  const session = useBoardDraft(source);
  const mutations = useBoardMutations(session, source);
  const save = useBoardPersistence(session, source);
  const navigation = useBoardEditorNavigation(session, { save, onClose: source.onClose });
  const choose = (id: string) => navigation.request(() => {
    const board = source.document.boards.find((item) => item.id === id);
    if (board) navigation.resetTo(board);
  });
  const createCopy = () => {
    if (!session.readOnly || session.state.saving) return;
    session.dispatch({ type: 'copy', board: editableCopy(session.state.draft, source.document.boards) });
  };
  return { ...session.state, boardId: session.boardId, readOnly: session.readOnly,
    errors: session.errors, ...mutations, ...navigation, save, choose, createCopy };
}
export type BoardEditor = ReturnType<typeof useBoardEditor>;
