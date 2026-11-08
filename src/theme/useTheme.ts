// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useSyncExternalStore } from 'react';
import { getThemeState, subscribeTheme, type ThemeState } from './themeStore';
import type { ResolvedTheme } from './themePreference';

export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribeTheme, getThemeState);
}

export function useResolvedTheme(): ResolvedTheme {
  return useThemeState().resolved;
}
