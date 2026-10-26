// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useCallback, useRef, useState, type SetStateAction } from 'react';
type Overlay = 'examples' | 'project' | 'projects' | 'waveform' | 'boardSettings' | null;
export function useBoardOverlay() {
  const [overlay, setValue] = useState<Overlay>(null);
  const current = useRef(overlay);
  const leaveGuard = useRef<((action: () => void) => void) | null>(null);
  const navigating = useRef(false);
  const navigate = useCallback((action: () => void) => {
    const apply = () => {
      const previous = navigating.current;
      navigating.current = true;
      try { action(); }
      finally { navigating.current = previous; }
    };
    if (!navigating.current && current.current === 'boardSettings' && leaveGuard.current) leaveGuard.current(apply);
    else apply();
  }, []);
  const setOverlay = useCallback((update: SetStateAction<Overlay>) => {
    const next = typeof update === 'function' ? update(current.current) : update;
    if (next === current.current) return;
    navigate(() => {
      current.current = next;
      setValue(next);
    });
  }, [navigate]);
  return { overlay, setOverlay, leaveGuard, navigate };
}
