// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** An error's message, or the thrown value as text. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
