// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A short code that changes when any file's name or text changes, so a project can
 * tell whether its files still match what was last saved or opened without keeping a
 * second copy of every file. Line endings are ignored: a file saved on Windows and
 * read back with LF is the same file. Pure: no I/O.
 */

export interface NamedText {
  name: string;
  content: string;
}

export function fingerprintOf(files: readonly NamedText[]): string {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  return fnv1a(sorted.map((file) => `${file.name}\u0000${normalizeLineEndings(file.content)}`).join('\u0000'));
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX = 16;

/** FNV-1a, 32 bits: a fast checksum, not a security measure. */
function fnv1a(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX).padStart(8, '0');
}
