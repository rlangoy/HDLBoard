// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { AppDefaults } from '../appDefaults';
import type { Setting } from '../settings/settingsSections';
import { storedSwitch, useStoredSetting } from '../useStoredSetting';

/**
 * Settings › Simulation › Design check › *Synthesis*: the live quick check alone, or also
 * GHDL's own synthesis check at Start, for VHDL (docs/impl_sim_only_warnings.md § 7).
 * The student's choice is kept in this browser; until they make one, `settings.json`'s
 * `synthesisToolCheck` applies, else off. It means nothing in *Simulation only* mode.
 */

export const SYNTHESIS_TOOL_CHECK_KEY = 'hdlboard.synthesisToolCheck.v1';

/** Off: a run starts no process of its own on a shared server unless a host or student asks. */
export const DEFAULT_SYNTHESIS_TOOL_CHECK = false;

/** The choice in effect: the student's, else the host's start-up default, else off (also while that loads). */
export function synthesisToolCheckInEffect(choice: boolean | null, startupDefault: boolean | null): boolean {
  return choice ?? startupDefault ?? DEFAULT_SYNTHESIS_TOOL_CHECK;
}

const SYNTHESIS_TOOL_CHECK = storedSwitch({
  key: SYNTHESIS_TOOL_CHECK_KEY,
  startupDefaultOf: (defaults) => defaults.synthesisToolCheck,
  inEffect: synthesisToolCheckInEffect,
});

/** The tool check's setting, and how to change it. */
export function useSynthesisToolCheck(appDefaults: AppDefaults | null): Setting<boolean> {
  return useStoredSetting(SYNTHESIS_TOOL_CHECK, appDefaults);
}
