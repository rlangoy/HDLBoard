// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long "Saved" shows after a change before the standing note returns. */
export const SAVED_NOTICE_MS = 2000;

/** True for a moment after `notify`: the page confirms a change, as each one is saved at once. */
export function useSavedNotice() {
  const [justSaved, setJustSaved] = useState(false);
  const timer = useRef<number | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const notify = useCallback(() => {
    clearTimer();
    setJustSaved(true);
    timer.current = window.setTimeout(() => setJustSaved(false), SAVED_NOTICE_MS);
  }, []);

  useEffect(() => clearTimer, []);

  return { justSaved, notify };
}
