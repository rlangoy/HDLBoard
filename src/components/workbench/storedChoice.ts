// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * An on/off choice from Settings, kept in this browser's storage as `on` or `off`
 * (the Windows app keeps its own browser storage between launches). Storage can be
 * blocked; then nothing is stored and the choice holds for this page only.
 */

/** The stored choice, or null when none was made. Never throws. */
export function loadStoredChoice(key: string): boolean | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    return null;
  }
}

/** Never throws. */
export function saveStoredChoice(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // The choice holds for this page only.
  }
}
