// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import type { Setting } from './settingsSections';

export interface SettingSwitchProps {
  label: string;
  description: ReactNode;
  setting: Setting<boolean>;
}

/** An on/off setting: a switch, its name and what it does. */
export function SettingSwitch({ label, description, setting }: SettingSwitchProps) {
  return (
    <label className="wb-settings-switch">
      <input
        type="checkbox"
        role="switch"
        className="wb-settings-switch__input"
        checked={setting.value}
        onChange={(event) => setting.onChange(event.target.checked)}
      />
      <span className="wb-settings-switch__track" aria-hidden="true" />
      <span className="wb-settings-switch__text">
        <strong>{label}</strong>
        <span className="wb-settings__note">{description}</span>
      </span>
    </label>
  );
}
