// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { loadAppDefaults } from '../appDefaults';
import type { Setting } from '../settings/settingsSections';
import {
  DEFAULT_DESIGN_CHECK, DESIGN_CHECK_STORAGE_KEY, designCheckInEffect, loadDesignCheckChoice, saveDesignCheckChoice,
} from './designCheckMode';
import type { DesignCheckMode } from './types';

/**
 * The Design check mode in effect, and how to change it (Settings › Simulation). A choice
 * made in another tab is followed. `settings.json`'s warnings are logged by
 * useBouncyOption, which reads the same file.
 */
export function useDesignCheckMode(): Setting<DesignCheckMode> {
  // Kept in state as well as storage, so a choice made this session holds even when storage is blocked.
  const [choice, setChoice] = useState(() => loadDesignCheckChoice());
  const [startupDefault, setStartupDefault] = useState<DesignCheckMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAppDefaults().then(({ defaults }) => {
      if (!cancelled) setStartupDefault(defaults.designCheck ?? DEFAULT_DESIGN_CHECK);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === DESIGN_CHECK_STORAGE_KEY || event.key === null) setChoice(loadDesignCheckChoice());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const onChange = (mode: DesignCheckMode) => {
    saveDesignCheckChoice(mode);
    setChoice(mode);
  };
  return { value: designCheckInEffect(choice, startupDefault), onChange };
}
