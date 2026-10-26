// SPDX-License-Identifier: GPL-2.0-only
import { useRef } from 'react';
import { appendBoard, replaceBoard } from '../../../boards/boardEditorModel';
import type { BoardDraftSession } from './useBoardDraft';
import type { BoardEditorSource } from './useBoardEditor';

export function useBoardPersistence(session: BoardDraftSession, source: BoardEditorSource) {
  const saving = useRef(false);
  return async () => {
    const { state, dispatch, errors, readOnly } = session;
    if (readOnly || Object.keys(errors).length || saving.current) return false;
    saving.current = true;
    dispatch({ type: 'saving' });
    try {
      const document = state.isNew ? appendBoard(source.document, state.draft)
        : replaceBoard(source.document, state.draft, state.originalId);
      await source.onSave(document, state.draft);
      dispatch({ type: 'saved', board: state.draft });
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      dispatch({ type: 'failed', error: `Could not save board settings: ${message}. Your draft is still here.` });
      return false;
    } finally {
      saving.current = false;
    }
  };
}
