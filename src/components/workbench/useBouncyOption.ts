// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { loadAppDefaults } from './appDefaults';

/**
 * Whether the Pushbuttons panel offers "Bouncy" contacts (Settings › Pushbuttons).
 * The student's own choice is kept in this browser, like the dialog's other preferences;
 * until they make one, the start-up default from `settings.json` applies. While that file
 * is still loading the option is off, so a course that switched it off never sees a
 * bouncing press at start-up.
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

/** The option in effect: the student's choice, else the start-up default, else off while that loads. */
export function bouncyEnabled(choice: boolean | null, startupDefault: boolean | null): boolean {
  return choice ?? startupDefault ?? false;
}

/** Follow a choice made in another tab. */
export function subscribeBouncyChoice(onChange: (choice: boolean | null) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange(loadBouncyChoice());
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export function useBouncyOption(): { enabled: boolean; setEnabled: (on: boolean) => void } {
  // Kept in state as well as storage, so a choice made this session holds even when storage is blocked.
  const [choice, setChoice] = useState(loadBouncyChoice);
  const [startupDefault, setStartupDefault] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAppDefaults().then(({ defaults, warnings }) => {
      if (cancelled) return;
      for (const warning of warnings) console.warn(`hdl-board: ${warning}`);
      setStartupDefault(defaults.bouncyButtons);
    });
    const unsubscribe = subscribeBouncyChoice(setChoice);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  const setEnabled = (on: boolean) => {
    saveBouncyChoice(on);
    setChoice(on);
  };
  return { enabled: bouncyEnabled(choice, startupDefault), setEnabled };
}
