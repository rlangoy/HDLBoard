// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { usePageState, type OverlayControl, type PageState } from '../page/usePageState';
import { FIRST_SECTION, type SettingsSectionId } from './settingsSections';

export type SettingsPageState = PageState<SettingsSectionId>;

/**
 * The Settings page, in the editor's place. Opening it asks the board settings about
 * unsaved edits first, as every page change there does. The Explorer folds away while it
 * is shown (usePageFold, paneFolds.ts).
 */
export function useSettingsPage(control: OverlayControl): SettingsPageState {
  return usePageState('settings', FIRST_SECTION, control);
}
