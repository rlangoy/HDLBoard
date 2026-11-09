// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import { desktopBridge } from '../desktop';
import type { Setting } from './settingsSections';

/** Settings › General › Keep my project between sessions, in the desktop app. */
export interface KeepProjectSetting {
  readonly setting: Setting<boolean>;
  /** The desktop app could not store the last choice; the switch shows the old one again. */
  readonly saveFailed: boolean;
}

/**
 * What is stored for the next launch (desktop.ts): `bridge.enabled` is what this launch
 * runs with, and never changes, so the choice made since is kept here, by the workbench,
 * for as long as the app runs. Null outside the desktop app.
 */
export function useKeepProject(): KeepProjectSetting | null {
  const bridge = desktopBridge();
  const [value, setValue] = useState(() => bridge?.enabled ?? false);
  const [saveFailed, setSaveFailed] = useState(false);
  if (!bridge) return null;
  const onChange = (next: boolean) => {
    setValue(next);
    setSaveFailed(false);
    bridge.setEnabled(next).catch(() => {
      setValue(!next);
      setSaveFailed(true);
    });
  };
  return { setting: { value, onChange }, saveFailed };
}
