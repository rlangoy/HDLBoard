// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { GistFileChanges, TextFile } from './gistClient';

/**
 * Which gist files must change so the gist holds the project as it is in HDLBoard.
 * HDLBoard is the source of truth when saving; the gist's other files are left alone
 * unless they used to belong to the project. Pure: no I/O.
 */

export type FileChangeKind = 'add' | 'update' | 'delete';

export interface FileChange {
  kind: FileChangeKind;
  fileName: string;
}

export interface GistSavePlan {
  changes: FileChange[];
  unchangedFileNames: string[];
}

/**
 * @param files what the gist must hold: the project file and the project's files
 * @param remote what the gist holds now
 * @param removable gist files that may be deleted when `files` no longer has them
 *   (files that left the project); everything else on the gist is kept
 */
export function planGistSave(files: readonly TextFile[], remote: readonly TextFile[], removable: ReadonlySet<string>): GistSavePlan {
  const remoteContentByName = new Map(remote.map((file) => [file.name, file.content]));
  const wanted = new Set(files.map((file) => file.name));
  const changes: FileChange[] = [];
  const unchangedFileNames: string[] = [];

  for (const file of files) {
    const remoteContent = remoteContentByName.get(file.name);
    if (remoteContent === undefined) changes.push({ kind: 'add', fileName: file.name });
    else if (isSameText(remoteContent, file.content)) unchangedFileNames.push(file.name);
    else changes.push({ kind: 'update', fileName: file.name });
  }
  for (const file of remote) {
    if (!wanted.has(file.name) && removable.has(file.name)) changes.push({ kind: 'delete', fileName: file.name });
  }
  return { changes, unchangedFileNames };
}

export function isUpToDate(plan: GistSavePlan): boolean {
  return plan.changes.length === 0;
}

export function toGistFileChanges(plan: GistSavePlan, files: readonly TextFile[]): GistFileChanges {
  const contentByName = new Map(files.map((file) => [file.name, file.content]));
  const changes: GistFileChanges = {};
  for (const change of plan.changes) {
    changes[change.fileName] = change.kind === 'delete' ? null : { content: contentByName.get(change.fileName) ?? '' };
  }
  return changes;
}

/**
 * A short code that changes when any file's name or text changes, so the page can
 * tell whether the project still matches what was last saved to (or opened from)
 * GitHub without keeping a second copy of every file. Line endings are ignored.
 */
export function fingerprintOf(files: readonly TextFile[]): string {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  return fnv1a(sorted.map((file) => `${file.name}\u0000${normalizeLineEndings(file.content)}`).join('\u0000'));
}

/** Windows editors write CRLF; a gist may hand the same text back with LF. */
function isSameText(a: string, b: string): boolean {
  return normalizeLineEndings(a) === normalizeLineEndings(b);
}

function normalizeLineEndings(text: string): string {
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
