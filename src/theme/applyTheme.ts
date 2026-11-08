// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import type { ResolvedTheme } from './themePreference';

/** Selects the theme profile (themes/*.css) for the whole document, portals included. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}
