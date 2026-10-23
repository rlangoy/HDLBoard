// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Shape checks for JSON read from a project file. Plain TypeScript, like the rest of `src/project/`. */

/** A JSON object: not null, not an array. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
