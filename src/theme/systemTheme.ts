// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function darkSchemeQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : null;
}

/** False when the OS preference cannot be read. */
export function systemPrefersDark(): boolean {
  return darkSchemeQuery()?.matches ?? false;
}

/**
 * Calls `onChange` when the OS switches between light and dark. Returns the unsubscribe function.
 * An engine without MediaQueryList events (Safari < 14) is not observed: System then keeps the
 * theme it started with, rather than stopping the app before its first render.
 */
export function subscribeSystemTheme(onChange: () => void): () => void {
  const query = darkSchemeQuery();
  if (query === null || typeof query.addEventListener !== 'function') return () => undefined;
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
