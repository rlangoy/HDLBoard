// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Finding the project files in the projects folder (docs/project_browse_page.md § 6): the
 * folder itself and the folders directly inside it, never deeper. Works on a folder handle
 * (Chrome, Edge), on the files a `webkitdirectory` input chose (Firefox, Safari), or on what the
 * Windows app read (itemsFromListing). No React.
 */

import { isProjectFileName } from '../../project/fileName';
import type { LocalProjectsListing } from './desktop';
import { itemFromProjectFile, type ProjectListItem } from './projectCatalog';
import type { PickedFolder } from './projectSave';

export const MAX_LISTED_PROJECTS = 200;
export const MAX_PROJECT_FILE_BYTES = 1024 * 1024;

export interface FolderFile {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}

/** The parts of a FileSystemDirectoryHandle used here (not every TypeScript DOM library has them all). */
export interface FolderHandle extends PickedFolder {
  readonly kind: 'directory';
  entries(): AsyncIterable<[string, FolderFile | FolderHandle]>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

/** Where to read an item's files from when it is opened. */
export type ItemSource =
  | { kind: 'handle'; folder: FolderHandle; fileName: string }
  | { kind: 'files'; projectFile: File; others: File[] };

export interface ScanOutcome {
  items: ProjectListItem[];
  skipped: SkippedFile[];
  /** There were more project files than MAX_LISTED_PROJECTS: the rest are left out. */
  truncated: boolean;
  /** By item key. */
  sources: Map<string, ItemSource>;
}

export function emptyOutcome(): ScanOutcome {
  return { items: [], skipped: [], truncated: false, sources: new Map() };
}

/** What the Windows app read from the projects folder, as items. */
export function itemsFromListing(listing: LocalProjectsListing): ScanOutcome {
  const outcome = emptyOutcome();
  outcome.truncated = listing.truncated;
  outcome.skipped.push(...listing.skipped);
  for (const { path, text, modifiedMs } of listing.projects) addItem(outcome, path, text, modifiedMs);
  return outcome;
}

/** The project files in a folder handle and in the folders directly inside it. */
export async function scanFolder(root: FolderHandle): Promise<ScanOutcome> {
  const outcome = emptyOutcome();
  const subfolders = await scanOneFolder(root, root.name, outcome);
  for (const subfolder of subfolders) {
    if (outcome.truncated) break;
    await scanOneFolder(subfolder, `${root.name}/${subfolder.name}`, outcome);
  }
  return outcome;
}

/** Adds the project files directly in `folder` to `outcome`, and returns the folders in it. */
async function scanOneFolder(folder: FolderHandle, path: string, outcome: ScanOutcome): Promise<FolderHandle[]> {
  const subfolders: FolderHandle[] = [];
  for await (const [, child] of folder.entries()) {
    if (child.kind === 'directory') {
      subfolders.push(child);
    } else if (isProjectFileName(child.name)) {
      if (outcome.items.length >= MAX_LISTED_PROJECTS) {
        outcome.truncated = true;
        break;
      }
      await addHandleFile(outcome, folder, child, `${path}/${child.name}`);
    }
  }
  return subfolders;
}

async function addHandleFile(outcome: ScanOutcome, folder: FolderHandle, child: FolderFile, location: string): Promise<void> {
  try {
    await addFile(outcome, location, await child.getFile(), { kind: 'handle', folder, fileName: child.name });
  } catch (error) {
    outcome.skipped.push({ path: location, reason: errorReason(error) });
  }
}

const pathOf = (file: File) => file.webkitRelativePath || file.name;
const folderPathOf = (file: File) => pathOf(file).split('/').slice(0, -1).join('/');
// `root/file` has two segments, `root/sub/file` three.
const MAX_SEGMENTS = 3;

/** The project files among the files a folder input chose, in the folder and the folders directly inside it. */
export async function scanChosenFiles(files: readonly File[]): Promise<ScanOutcome> {
  const outcome = emptyOutcome();
  const projectFiles = files.filter((file) => isProjectFileName(file.name) && pathOf(file).split('/').length <= MAX_SEGMENTS);
  for (const projectFile of projectFiles) {
    if (outcome.items.length >= MAX_LISTED_PROJECTS) {
      outcome.truncated = true;
      break;
    }
    const folder = folderPathOf(projectFile);
    const others = files.filter((file) => file !== projectFile && !isProjectFileName(file.name) && folderPathOf(file) === folder);
    await addChosenFile(outcome, projectFile, others);
  }
  return outcome;
}

async function addChosenFile(outcome: ScanOutcome, projectFile: File, others: File[]): Promise<void> {
  const location = pathOf(projectFile);
  try {
    await addFile(outcome, location, projectFile, { kind: 'files', projectFile, others });
  } catch (error) {
    outcome.skipped.push({ path: location, reason: errorReason(error) });
  }
}

/** Reads a project file and adds it; the text is read only after the size check, so a huge file is never read. */
async function addFile(outcome: ScanOutcome, location: string, file: File, source: ItemSource): Promise<void> {
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    outcome.skipped.push({ path: location, reason: 'larger than 1 MB' });
    return;
  }
  const item = addItem(outcome, location, await file.text(), file.lastModified);
  if (item) outcome.sources.set(item.key, source);
}

function addItem(outcome: ScanOutcome, location: string, text: string, modifiedMs: number): ProjectListItem | undefined {
  const item = itemFromProjectFile(text, location, modifiedMs);
  if (item) outcome.items.push(item);
  else outcome.skipped.push({ path: location, reason: 'not a valid project file' });
  return item;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
