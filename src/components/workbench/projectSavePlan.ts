// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Save project to local disk (docs/impl_project_structure.md § 6.5): one pure function
 * decides every write, delete and clash before anything touches the disk, and
 * runSavePlan carries it out in a safe order. Paths are relative to the project file's
 * folder, always with `/`, and compared ignoring case (D22).
 *
 * - A file not on disk yet, or already at its target: written there.
 * - A file next to the project file (a flat project): copied to its target; the flat one stays (D9).
 * - A file in another folder (the source folder changed, the project file was renamed): moved (D10, D11).
 * - A target that is already on disk and is not the file's own: a clash, asked about first (D12).
 */

import { nameKey } from '../../project/fileName';
import type { OpenProject } from './projectFile';
import { folderOfRelative, samePath, sourceFolderOf, targetPathOf } from './projectLayout';

export interface PlannedWrite {
  path: string;
  text: string;
}

export interface SavePlan {
  /** Every file to write, the project file last. */
  writes: PlannedWrite[];
  /** Run only after every write succeeded: the old places of moved files, and the old project file after a rename. */
  deletes: string[];
  /** Write targets already on disk that are not the file's own place: ask before overwriting. Full relative paths. */
  clashes: string[];
  /** Where every file is once the plan has run, by nameKey: the project's next `onDisk`. */
  onDisk: Record<string, string>;
}

/**
 * The plan for saving `files` (the project's files, as they are in Files) and the project
 * file. `projectFile.text` is the project file as it reads now (projectFileText), not the
 * last saved text. `exists` holds the relative paths on disk now, by nameKey (existingPaths).
 */
export function planDiskSave(
  project: Pick<OpenProject, 'fileName' | 'sourceDirectory' | 'onDisk' | 'onDiskFileName' | 'ownWrites'>,
  files: readonly { name: string; text: string }[],
  projectFile: { name: string; text: string },
  exists: ReadonlySet<string>,
): SavePlan {
  const writes: PlannedWrite[] = [];
  const deletes: string[] = [];
  const clashes: string[] = [];
  const onDisk: Record<string, string> = {};
  const onDiskNow = project.onDisk ?? {};
  // Copies an earlier save wrote before it failed are this project's own, not clashes.
  const ownWrites = new Set((project.ownWrites ?? []).map(nameKey));

  const place = (path: string, text: string, old: string | undefined) => {
    // Its own place, whatever the case: written over, never deleted (a case-only change is no move).
    const own = old !== undefined && samePath(old, path);
    if (!own && exists.has(nameKey(path)) && !ownWrites.has(nameKey(path))) clashes.push(path);
    writes.push({ path, text });
    return own;
  };

  for (const file of files) {
    const key = nameKey(file.name);
    const target = targetPathOf(project, file.name);
    const old = onDiskNow[key];
    const own = place(target, file.text, old);
    onDisk[key] = target;
    // A file in another folder moves; one next to the project file is copied and stays (D9).
    if (old !== undefined && !own && old.includes('/')) deletes.push(old);
  }

  const oldProjectFile = project.onDiskFileName;
  const ownProjectFile = place(projectFile.name, projectFile.text, oldProjectFile);
  if (oldProjectFile !== undefined && !ownProjectFile) deletes.push(oldProjectFile);

  // Never delete what this save writes.
  const written = new Set(writes.map((write) => nameKey(write.path)));
  return { writes, deletes: deletes.filter((path) => !written.has(nameKey(path))), clashes, onDisk };
}

/** The folders whose listings make up `exists`: the project file's own folder ('') and the source folder. */
export function foldersToList(project: Pick<OpenProject, 'fileName' | 'sourceDirectory'>): string[] {
  return ['', sourceFolderOf(project)];
}

/** `exists` from the listings of foldersToList: relative paths by nameKey. */
export function existingPaths(listings: ReadonlyMap<string, readonly string[]>): Set<string> {
  const paths = new Set<string>();
  for (const [folder, names] of listings) {
    for (const name of names) paths.add(nameKey(folder === '' ? name : `${folder}/${name}`));
  }
  return paths;
}

/** The disk a plan runs against: a folder in the Windows app, or a folder handle in Chrome and Edge. */
export interface SaveDisk {
  /** The file names directly in `folder` (relative; '' is the project file's folder); none when it does not exist. */
  list(folder: string): Promise<string[]>;
  /** Writes `path`, creating its folders. */
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Removes `folder` only if it is empty; rejects otherwise. */
  removeEmptyFolder(folder: string): Promise<void>;
  /** Whether `folder` holds nothing at all, files or folders. */
  isEmptyFolder(folder: string): Promise<boolean>;
}

/** A write failed: nothing was deleted, and the old project file still names the old places. */
export class SaveWriteError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
    readonly written: readonly string[],
  ) {
    super(`could not write ${path}: ${reason}`);
    this.name = 'SaveWriteError';
  }
}

export interface SaveOutcome {
  /** Old copies a delete failed for: harmless strays the student can remove (§ 6.5). */
  leftBehind: { path: string; reason: string }[];
  /** Folders this save emptied, for the project page's Remove folder (D13). */
  emptiedFolders: string[];
}

/** Lists the folders a plan needs and returns `exists` (§ 6.6): two listings, not one probe per file. */
export async function readExisting(disk: SaveDisk, project: Pick<OpenProject, 'fileName' | 'sourceDirectory'>): Promise<Set<string>> {
  const folders = foldersToList(project);
  const listings = await Promise.all(folders.map(async (folder) => [folder, await disk.list(folder)] as const));
  return existingPaths(new Map(listings));
}

/**
 * Runs a plan: every write first, the project file last, then the deletes. A failed write
 * stops there, before any delete (SaveWriteError). A failed delete does not fail the save.
 */
export async function runSavePlan(plan: SavePlan, disk: SaveDisk): Promise<SaveOutcome> {
  const written: string[] = [];
  for (const { path, text } of plan.writes) {
    try {
      await disk.write(path, text);
    } catch (error) {
      throw new SaveWriteError(path, errorReason(error), written);
    }
    written.push(path);
  }
  const leftBehind: SaveOutcome['leftBehind'] = [];
  for (const path of plan.deletes) {
    try {
      await disk.remove(path);
    } catch (error) {
      leftBehind.push({ path, reason: errorReason(error) });
    }
  }
  const emptiedFolders: string[] = [];
  const oldFolders = [...new Set(plan.deletes.map(folderOfRelative).filter((folder) => folder !== ''))];
  for (const folder of oldFolders) {
    if (await disk.isEmptyFolder(folder).catch(() => false)) emptiedFolders.push(folder);
  }
  return { leftBehind, emptiedFolders };
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
