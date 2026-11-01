// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { BUILT_IN_DEFAULTS, loadAppDefaults } from './appDefaults';

/**
 * Whether the Pushbuttons panel offers "Bouncy" contacts (Settings › Pushbuttons).
 * The student's own choice is kept in this browser; until they make one, the
 * start-up default from `settings.json` applies, and without that it is on.
 */

const STORAGE_KEY = 'hdlboard.pushbuttons.bouncy';

/** The stored choice, or null when the student has not made one. Never throws. */
export function loadBouncyChoice(): boolean | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    return null;
  }
}

export function saveBouncyChoice(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // The choice holds for this page only.
  }
}

export function useBouncyOption(): { enabled: boolean; setEnabled: (on: boolean) => void } {
  const [enabled, setEnabledState] = useState(() => loadBouncyChoice() ?? BUILT_IN_DEFAULTS.bouncyButtons);
  useEffect(() => {
    let cancelled = false;
    void loadAppDefaults().then(({ defaults, warnings }) => {
      if (cancelled) return;
      for (const warning of warnings) console.warn(`hdl-board: ${warning}`);
      if (loadBouncyChoice() === null) setEnabledState(defaults.bouncyButtons);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const setEnabled = (on: boolean) => {
    saveBouncyChoice(on);
    setEnabledState(on);
  };
  return { enabled, setEnabled };
}
