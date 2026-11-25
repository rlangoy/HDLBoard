// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import type { AppDefaults } from './appDefaults';
import type { Setting } from './settings/settingsSections';
import { loadStoredChoice, saveStoredChoice } from './storedChoice';

/** A setting from Settings that `settings.json` can default. Each is a module constant. */
export interface StoredSetting<T> {
  /** Where this browser keeps the student's choice. */
  readonly key: string;
  /** The stored choice, or null when none was made. Never throws. */
  readonly load: () => T | null;
  /** Never throws. */
  readonly save: (value: T) => void;
  /** The host's start-up default, when the file sets one. */
  readonly startupDefaultOf: (defaults: AppDefaults) => T | undefined;
  /** The value from the student's choice and the start-up default, either null while unknown. */
  readonly inEffect: (choice: T | null, startupDefault: T | null) => T;
}

export type StoredSwitch = Omit<StoredSetting<boolean>, 'load' | 'save'>;

/** An on/off setting, stored as `on` or `off` (storedChoice.ts). */
export function storedSwitch(definition: StoredSwitch): StoredSetting<boolean> {
  return {
    ...definition,
    load: () => loadStoredChoice(definition.key),
    save: (on) => saveStoredChoice(definition.key, on),
  };
}

/** Hands `onChange` the stored choice each time another tab changes it; returns the unsubscribe. */
export function followOtherTabs<T>(setting: StoredSetting<T>, onChange: (choice: T | null) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // No key: the other tab cleared all of this site's storage.
    const storageCleared = event.key === null;
    if (event.key === setting.key || storageCleared) onChange(setting.load());
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/**
 * The setting in effect, and how to change it. The student's choice, kept in this browser,
 * wins over the start-up default from `settings.json` (useAppDefaults.ts), which is
 * `appDefaults`, null while the file loads. A choice made in another tab is followed.
 */
export function useStoredSetting<T>(setting: StoredSetting<T>, appDefaults: AppDefaults | null): Setting<T> {
  // Kept in state as well as storage, so a choice made this session holds even when storage is blocked.
  const [choice, setChoice] = useState(setting.load);
  useEffect(() => followOtherTabs(setting, setChoice), [setting]);
  const startupDefault = appDefaults === null ? null : setting.startupDefaultOf(appDefaults) ?? null;
  const onChange = (value: T) => {
    setting.save(value);
    setChoice(value);
  };
  return { value: setting.inEffect(choice, startupDefault), onChange };
}
