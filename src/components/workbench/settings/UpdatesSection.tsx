// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { UpdateStatusText, type UpdateCheckView } from '../AboutDialog';
import { APP_NAME } from '../project';
import { SettingsCard } from './SettingsCard';
import { SettingSwitch } from './SettingSwitch';
import type { Setting } from './settingsSections';

export interface UpdatesSectionProps {
  /** Ask GitHub for a newer release at start-up (useUpdateCheck.ts); on by default in the Windows app only. */
  checkAtStartUp: Setting<boolean>;
  /** What the last check found, and a way to check now. */
  check: UpdateCheckView;
}

/** Settings › Updates: the version running here, and whether to look for a newer one. */
export function UpdatesSection({ checkAtStartUp, check }: UpdatesSectionProps) {
  return (
    <SettingsCard title="Updates" wide>
      <SettingSwitch label="Check for updates" description="Check GitHub for a new release at startup." setting={checkAtStartUp} />
      <p className="wb-settings-version" aria-live="polite">
        <strong>{APP_NAME} {__APP_VERSION__}</strong> &middot; <UpdateStatusText {...check} />
      </p>
    </SettingsCard>
  );
}
