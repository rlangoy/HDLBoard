// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
/** React access to the theme store: a theme change re-renders the components that read it. */

import { useSyncExternalStore } from 'react';
import { getThemeState, subscribeTheme, type ThemeState } from './themeStore';
import type { ResolvedTheme } from './themePreference';

/** The store's state is also what a server render (a test's static markup) sees. */
export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribeTheme, getThemeState, getThemeState);
}

export function useResolvedTheme(): ResolvedTheme {
  return useThemeState().resolved;
}
