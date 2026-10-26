// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useMemo, useRef, useState, useCallback, type SetStateAction } from 'react';
import { createNavigator } from './overlayNavigator';

export type Overlay = 'examples' | 'project' | 'projects' | 'waveform' | 'boardSettings' | null;

/** What is shown over the editor. Leaving the board settings asks first when they hold unsaved edits. */
export function useOverlay() {
  const [overlay, setValue] = useState<Overlay>(null);
  const current = useRef(overlay);
  const navigator = useMemo(() => createNavigator(() => current.current === 'boardSettings'), []);
  const { navigate, registerGuard: registerLeaveGuard } = navigator;
  const setOverlay = useCallback((update: SetStateAction<Overlay>) => {
    const next = typeof update === 'function' ? update(current.current) : update;
    if (next === current.current) return;
    navigate(() => {
      current.current = next;
      setValue(next);
    });
  }, [navigate]);
  return { overlay, setOverlay, registerLeaveGuard, navigate };
}
