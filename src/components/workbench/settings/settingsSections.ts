// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The Settings page's sections, each one setting's single home (issue #42). */
export type SettingsSectionId = 'general' | 'board' | 'editor' | 'simulation' | 'updates' | 'help';

export interface SettingsSection {
  readonly id: SettingsSectionId;
  readonly label: string;
}

/** The settings themselves, in the sidebar's order. */
export const PREFERENCE_SECTIONS: readonly SettingsSection[] = [
  { id: 'general', label: 'General' },
  { id: 'board', label: 'Board & I/O' },
  { id: 'editor', label: 'Editor' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'updates', label: 'Updates' },
];

/** Below the settings, ruled off: not a setting, a way to reach the authors. */
export const SUPPORT_SECTIONS: readonly SettingsSection[] = [{ id: 'help', label: 'Help & feedback' }];

export const FIRST_SECTION: SettingsSectionId = 'general';

export function sectionLabel(id: SettingsSectionId): string {
  const section = [...PREFERENCE_SECTIONS, ...SUPPORT_SECTIONS].find((candidate) => candidate.id === id);
  return section?.label ?? '';
}

/** A setting's current value and how to change it; every change is saved at once. */
export interface Setting<T> {
  readonly value: T;
  readonly onChange: (value: T) => void;
}
