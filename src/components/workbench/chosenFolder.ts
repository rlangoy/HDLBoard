// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A folder the student chose in a browser (`<input webkitdirectory>`): every file in
 * it and its subfolders, each with its path from the chosen folder in
 * `webkitRelativePath`, e.g. `test_s/DE1_SoC.vhdl`. Pure: no DOM.
 */

import { isProjectFileName } from '../../project/fileName';
import { belongsToLayout, type StoredLayout } from './projectLayout';

export interface ChosenFile {
  name: string;
  /** `folder/name` for a file in the chosen folder itself; empty when the file was not chosen as part of a folder. */
  webkitRelativePath: string;
}

/** The files in the chosen folder itself, not in its subfolders: where its project file is looked for (§ 6.4). */
export function filesDirectlyInFolder<T extends ChosenFile>(files: readonly T[]): T[] {
  return files.filter((file) => (file.webkitRelativePath || file.name).split('/').length <= 2);
}

/** The folder's project file: its first `.hdlboard.json` by name, or undefined when there is none (§ 6.4). */
export function projectFileInFolder<T extends ChosenFile>(files: readonly T[]): T | undefined {
  return filesDirectlyInFolder(files)
    .filter((file) => isProjectFileName(file.name))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
}

/** A file read through a folder handle, tagged with its path relative to the project file's folder. */
export type TaggedFile = File & { readonly relativePath?: string };

/** Tags `file` with where it is relative to the project file's folder (`lab1/src/a.vhd`). */
export function tagPath(file: File, relativePath: string): TaggedFile {
  return Object.assign(file, { relativePath });
}

/** The parts of a chosen, dropped or unpacked file that tell where it was. */
export interface Placed {
  name: string;
  webkitRelativePath?: string;
  relativePath?: string;
  zipPath?: string;
}

const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');

/**
 * Where `file` is relative to the folder of `projectFile` (docs/impl_project_structure.md
 * § 6.4), with `/`: from the .zip both came out of, a folder handle's tag, the folder a
 * browser chose (`webkitRelativePath`), or — in the Windows app — their paths on disk.
 * Undefined when that cannot be told (files picked one by one in a browser), or when the
 * file is outside the project file's folder.
 */
export function pathBeside(file: Placed, projectFile: Placed, diskPathOf?: (file: Placed) => string | undefined): string | undefined {
  if (file.relativePath !== undefined) return file.relativePath;
  if (file.zipPath !== undefined && projectFile.zipPath !== undefined) return inside(folderOf(projectFile.zipPath), file.zipPath);
  if (file.webkitRelativePath && projectFile.webkitRelativePath) return inside(folderOf(projectFile.webkitRelativePath), file.webkitRelativePath);
  const filePath = diskPathOf?.(file);
  const projectPath = diskPathOf?.(projectFile);
  const slashes = (path: string) => path.replace(/\\/g, '/');
  if (filePath && projectPath) return inside(folderOf(slashes(projectPath)), slashes(filePath));
  return undefined;
}

/** `path` relative to `folder` ('' is the top), ignoring case; undefined when it is not inside it. */
function inside(folder: string, path: string): string | undefined {
  if (folder === '') return path;
  return path.toLowerCase().startsWith(`${folder.toLowerCase()}/`) ? path.slice(folder.length + 1) : undefined;
}

/**
 * The files that can belong to a project opened with `others` beside it, each with its
 * path when that can be told (docs/impl_project_structure.md § 6.8): next to the project
 * file, or in its own `<project>/<source folder>/`. Files in other projects' folders are
 * left out, so they never stand in for this project's. A .zip holds one project, so its
 * files are all kept, wherever they are (an older zip has them in `vhdl/…`).
 */
export function filesBesideProject<T extends Placed>(
  projectFile: Placed,
  others: readonly T[],
  layout: StoredLayout,
  diskPathOf?: (file: Placed) => string | undefined,
): { file: T; path?: string }[] {
  return others
    .map((file) => ({ file, path: pathBeside(file, projectFile, diskPathOf) }))
    .filter(({ file, path }) => path === undefined || file.zipPath !== undefined || belongsToLayout(path, layout))
    .map(({ file, path }) => (path === undefined ? { file } : { file, path }));
}
