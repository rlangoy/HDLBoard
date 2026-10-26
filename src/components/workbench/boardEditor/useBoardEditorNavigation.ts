// SPDX-License-Identifier: GPL-2.0-only
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardDraftSession } from './useBoardDraft';

interface NavigationSource {
  save: () => Promise<boolean>;
  onClose: () => void;
}

export function useBoardEditorNavigation(session: BoardDraftSession, source: NavigationSource) {
  const { state, dispatch } = session;
  const dirty = JSON.stringify(state.draft) !== JSON.stringify(state.saved);
  const current = useRef({ dirty, saving: state.saving });
  current.current = { dirty, saving: state.saving };
  const [pending, setPending] = useState<(() => void) | null>(null);
  const resetTo = (board: Record<string, unknown>) => {
    current.current.dirty = false;
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
      current.current.dirty = false;
      current.current.saving = false;
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
