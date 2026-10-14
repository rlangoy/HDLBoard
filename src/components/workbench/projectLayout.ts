// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where a project's files live on local disk (docs/impl_project_structure.md):
 * `<projectDirectory>/<sourceDirectory>/<name>`, next to the project file. The project
 * folder is always the project file name without `.hdlboard.json` (D2); the source folder
 * is the project's own, `src` unless the student changes it (D3). Everything here is
 * derived from the project, never stored beside it, so it cannot disagree with it.
 * Pure: no React, no disk.
 */

import { folderNameProblem, nameKey, projectFolderName } from '../../project/fileName';
import { DEFAULT_SOURCE_DIRECTORY } from '../../project/types';
import { diskPath } from '../../project/resolveSource';
import type { OpenProject } from './projectFile';

type Located = Pick<OpenProject, 'fileName' | 'sourceDirectory'>;

/** The project folder: the project file name without `.hdlboard.json` (D2). */
export function projectDirectoryOf(project: Pick<OpenProject, 'fileName'>): string {
  return projectFolderName(project.fileName);
}

/** `<projectDirectory>/<sourceDirectory>`: the folder the project's files are saved in. */
export function sourceFolderOf(project: Located): string {
  return `${projectDirectoryOf(project)}/${project.sourceDirectory}`;
}

/** Where `name` is saved, relative to the project file's folder. */
export function targetPathOf(project: Located, name: string): string {
  return diskPath(projectDirectoryOf(project), project.sourceDirectory, name);
}

/** Paths are compared ignoring case, like file names (D22). */
export function samePath(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** The folder part of a relative path: `fantasicleds/src/x.vhd` → `fantasicleds/src`; '' for a flat file. */
export function folderOfRelative(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

export type DiskLayout = 'none' | 'flat' | 'folders' | 'mixed';

/**
 * How the project is stored on disk now (§ 6.1): 'none' when it is not on disk (a gist,
 * a URL, a new project), 'flat' when every file is next to the project file, 'folders'
 * when every file is at its target, and 'mixed' otherwise — some file sits flat or in
 * an old folder, and the next save copies or moves it. Files with no place on disk yet
 * (added since the last save) do not count.
 */
export function diskLayout(project: Located & Pick<OpenProject, 'onDisk'>): DiskLayout {
  const entries = Object.entries(project.onDisk ?? {});
  if (entries.length === 0) return 'none';
  const places = entries.map(([key, path]) => {
    if (samePath(path, targetPathOf(project, key))) return 'target';
    return path.includes('/') ? 'old' : 'flat';
  });
  if (places.every((place) => place === 'target')) return 'folders';
  if (places.every((place) => place === 'flat')) return 'flat';
  return 'mixed';
}

/** What the next save does to the files already on disk, for the project page's hint (§ 7). */
export interface PendingLayoutChange {
  /** Files found flat are copied to the source folder (D9). */
  copy: boolean;
  /** Files in another folder are moved to the source folder (D10, D11). */
  move: boolean;
  /**
   * The folder the files are in now, when the project file was renamed outside HDLBoard:
   * its name no longer matches the folder its files were found in (§ 3.2).
   */
  renamedOutsideFrom?: string;
}

export function pendingLayoutChange(project: Located & Pick<OpenProject, 'onDisk' | 'onDiskFileName'>): PendingLayoutChange {
  const paths = Object.entries(project.onDisk ?? {});
  const away = paths.filter(([key, path]) => !samePath(path, targetPathOf(project, key)));
  const copy = away.some(([, path]) => !path.includes('/'));
  const moved = away.filter(([, path]) => path.includes('/'));
  const change: PendingLayoutChange = { copy, move: moved.length > 0 };
  // The project file still has the name it was opened with, yet its files are in another
  // project folder: it was renamed in Explorer, say.
  const unrenamed = project.onDiskFileName === undefined || samePath(project.onDiskFileName, project.fileName);
  const oldFolder = moved.length > 0 ? folderOfRelative(moved[0][1]) : '';
  const oldProjectFolder = oldFolder.split('/')[0];
  if (unrenamed && oldFolder !== '' && !samePath(oldProjectFolder, projectDirectoryOf(project))) change.renamedOutsideFrom = oldFolder;
  return change;
}

/** The folders a project file names, for finding its files before it is opened. */
export interface StoredLayout {
  projectDirectory: string;
  sourceDirectory: string;
}

/**
 * The folders a project file's text names (§ 3.2), or the defaults — the project file
 * name and `src` — when it leaves them out, names invalid ones, or is no JSON at all.
 */
export function storedLayout(text: string, projectFileName: string): StoredLayout {
  const fallback = { projectDirectory: projectFolderName(projectFileName), sourceDirectory: DEFAULT_SOURCE_DIRECTORY };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const valid = (value: unknown) => typeof value === 'string' && folderNameProblem(value) === null;
  return {
    projectDirectory: valid(r.projectDirectory) ? (r.projectDirectory as string) : fallback.projectDirectory,
    sourceDirectory: valid(r.sourceDirectory) ? (r.sourceDirectory as string) : fallback.sourceDirectory,
  };
}

/**
 * Whether a file at `path` (relative to the project file's folder) can belong to the
 * project: next to the project file, or in its own `<projectDirectory>/<sourceDirectory>/`.
 * Files of other projects in the same folder are left out, so they never stand in (§ 6.8).
 */
export function belongsToLayout(path: string, layout: StoredLayout): boolean {
  if (!path.includes('/')) return true;
  return samePath(folderOfRelative(path), `${layout.projectDirectory}/${layout.sourceDirectory}`);
}
