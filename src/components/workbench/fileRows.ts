// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The project's files as the Files panel and the header's file menu both draw
 * them (docs/cleanup_file_tabs.md § 5.4, § 5.5): one row per file, in Files
 * order, with everything a row shows already worked out, so the two lists can
 * never disagree and neither reaches into the analysis or the diagnostics.
 * Pure — no React, no state.
 */

import { FOLDER_ORDER, filesInFolderOrder, type Folder } from './fileKinds';
import type { VhdlFile } from './files';
import type { FileRole } from './tbDetect/types';

export interface ProblemCounts {
  readonly errors: number;
  readonly warnings: number;
}

/** One file as the Files panel and the file menu draw it. */
export interface FileRow {
  readonly id: string;
  readonly name: string;
  readonly folder: Folder;
  readonly role: FileRole | undefined;
  /** In a pane of the editor right now. */
  readonly shown: boolean;
  /** The file Start runs (the blue dot) — independent of `shown`. */
  readonly isTop: boolean;
  readonly problems: ProblemCounts;
}

/** What a row needs from outside the file itself. */
export interface RowContext {
  readonly shownIds: readonly string[];
  readonly topFileId: string | null;
  readonly roleOf: (fileId: string) => FileRole | undefined;
  readonly problemsOf: (fileId: string) => ProblemCounts;
}

export interface FolderRows {
  readonly folder: Folder;
  readonly rows: readonly FileRow[];
}

/** Every file's row, in Files order. */
export function fileRows(files: readonly VhdlFile[], context: RowContext): FileRow[] {
  return filesInFolderOrder(files).map((file) => ({
    id: file.id,
    name: file.name,
    folder: file.folder,
    role: context.roleOf(file.id),
    shown: context.shownIds.includes(file.id),
    isTop: file.id === context.topFileId,
    problems: context.problemsOf(file.id),
  }));
}

/** The rows grouped by folder, in folder order; a folder with no files is left out. */
export function rowsByFolder(rows: readonly FileRow[]): FolderRows[] {
  return FOLDER_ORDER.map((folder) => ({ folder, rows: rows.filter((row) => row.folder === folder) })).filter(
    (group) => group.rows.length > 0,
  );
}

/**
 * The file to show once `deletedId` is deleted (D7): the next one in Files order,
 * the one before it when it was the last, or none when it was the only file.
 */
export function fileAfterDelete(files: readonly VhdlFile[], deletedId: string): string | null {
  const ordered = filesInFolderOrder(files);
  const at = ordered.findIndex((file) => file.id === deletedId);
  if (at < 0) return null;
  return (ordered[at + 1] ?? ordered[at - 1])?.id ?? null;
}
