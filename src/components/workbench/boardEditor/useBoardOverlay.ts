// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useCallback, useRef, useState, type SetStateAction } from 'react';
type Overlay = 'examples' | 'project' | 'projects' | 'waveform' | 'boardSettings' | null;
export function useBoardOverlay() {
  const [overlay, setValue] = useState<Overlay>(null);
  const current = useRef(overlay);
  const leaveGuard = useRef<((action: () => void) => void) | null>(null);
  const setOverlay = useCallback((update: SetStateAction<Overlay>) => {
    const next = typeof update === 'function' ? update(current.current) : update;
    const apply = () => { current.current = next; setValue(next); };
    if (current.current === 'boardSettings' && next !== current.current && leaveGuard.current) leaveGuard.current(apply);
    else apply();
  }, []);
  return { overlay, setOverlay, leaveGuard };
}
