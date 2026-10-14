// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';

// Every source file under src/, as text; tests are left out.
const SOURCES: Record<string, string> = import.meta.glob(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

// confirm/alert/prompt called on their own or on window — not some object's .confirm().
const NATIVE_DIALOG_CALL = /(?<![\w.])(?:window\.)?(?:confirm|alert|prompt)\s*\(/g;

function nativeDialogCalls(): string[] {
  return Object.entries(SOURCES).flatMap(([path, text]) =>
    (text.match(NATIVE_DIALOG_CALL) ?? []).map((call) => `${path}: ${call}`),
  );
}

describe('native dialogs', () => {
  // On Windows, Electron's confirm/alert/prompt boxes leave the page without
  // keyboard focus, so the editors take no typing. Ask through confirmDialog
  // (desktop.ts); its browser fallback is the one call allowed.
  it('are only called from the browser fallback in confirmDialog', () => {
    expect(nativeDialogCalls()).toEqual(['./desktop.ts: window.confirm(']);
  });
});
