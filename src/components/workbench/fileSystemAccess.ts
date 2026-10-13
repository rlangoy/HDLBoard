// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Chrome and Edge's File System Access API, for opening a project from this computer.
 *
 * A page is never told which folder a chosen file is in, so the files stored next to a
 * project file cannot be read from that one choice, in any browser. What these
 * browsers do give is a handle to the chosen (or dropped) file, and the folder picker
 * can open *in that file's folder*: the student then only confirms the folder, which
 * is already selected. Elsewhere (Firefox, Safari) none of this exists, and HDLBoard
 * falls back to the plain file input and a folder input.
 */

import { tagPath, type TaggedFile } from './chosenFolder';

/** The handles of chosen or dropped files, by file name. */
export type FileHandles = ReadonlyMap<string, FileSystemFileHandle>;

const NO_HANDLES: FileHandles = new Map();

interface OpenFilePickerOptions {
  multiple: boolean;
  types: { description: string; accept: Record<string, string[]> }[];
}

interface DirectoryPickerOptions {
  /** Where the picker opens; the browser remembers the last folder per `id`. */
  startIn?: FileSystemHandle;
  id?: string;
  mode: 'read';
}

interface PickerWindow {
  showOpenFilePicker?: (options: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?: (options: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}

interface IterableDirectory {
  values(): AsyncIterable<FileSystemHandle>;
}

interface HandleItem {
  kind: string;
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}

function pickers(): PickerWindow {
  return window as unknown as PickerWindow;
}

/** Whether Upload File can keep handles to what it opens (Chrome, Edge). */
export function canPickWithHandles(): boolean {
  return typeof pickers().showOpenFilePicker === 'function' && typeof pickers().showDirectoryPicker === 'function';
}

/** Upload File in Chrome and Edge: the chosen files and their handles; undefined when cancelled. */
export async function pickFilesWithHandles(extensions: readonly string[]): Promise<{ files: File[]; handles: FileHandles } | undefined> {
  const types = [{ description: 'VHDL, Verilog, project and .zip files', accept: { 'text/plain': [...extensions] } }];
  let chosen: FileSystemFileHandle[];
  try {
    chosen = await pickers().showOpenFilePicker!({ multiple: true, types });
  } catch (error) {
    if (isCancel(error)) return undefined;
    throw error;
  }
  const files = await Promise.all(chosen.map((handle) => handle.getFile()));
  return { files, handles: new Map(chosen.map((handle) => [handle.name, handle])) };
}

/**
 * The handles of dropped files (Chrome, Edge). Must be called during the drop event:
 * the browser hands them out only then. Resolves to none elsewhere.
 */
export function droppedFileHandles(dataTransfer: DataTransfer): Promise<FileHandles> {
  const items = [...dataTransfer.items] as unknown as HandleItem[];
  const pending = items
    .filter((item) => item.kind === 'file' && typeof item.getAsFileSystemHandle === 'function')
    .map((item) => item.getAsFileSystemHandle!().catch(() => null));
  if (pending.length === 0) return Promise.resolve(NO_HANDLES);
  return Promise.all(pending).then(
    (handles) => new Map(handles.filter(isFileHandle).map((handle) => [handle.name, handle])),
  );
}

/**
 * Asks for the folder the file is in, with the folder picker opened there, and reads
 * the files in it and in `subfolder` (`lab1/src`, the project's source folder,
 * docs/impl_project_structure.md), each tagged with its path. The folder comes back too:
 * it can become the Projects page's folder. Undefined when the student cancels.
 */
export async function pickFolderOf(
  file: FileSystemFileHandle,
  subfolder?: string,
): Promise<{ folder: FileSystemDirectoryHandle; files: TaggedFile[] } | undefined> {
  let folder: FileSystemDirectoryHandle;
  try {
    folder = await pickers().showDirectoryPicker!({ startIn: file, mode: 'read' });
  } catch (error) {
    if (isCancel(error)) return undefined;
    throw error;
  }
  const files = await filesIn(folder, '');
  if (subfolder) {
    let inner: FileSystemDirectoryHandle | null = folder;
    for (const part of subfolder.split('/')) inner = inner && (await inner.getDirectoryHandle(part).catch(() => null));
    if (inner) files.push(...(await filesIn(inner, subfolder)));
  }
  return { folder, files };
}

/** The files directly in `folder`, tagged with `prefix/name`. */
async function filesIn(folder: FileSystemDirectoryHandle, prefix: string): Promise<TaggedFile[]> {
  const files: TaggedFile[] = [];
  for await (const entry of (folder as unknown as IterableDirectory).values()) {
    if (isFileHandle(entry)) files.push(tagPath(await entry.getFile(), prefix === '' ? entry.name : `${prefix}/${entry.name}`));
  }
  return files;
}

/** The Projects page's Choose folder: a folder to list, read only. Undefined when cancelled. */
export async function pickProjectsFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await pickers().showDirectoryPicker!({ id: 'hdlboard-projects', mode: 'read' });
  } catch (error) {
    if (isCancel(error)) return undefined;
    throw error;
  }
}

function isFileHandle(handle: FileSystemHandle | null): handle is FileSystemFileHandle {
  return handle !== null && handle.kind === 'file';
}

function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
