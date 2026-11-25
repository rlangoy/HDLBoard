// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { AppDefaults } from '../appDefaults';
import type { Setting } from '../settings/settingsSections';
import { useStoredSetting, type StoredSetting } from '../useStoredSetting';
import {
  DEFAULT_DESIGN_CHECK, DESIGN_CHECK_STORAGE_KEY, designCheckInEffect, loadDesignCheckChoice, saveDesignCheckChoice,
} from './designCheckMode';
import type { DesignCheckMode } from './types';

const DESIGN_CHECK: StoredSetting<DesignCheckMode> = {
  key: DESIGN_CHECK_STORAGE_KEY,
  load: () => loadDesignCheckChoice(),
  save: (mode) => saveDesignCheckChoice(mode),
  startupDefaultOf: (defaults) => defaults.designCheck ?? DEFAULT_DESIGN_CHECK,
  inEffect: designCheckInEffect,
};

/** The Design check mode in effect, and how to change it (Settings › Simulation). */
export function useDesignCheckMode(appDefaults: AppDefaults | null): Setting<DesignCheckMode> {
  return useStoredSetting(DESIGN_CHECK, appDefaults);
}
