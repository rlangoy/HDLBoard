// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reading the projects folder each way it can be reached (docs/project_browse_page.md § 6):
 * what the Windows app lists, a remembered folder handle (Chrome, Edge), or the files a
 * folder input chose. Every outside part comes in as a parameter, so a first visit, a
 * remembered folder and each permission answer can be tested without a browser.
 */

import type { LocalProjectsListing } from './desktop';
import { itemsFromListing, scanChosenFiles, scanFolder, type FolderHandle, type ScanOutcome } from './localProjectScan';

export type FolderState = 'none' | 'needs-permission' | 'ready';

export interface FolderReading {
  outcome: ScanOutcome | null;
  folderState: FolderState;
  /** The folder's full path (Windows app) or name (browser); '' when there is none. */
  folderLabel: string;
}

export const NO_FOLDER: FolderReading = { outcome: null, folderState: 'none', folderLabel: '' };

export async function readDesktopFolder(listLocalProjects: () => Promise<LocalProjectsListing>): Promise<FolderReading> {
  const listing = await listLocalProjects();
  return { outcome: itemsFromListing(listing), folderState: 'ready', folderLabel: listing.folder };
}

export interface RememberedFolderReading {
  /** The folder to keep for the next reading: null once there is none, or access to it was refused. */
  folder: FolderHandle | null;
  reading: FolderReading;
}

/**
 * Reads the folder handle already known this visit, else the one remembered from an earlier
 * visit (`loadRemembered`). A first visit has neither. The browser may still have to ask the
 * user again before the folder can be read (a new session): that is 'needs-permission'.
 */
export async function readRememberedFolder(
  known: FolderHandle | null,
  loadRemembered: () => Promise<FolderHandle | null>,
): Promise<RememberedFolderReading> {
  const folder = known ?? (await loadRemembered());
  if (folder === null) return { folder: null, reading: NO_FOLDER };
  // Read access is all a list needs (Save project asks for write access itself when it writes);
  // a browser without queryPermission has no permission prompts, so the handle is readable.
  const permission = (await folder.queryPermission?.({ mode: 'read' })) ?? 'granted';
  if (permission === 'denied') return { folder: null, reading: NO_FOLDER };
  if (permission === 'prompt') return { folder, reading: { outcome: null, folderState: 'needs-permission', folderLabel: folder.name } };
  return { folder, reading: { outcome: await scanFolder(folder), folderState: 'ready', folderLabel: folder.name } };
}

export async function readChosenFolderFiles(files: readonly File[]): Promise<FolderReading> {
  if (files.length === 0) return NO_FOLDER;
  const rootName = files[0].webkitRelativePath.split('/')[0] ?? '';
  return { outcome: await scanChosenFiles(files), folderState: 'ready', folderLabel: rootName };
}

/** The parts of a folder handle that compare it with another (Chrome, Edge). */
interface ComparableFolder {
  isSameEntry?(other: unknown): Promise<boolean>;
  resolve?(possibleDescendant: unknown): Promise<string[] | null>;
}

/**
 * Whether the folder a project was just saved into should become the projects folder, so
 * the Projects page lists it at once, without asking for access again: the save already
 * got it. Yes when no projects folder is known yet, when it is that same folder (a handle
 * from an earlier visit that would need asking again), or when the known one cannot be
 * read without asking. No when the known folder can be read and already holds the saved
 * one (the saved folder is listed there anyway).
 */
export async function adoptsSavedFolder(saved: FolderHandle, known: FolderHandle | null): Promise<boolean> {
  if (known === null) return true;
  const comparable = known as unknown as ComparableFolder;
  if (await comparable.isSameEntry?.(saved).catch(() => false)) return true;
  const permission = (await known.queryPermission?.({ mode: 'read' }).catch(() => 'prompt' as const)) ?? 'granted';
  if (permission !== 'granted') return true;
  const inside = await comparable.resolve?.(saved).catch(() => null);
  return inside === null || inside === undefined;
}
