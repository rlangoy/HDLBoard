// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Save project (docs/PROJECTS.md, docs/impl_project_structure.md): the project file and
 * the project's files in `<project>/<source folder>/` next to it, so the folder opens
 * again as the same project. projectSavePlan.ts decides what to write and delete; the
 * disks here carry it out.
 *
 * Three ways, best first: back into the folder the Windows app opened it from; into a
 * folder the student picks (File System Access API — Chrome, Edge and the Windows app);
 * or, in other browsers, one .zip download (download.ts).
 */

import type { SaveDisk } from './projectSavePlan';

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

/** The parts of a FileSystemDirectoryHandle a save uses. */
interface WritableFolder extends PickedFolder {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<WritableFolder>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, { kind: 'file' | 'directory' }]>;
}

/** The folder at `relative` (with `/`; '' is `root`), created on the way when `create`. */
async function folderAt(root: WritableFolder, relative: string, create: boolean): Promise<WritableFolder> {
  let folder = root;
  for (const part of relative.split('/').filter((p) => p !== '')) folder = await folder.getDirectoryHandle(part, { create });
  return folder;
}

function split(path: string): { folder: string; name: string } {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? { folder: '', name: path } : { folder: path.slice(0, cut), name: path.slice(cut + 1) };
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');
}

/** A folder picked in Chrome or Edge (or opened from the Projects page) as a disk for a save plan. */
export function folderHandleDisk(picked: PickedFolder): SaveDisk {
  const root = picked as WritableFolder;
  const entriesOf = async (relative: string) => {
    const folder = await folderAt(root, relative, false);
    const found: [string, 'file' | 'directory'][] = [];
    for await (const [name, child] of folder.entries()) found.push([name, child.kind]);
    return found;
  };
  return {
    async list(relative) {
      try {
        return (await entriesOf(relative)).filter(([, kind]) => kind === 'file').map(([name]) => name);
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
    },
    async write(path, text) {
      const { folder, name } = split(path);
      const handle = await (await folderAt(root, folder, true)).getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    },
    async remove(path) {
      const { folder, name } = split(path);
      await (await folderAt(root, folder, false)).removeEntry(name);
    },
    async isEmptyFolder(relative) {
      try {
        return (await entriesOf(relative)).length === 0;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async removeEmptyFolder(relative) {
      if (!(await this.isEmptyFolder(relative))) throw new Error(`${relative} is not empty`);
      const { folder, name } = split(relative);
      await (await folderAt(root, folder, false)).removeEntry(name);
    },
  };
}

/** What the Windows app offers for a project opened by its path (desktop.ts). */
export interface DesktopFiles {
  writeLocalFile(path: string, text: string): Promise<boolean>;
  listFolderFiles(base: string, relative: string): Promise<string[]>;
  deleteLocalFile(base: string, relative: string): Promise<boolean>;
  folderIsEmpty(base: string, relative: string): Promise<boolean>;
  removeEmptyFolder(base: string, relative: string): Promise<boolean>;
}

/** The project file's folder on disk in the Windows app, as a disk for a save plan. */
export function desktopDisk(bridge: DesktopFiles, base: string, pathInFolder: (folder: string, name: string) => string): SaveDisk {
  return {
    list: (relative) => bridge.listFolderFiles(base, relative),
    write: async (path, text) => {
      await bridge.writeLocalFile(pathInFolder(base, path), text);
    },
    remove: async (path) => {
      await bridge.deleteLocalFile(base, path);
    },
    isEmptyFolder: (relative) => bridge.folderIsEmpty(base, relative),
    removeEmptyFolder: async (relative) => {
      await bridge.removeEmptyFolder(base, relative);
    },
  };
}
