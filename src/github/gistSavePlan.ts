// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { fingerprintOf, normalizeLineEndings } from '../project/fingerprint';
import type { GistFileChanges, TextFile } from './gistClient';

export { fingerprintOf };

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

/** Windows editors write CRLF; a gist may hand the same text back with LF. */
function isSameText(a: string, b: string): boolean {
  return normalizeLineEndings(a) === normalizeLineEndings(b);
}
