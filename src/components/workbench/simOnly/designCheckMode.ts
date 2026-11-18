// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Settings › Editor › Design check (docs/impl_sim_only_warnings.md § 6): the student's
 * choice is kept in this browser; until they make one, `settings.json`'s `designCheck`
 * applies, else *Synthesis*. Storage can be blocked: then the choice holds for this
 * page only. Pure, apart from the storage it is handed.
 */

import type { DesignCheckMode } from './types';

export const DEFAULT_DESIGN_CHECK: DesignCheckMode = 'synthesis';

/**
 * The mode while `settings.json` is still loading: the quiet one, so a course that
 * switched the check off never sees warnings flash at start-up.
 */
export const DESIGN_CHECK_WHILE_LOADING: DesignCheckMode = 'simulation';

export const DESIGN_CHECK_STORAGE_KEY = 'hdlboard.designCheck.v1';

const MODES: readonly DesignCheckMode[] = ['synthesis', 'simulation'];

export const isDesignCheckMode = (value: unknown): value is DesignCheckMode => MODES.includes(value as DesignCheckMode);

/** The mode in effect: the student's choice, else the host's start-up default, else the one while that loads. */
export function designCheckInEffect(choice: DesignCheckMode | null, startupDefault: DesignCheckMode | null): DesignCheckMode {
  return choice ?? startupDefault ?? DESIGN_CHECK_WHILE_LOADING;
}

/** The stored choice, or null when none was made. Never throws. */
export function loadDesignCheckChoice(storage: () => Storage = () => window.localStorage): DesignCheckMode | null {
  try {
    const value = storage().getItem(DESIGN_CHECK_STORAGE_KEY);
    return isDesignCheckMode(value) ? value : null;
  } catch {
    return null;
  }
}

/** Never throws. */
export function saveDesignCheckChoice(mode: DesignCheckMode, storage: () => Storage = () => window.localStorage): void {
  try {
    storage().setItem(DESIGN_CHECK_STORAGE_KEY, mode);
  } catch {
    // The choice holds for this page only.
  }
}
