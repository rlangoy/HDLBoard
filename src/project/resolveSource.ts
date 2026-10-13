// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ProjectFileEntry } from './types';
import { isHttpUrl } from './url';

/**
 * Where a file entry's content is loaded from (§ 5):
 * a non-empty `url` is used as-is; otherwise `name` in the project directory.
 * `projectLocation` is the project file's path or http(s) URL.
 */
export function resolveSource(entry: ProjectFileEntry, projectLocation: string): string {
  if (entry.url !== '') return entry.url;
  if (isHttpUrl(projectLocation)) return new URL(entry.name, projectLocation).toString();
  return joinPath(dirname(projectLocation), entry.name);
}

/** True when the entry's content comes from the project directory, not its own URL. */
export function isInProjectDirectory(entry: ProjectFileEntry): boolean {
  return entry.url === '';
}

function dirname(path: string): string {
  const lastSeparator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSeparator < 0 ? '' : path.slice(0, lastSeparator);
}

function joinPath(directory: string, name: string): string {
  if (directory === '') return name;
  const separator = directory.includes('\\') && !directory.includes('/') ? '\\' : '/';
  return `${directory}${separator}${name}`;
}

/**
 * Where a project's file is kept on local disk, relative to the project file's folder:
 * `<projectDirectory>/<sourceDirectory>/<name>` (docs/impl_project_structure.md § 6.3).
 * Always `/`; the Windows app turns it into `\`.
 */
export function diskPath(projectDirectory: string, sourceDirectory: string, name: string): string {
  return `${projectDirectory}/${sourceDirectory}/${name}`;
}
