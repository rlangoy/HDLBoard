// SPDX-License-Identifier: GPL-2.0-only
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDraftSession } from './useBoardDraft';

interface NavigationSource {
  save: () => Promise<boolean>;
  onClose: () => void;
}

export function useBoardEditorNavigation(session: BoardDraftSession, source: NavigationSource) {
  const { state, dispatch } = session;
  const dirty = useMemo(() => JSON.stringify(state.draft) !== JSON.stringify(state.saved), [state.draft, state.saved]);
  const current = useRef({ dirty, saving: state.saving });
  current.current = { dirty, saving: state.saving };
  const [pending, setPending] = useState<(() => void) | null>(null);
  /**
   * Actions that run straight after a reset or save (closing, switching overlay) ask the guard
   * again before React has re-rendered; this tells it the edits are already gone.
   */
  const markSettled = () => {
    current.current = { dirty: false, saving: false };
  };
  const resetTo = (board: Record<string, unknown>) => {
    markSettled();
    dispatch({ type: 'reset', board });
    setPending(null);
  };
  const request = useCallback((action: () => void) => {
    if (current.current.saving) return;
    if (current.current.dirty) setPending(() => action);
    else action();
  }, []);
  useUnsavedUnload(dirty);
  return { dirty, request, pending, resetTo,
    keepEditing: () => setPending(null),
    discard: () => {
      resetTo(state.saved);
      pending?.();
    },
    saveAndContinue: async () => {
      if (!await source.save()) return;
      markSettled();
      setPending(null);
      pending?.();
    },
    cancel: () => {
      if (current.current.saving) return;
      resetTo(state.saved);
      source.onClose();
    },
  };
}

function useUnsavedUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
