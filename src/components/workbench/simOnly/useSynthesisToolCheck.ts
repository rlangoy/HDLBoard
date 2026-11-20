// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { loadAppDefaults } from '../appDefaults';
import type { Setting } from '../settings/settingsSections';
import { loadStoredChoice, saveStoredChoice } from '../storedChoice';

/**
 * Settings › Simulation › Design check › *Synthesis*: the live quick check alone, or also
 * GHDL's or Icarus's own synthesis check at Start (docs/impl_sim_only_warnings.md § 7).
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

/** The tool check's setting, and how to change it; a choice made in another tab is followed. */
export function useSynthesisToolCheck(): Setting<boolean> {
  // Kept in state as well as storage, so a choice made this session holds even when storage is blocked.
  const [choice, setChoice] = useState(() => loadStoredChoice(SYNTHESIS_TOOL_CHECK_KEY));
  const [startupDefault, setStartupDefault] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAppDefaults().then(({ defaults }) => {
      if (!cancelled) setStartupDefault(defaults.synthesisToolCheck ?? DEFAULT_SYNTHESIS_TOOL_CHECK);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === SYNTHESIS_TOOL_CHECK_KEY || event.key === null) setChoice(loadStoredChoice(SYNTHESIS_TOOL_CHECK_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const onChange = (on: boolean) => {
    saveStoredChoice(SYNTHESIS_TOOL_CHECK_KEY, on);
    setChoice(on);
  };
  return { value: synthesisToolCheckInEffect(choice, startupDefault), onChange };
}
