// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { AppDefaults } from './appDefaults';
import type { Setting } from './settings/settingsSections';
import { storedSwitch, useStoredSetting } from './useStoredSetting';

/**
 * Whether the Pushbuttons panel offers "Bouncy" contacts (Settings › Pushbuttons).
 * The student's own choice is kept in this browser, like the dialog's other preferences;
 * until they make one, the start-up default from `settings.json` applies. While that file
 * is still loading the option is off, so a course that switched it off never sees a
 * bouncing press at start-up.
 */

/** The option in effect: the student's choice, else the start-up default, else off while that loads. */
export function bouncyButtonsInEffect(choice: boolean | null, startupDefault: boolean | null): boolean {
  return choice ?? startupDefault ?? false;
}

export const BOUNCY_BUTTONS = storedSwitch({
  key: 'hdlboard.pushbuttons.bouncy',
  startupDefaultOf: (defaults) => defaults.bouncyButtons,
  inEffect: bouncyButtonsInEffect,
});

export function useBouncyOption(appDefaults: AppDefaults | null): Setting<boolean> {
  return useStoredSetting(BOUNCY_BUTTONS, appDefaults);
}
