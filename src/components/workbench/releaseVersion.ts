// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The version number in a release tag: its first run of digits and dots, all
 * other text left out. `v1.6.2` → `1.6.2`, `HDLBoard 1.7` → `1.7`; null when
 * the tag holds no number.
 */
export function versionNumber(tag: string): string | null {
  return /\d+(?:\.\d+)*/.exec(tag)?.[0] ?? null;
}

function versionParts(version: string): number[] {
  return (versionNumber(version) ?? '').split('.').filter(Boolean).map(Number);
}

/**
 * Whether `candidate` is a later version than `current`, compared number by
 * number: 1.10 is later than 1.9, and 1.6 is the same as 1.6.0. A version
 * without a number is never later.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const difference = (candidateParts[i] ?? 0) - (currentParts[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}
