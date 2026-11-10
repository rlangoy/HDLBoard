// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import { cx } from '../../board';
import type { ThemePreference } from '../../../theme/themePreference';
import { chooseTheme } from '../../../theme/themeStore';
import { useThemeState } from '../../../theme/useTheme';
import { EXAMPLE_LANGUAGES, LANGUAGE_LABEL } from '../examples';
import { withLanguageToggled, type PreferredLanguages } from '../languagePrefs';
import { APP_NAME } from '../project';
import { PageCard } from '../page/PageCard';
import { SettingSwitch } from './SettingSwitch';
import type { Setting } from './settingsSections';
import type { KeepProjectSetting } from './useKeepProject';
import { ThemePreview } from './ThemePreview';

export interface GeneralSectionProps {
  /** The Examples pane opens with these ticked (languagePrefs.ts). */
  languages: Setting<PreferredLanguages>;
  /** The desktop app's project storage; null in a browser. */
  keepProject: KeepProjectSetting | null;
}

/** Settings › General: how HDLBoard looks and the languages you work in. */
export function GeneralSection({ languages, keepProject }: GeneralSectionProps) {
  return (
    <>
      <AppearanceCard />
      <LanguagesCard languages={languages} />
      {keepProject && <DesktopSessionCard keepProject={keepProject} />}
    </>
  );
}

interface ThemeChoice {
  readonly value: ThemePreference;
  readonly label: string;
  readonly note: string;
}

const THEME_CHOICES: readonly ThemeChoice[] = [
  { value: 'light', label: 'Light', note: 'Light background and panels.' },
  { value: 'dark', label: 'Dark', note: 'Dark background and panels.' },
  { value: 'system', label: 'System', note: 'Follow your system settings.' },
];

const THEME_SAVE_FAILED_TEXT = 'Theme changed for this session. Your preference could not be saved.';

/** Applies at once; stored in this browser, never in a project. */
function AppearanceCard() {
  const { preference, saveFailed } = useThemeState();
  const groupName = useId();
  return (
    <PageCard title="Appearance" wide>
      <div className="wb-settings-themes">
        {THEME_CHOICES.map((choice) => {
          const selected = preference === choice.value;
          return (
            <label key={choice.value} className={cx('wb-settings-choice wb-settings-theme', selected && 'is-selected')}>
              <span className="wb-settings-theme__head">
                <input type="radio" name={groupName} value={choice.value} checked={selected} onChange={() => chooseTheme(choice.value)} />
                <strong>{choice.label}</strong>
              </span>
              <ThemePreview theme={choice.value} />
              <span className="wb-settings__note">{choice.note}</span>
            </label>
          );
        })}
      </div>
      {/* Always mounted: a live region that appears already filled is often not announced. */}
      <p className="wb-settings__note wb-settings__note--error" role="status">{saveFailed ? THEME_SAVE_FAILED_TEXT : ''}</p>
    </PageCard>
  );
}

/** Each box on its own; with neither ticked, the Examples pane opens asking for a language. */
function LanguagesCard({ languages }: Pick<GeneralSectionProps, 'languages'>) {
  return (
    <PageCard title="Languages" wide>
      <div className="wb-settings-languages">
        {EXAMPLE_LANGUAGES.map((language) => (
          <label key={language} className="wb-settings-check">
            <input
              type="checkbox"
              checked={languages.value.has(language)}
              onChange={() => languages.onChange(withLanguageToggled(languages.value, language))}
            />
            <strong>{LANGUAGE_LABEL[language]}</strong>
          </label>
        ))}
      </div>
      <p className="wb-settings__note">Choose which languages are selected by default in Examples. You can change this there.</p>
    </PageCard>
  );
}

/** The desktop app's project storage (desktop.ts): stored for the next launch, not what this one runs with. */
function DesktopSessionCard({ keepProject }: { keepProject: KeepProjectSetting }) {
  return (
    <PageCard title="Desktop app" wide>
      <SettingSwitch
        label="Keep my project between sessions"
        description={`Saves your files and the one you were editing on this computer and restores them when ${APP_NAME} starts. Applies after restart.`}
        setting={keepProject.setting}
      />
      {keepProject.saveFailed && <p className="wb-settings__note wb-settings__note--error" role="alert">The setting could not be saved.</p>}
    </PageCard>
  );
}
