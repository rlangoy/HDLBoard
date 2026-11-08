// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useId } from 'react';
import type { ThemePreference } from '../../theme/themePreference';
import { chooseTheme } from '../../theme/themeStore';
import { useThemeState } from '../../theme/useTheme';

interface ThemeChoice {
  readonly value: ThemePreference;
  readonly label: string;
  readonly note: string;
}

const THEME_CHOICES: readonly ThemeChoice[] = [
  { value: 'light', label: 'Light', note: 'The standard light appearance.' },
  { value: 'dark', label: 'Dark', note: 'Near-black surfaces for dark rooms.' },
  { value: 'system', label: 'System', note: "Follow the operating system's light or dark setting." },
];

export const THEME_SAVE_FAILED_TEXT = 'Theme changed for this session. Your preference could not be saved.';

/** Settings → Appearance. Applies at once; stored in this browser, never in a project. */
export function ThemeSetting() {
  const { preference, saveFailed } = useThemeState();
  const groupName = useId();
  return (
    <fieldset className="wb-settings__group">
      <legend className="wb-settings__heading">Appearance</legend>
      {THEME_CHOICES.map((choice) => (
        <label key={choice.value} className="wb-settings__option">
          <input type="radio" name={groupName} value={choice.value} checked={preference === choice.value} onChange={() => chooseTheme(choice.value)} />
          <span>
            <strong>{choice.label}</strong>
            <span className="wb-settings__note">{choice.note}</span>
          </span>
        </label>
      ))}
      {/* Always mounted: a live region that appears already filled is often not announced. */}
      <p className="wb-settings__note" role="status">{saveFailed ? THEME_SAVE_FAILED_TEXT : ''}</p>
    </fieldset>
  );
}
