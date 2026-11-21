// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { loadAppDefaults, type AppDefaults } from './appDefaults';
import type { Setting } from './settings/settingsSections';
import { loadStoredChoice, saveStoredChoice } from './storedChoice';

export interface StoredSwitch {
  /** Where this browser keeps the student's choice (storedChoice.ts). */
  readonly key: string;
  /** The host's start-up default from `settings.json`, when the file sets one. */
  readonly startupDefaultOf: (defaults: AppDefaults) => boolean | undefined;
  /** The value from the student's choice and the start-up default, either null while unknown. */
  readonly inEffect: (choice: boolean | null, startupDefault: boolean | null) => boolean;
}

/**
 * An on/off setting from Settings that `settings.json` can default: the student's choice,
 * kept in this browser, wins over the file. A choice made in another tab is followed.
 */
export function useStoredSwitch({ key, startupDefaultOf, inEffect }: StoredSwitch): Setting<boolean> {
  // Kept in state as well as storage, so a choice made this session holds even when storage is blocked.
  const [choice, setChoice] = useState(() => loadStoredChoice(key));
  const [startupDefault, setStartupDefault] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAppDefaults().then(({ defaults }) => {
      if (!cancelled) setStartupDefault(startupDefaultOf(defaults) ?? null);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setChoice(loadStoredChoice(key));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
    // Read once, like the storage itself: each switch's definition is a module constant.
  }, []);
  const onChange = (on: boolean) => {
    saveStoredChoice(key, on);
    setChoice(on);
  };
  return { value: inEffect(choice, startupDefault), onChange };
}
