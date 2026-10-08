// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { PROJECT_FILE_EXTENSION } from './types';

/** Characters and sequences a project file name must not contain (§ 5.1). */
export const FORBIDDEN_NAME_PARTS = ['/', '\\', '..', ':', '*', '?', '"', '<', '>', '|'] as const;

/** Returns why `name` is not a valid project file name, or null when it is valid. */
export function fileNameProblem(name: string): string | null {
  if (name.trim() === '') return 'file name is empty';
  const forbidden = FORBIDDEN_NAME_PARTS.find((part) => name.includes(part));
  return forbidden ? `file name contains forbidden "${forbidden}"` : null;
}

export function isValidFileName(name: string): boolean {
  return fileNameProblem(name) === null;
}

/** File names are compared case-insensitively everywhere (§ 5.1). */
export function nameKey(name: string): string {
  return name.toLowerCase();
}

export function sameFileName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

export function isProjectFileName(name: string): boolean {
  return nameKey(name).endsWith(PROJECT_FILE_EXTENSION);
}

/** Last segment of a path or URL path, e.g. `counter.hdlboard.json`. */
export function baseName(location: string): string {
  const withoutQuery = location.split(/[?#]/)[0];
  const segments = withoutQuery.split(/[/\\]/).filter((segment) => segment !== '');
  return decodeURIComponent(segments[segments.length - 1] ?? '');
}

/** Folder a project is stored in: its file name without `.hdlboard.json`, e.g. `adder-and-counter`. */
export function projectFolderName(projectFileName: string): string {
  const name = isProjectFileName(projectFileName)
    ? projectFileName.slice(0, -PROJECT_FILE_EXTENSION.length)
    : projectFileName;
  return name.trim() === '' ? 'project' : name;
}
