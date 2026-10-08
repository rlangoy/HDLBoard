// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Save project (docs/PROJECTS.md): the project file and every file of the project,
 * written next to each other, so the folder opens again as the same project.
 *
 * Three ways, best first: back into the folder the Windows app opened it from; into a
 * folder the student picks (File System Access API — Chrome, Edge and the Windows
 * app); or, in other browsers, one download per file.
 */

import { downloadBlob } from './download';

export interface SavedFile {
  name: string;
  text: string;
}

/** The files Save project writes: the project file first, then the project's files. */
export function projectSaveFiles(projectFileName: string, projectText: string, files: readonly SavedFile[]): SavedFile[] {
  return [{ name: projectFileName, text: projectText }, ...files];
}

/** A folder picked in the browser; only the parts used here. */
export interface PickedFolder {
  readonly name: string;
  getFileHandle(name: string, options: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
}

type FolderPicker = (options?: { id?: string; mode?: 'readwrite' }) => Promise<PickedFolder>;

function folderPicker(): FolderPicker | undefined {
  const picker = (window as unknown as { showDirectoryPicker?: FolderPicker }).showDirectoryPicker;
  return typeof picker === 'function' ? picker.bind(window) : undefined;
}

/** Whether this browser can write a folder (Chrome, Edge, the Windows app). */
export function canPickFolder(): boolean {
  return folderPicker() !== undefined;
}

/** Asks for a folder to save into; undefined if the student cancelled. */
export async function pickSaveFolder(): Promise<PickedFolder | undefined> {
  const picker = folderPicker();
  if (!picker) return undefined;
  try {
    return await picker({ id: 'hdlboard-project', mode: 'readwrite' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return undefined;
    throw err;
  }
}

export async function writeToFolder(folder: PickedFolder, files: readonly SavedFile[]): Promise<void> {
  for (const file of files) {
    const handle = await folder.getFileHandle(file.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.text);
    await writable.close();
  }
}

/** The fallback: each file as its own download. */
export function downloadEach(files: readonly SavedFile[]): void {
  files.forEach((file, i) => {
    const type = /\.json$/i.test(file.name) ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
    // Spaced out, so the browser does not drop downloads fired in the same instant.
    window.setTimeout(() => downloadBlob(new Blob([file.text], { type }), file.name), i * 250);
  });
}
