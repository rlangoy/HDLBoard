// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { AppDefaults } from './appDefaults';
import type { Setting } from './settings/settingsSections';
import { storedSwitch, useStoredSetting } from './useStoredSetting';

/**
 * Settings › General › Top-File › *Suggest the Top-File*: Start asks before it runs
 * another file than the board design on screen, and that file's pane offers to make it
 * top (topFileSuggestion.ts). The question's *Don't ask me again* turns it off too. The
 * student's choice is kept in this browser; until they make one, `settings.json`'s
 * `topFileHint` applies, else on.
 */

export const TOP_FILE_HINT_KEY = 'hdlboard.topFileHint.v1';

/** On: it is for the novice who does not know about the Top-File yet. */
export const DEFAULT_TOP_FILE_HINT = true;

/** The choice in effect: the student's, else the host's start-up default, else on (also while that loads). */
export function topFileHintInEffect(choice: boolean | null, startupDefault: boolean | null): boolean {
  return choice ?? startupDefault ?? DEFAULT_TOP_FILE_HINT;
}

const TOP_FILE_HINT = storedSwitch({
  key: TOP_FILE_HINT_KEY,
  startupDefaultOf: (defaults) => defaults.topFileHint,
  inEffect: topFileHintInEffect,
});

export function useTopFileHint(appDefaults: AppDefaults | null): Setting<boolean> {
  return useStoredSetting(TOP_FILE_HINT, appDefaults);
}
