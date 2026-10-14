// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { FolderFile, FolderHandle } from './localProjectScan';
import { NO_FOLDER, adoptsSavedFolder, readChosenFolderFiles, readDesktopFolder, readRememberedFolder } from './projectsFolderReading';

const projectText = (name: string) =>
  JSON.stringify({ version: 1, name, board: 'DE1-SoC', description: '', files: [{ name: 'DE1_SoC.vhdl', url: '', description: '' }] });

const fileIn = (name: string, text: string): FolderFile => ({ kind: 'file', name, getFile: async () => new File([text], name) });

/** A folder like the test_s folder: project files side by side, no subfolders. */
function folder(permission?: PermissionState): FolderHandle {
  const children = [fileIn('fun-for-all.hdlboard.json', projectText('Fun for all')), fileIn('project.hdlboard.json', projectText('Runes')), fileIn('DE1_SoC.vhdl', '')];
  return {
    kind: 'directory',
    name: 'test_s',
    entries: async function* () {
      for (const child of children) yield [child.name, child] as [string, FolderFile];
    },
    getFileHandle: async () => {
      throw new Error('not used');
    },
    ...(permission && { queryPermission: async () => permission }),
  };
}

const nothingRemembered = async () => null;

describe('readRememberedFolder', () => {
  test('a first visit has no folder', async () => {
    expect(await readRememberedFolder(null, nothingRemembered)).toEqual({ folder: null, reading: NO_FOLDER });
  });

  test('a folder remembered from an earlier visit is read when access is granted', async () => {
    const remembered = folder('granted');
    const { folder: kept, reading } = await readRememberedFolder(null, async () => remembered);
    expect(kept).toBe(remembered);
    expect(reading.folderState).toBe('ready');
    expect(reading.folderLabel).toBe('test_s');
    expect(reading.outcome?.items.map((item) => item.name).sort()).toEqual(['Fun for all', 'Runes']);
  });

  test('a new session must ask again: the folder is kept but not read', async () => {
    const remembered = folder('prompt');
    const { folder: kept, reading } = await readRememberedFolder(null, async () => remembered);
    expect(kept).toBe(remembered);
    expect(reading).toEqual({ outcome: null, folderState: 'needs-permission', folderLabel: 'test_s' });
  });

  test('a refused folder is forgotten', async () => {
    expect(await readRememberedFolder(folder('denied'), nothingRemembered)).toEqual({ folder: null, reading: NO_FOLDER });
  });

  test('the folder known this visit is used without asking what was remembered', async () => {
    let asked = false;
    const known = folder('granted');
    await readRememberedFolder(known, async () => {
      asked = true;
      return null;
    });
    expect(asked).toBe(false);
  });

  test('without queryPermission the folder is readable', async () => {
    expect((await readRememberedFolder(folder(), nothingRemembered)).reading.folderState).toBe('ready');
  });
});

describe('readChosenFolderFiles', () => {
  test('nothing chosen is no folder', async () => {
    expect(await readChosenFolderFiles([])).toEqual(NO_FOLDER);
  });

  test('names the folder after the first path segment', async () => {
    const file = new File([projectText('Runes')], 'project.hdlboard.json');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'test_s/project.hdlboard.json' });
    const reading = await readChosenFolderFiles([file]);
    expect(reading.folderLabel).toBe('test_s');
    expect(reading.outcome?.items.map((item) => item.name)).toEqual(['Runes']);
  });
});

describe('readDesktopFolder', () => {
  test('shows the full path of the Windows app folder', async () => {
    const reading = await readDesktopFolder(async () => ({ folder: 'C:\\Users\\me\\Documents\\HDLBoard Projects', projects: [], skipped: [], truncated: false }));
    expect(reading).toMatchObject({ folderState: 'ready', folderLabel: 'C:\\Users\\me\\Documents\\HDLBoard Projects' });
  });
});

describe('adoptsSavedFolder: the folder Save project wrote to becomes the projects folder', () => {
  /** A folder handle that knows which handles are itself or inside it. */
  const handle = (name: string, permission: PermissionState, same: string[] = [], holds: string[] = []): FolderHandle =>
    ({
      ...folder(permission),
      name,
      isSameEntry: async (other: FolderHandle) => same.includes(other.name),
      resolve: async (other: FolderHandle) => (holds.includes(other.name) ? [other.name] : null),
    }) as unknown as FolderHandle;
  const saved = handle('Labs', 'granted');

  test('when no projects folder is known yet', async () => {
    expect(await adoptsSavedFolder(saved, null)).toBe(true);
  });

  test('when it is the known folder: its new handle needs no asking', async () => {
    expect(await adoptsSavedFolder(saved, handle('Labs', 'prompt', ['Labs']))).toBe(true);
  });

  test('when the known folder cannot be read without asking again', async () => {
    expect(await adoptsSavedFolder(saved, handle('Other', 'prompt'))).toBe(true);
  });

  test('when the known folder can be read but does not hold it', async () => {
    expect(await adoptsSavedFolder(saved, handle('Other', 'granted'))).toBe(true);
  });

  test('not when the known folder can be read and already holds it', async () => {
    expect(await adoptsSavedFolder(saved, handle('All projects', 'granted', [], ['Labs']))).toBe(false);
  });
});
