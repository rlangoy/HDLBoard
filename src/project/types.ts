// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Project file data model (docs/Impl_project_file_and_online_storage.md § 4).
 * Everything in `src/project/` is plain TypeScript: no React, no HDLBoard.
 */

export const PROJECT_FILE_EXTENSION = '.hdlboard.json';
export const SUPPORTED_PROJECT_VERSION = 1;

export interface ProjectFileEntry {
  /** File name in the project directory, no path separators (§ 5.1). */
  name: string;
  /** Absolute http(s) URL, or "" when the file is not stored/synced to a URL. */
  url: string;
  description: string;
}

export interface HdlBoardProject {
  version: number;
  name: string;
  /** Board name only; board definitions are built into HDLBoard (§ 4.2). */
  board: string;
  description: string;
  files: ProjectFileEntry[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** The project file entry the diagnostic is about, if any. */
  fileName?: string;
}

/** A file entry that validation rejected, kept so the UI can list it as "skipped". */
export interface SkippedEntry {
  name: string;
  reason: string;
}
