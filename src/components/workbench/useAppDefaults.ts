// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { loadAppDefaults, type AppDefaults } from './appDefaults';

/**
 * The start-up defaults from `settings.json`, or null while the file loads. The Workbench
 * reads them once and hands them to each setting the file can default (useStoredSetting.ts),
 * so the file is fetched once per page load and its warnings are logged once.
 */
export function useAppDefaults(): AppDefaults | null {
  const [appDefaults, setAppDefaults] = useState<AppDefaults | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAppDefaults().then(({ defaults, warnings }) => {
      if (cancelled) return;
      for (const warning of warnings) console.warn(`hdl-board: ${warning}`);
      setAppDefaults(defaults);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return appDefaults;
}
