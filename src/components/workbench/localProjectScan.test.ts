// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import {
  MAX_LISTED_PROJECTS,
  itemsFromListing,
  scanChosenFiles,
  scanFolder,
  type FolderFile,
  type FolderHandle,
} from './localProjectScan';

const projectText = (name: string) =>
  JSON.stringify({ version: 1, name, board: 'DE1-SoC', description: '', files: [{ name: 'a.vhd', url: '', description: '' }] });

const fileIn = (name: string, text: string): FolderFile => ({ kind: 'file', name, getFile: async () => new File([text], name) });

function folder(name: string, children: (FolderFile | FolderHandle)[]): FolderHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const child of children) yield [child.name, child] as [string, FolderFile | FolderHandle];
    },
    getFileHandle: async () => {
      throw new Error('not used');
    },
  };
}

const chosen = (path: string, text = '') => {
  const file = new File([text], path.split('/').pop() ?? path);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
};

describe('scanFolder', () => {
  test('finds project files in the folder and the folders directly inside it', async () => {
    const root = folder('Projects', [
      fileIn('top.hdlboard.json', projectText('Top')),
      fileIn('notes.txt', 'ignored'),
      folder('lab1', [fileIn('lab1.hdlboard.json', projectText('Lab 1')), folder('deep', [fileIn('x.hdlboard.json', projectText('Deep'))])]),
    ]);
    const outcome = await scanFolder(root);
    expect(outcome.items.map((item) => item.name).sort()).toEqual(['Lab 1', 'Top']);
    expect(outcome.items.find((item) => item.name === 'Lab 1')?.location).toBe('Projects/lab1/lab1.hdlboard.json');
    expect(outcome.skipped).toEqual([]);
  });

  test('lists a file that is not a project file as skipped, and keeps the rest', async () => {
    const root = folder('Projects', [fileIn('bad.hdlboard.json', '{nope'), fileIn('good.hdlboard.json', projectText('Good'))]);
    const outcome = await scanFolder(root);
    expect(outcome.items.map((item) => item.name)).toEqual(['Good']);
    expect(outcome.skipped).toEqual([{ path: 'Projects/bad.hdlboard.json', reason: 'not a valid project file' }]);
  });

  test('remembers where to open each project from', async () => {
    const sub = folder('lab1', [fileIn('lab1.hdlboard.json', projectText('Lab 1'))]);
    const outcome = await scanFolder(folder('Projects', [sub]));
    expect(outcome.sources.get(outcome.items[0].key)).toMatchObject({ kind: 'handle', folder: sub, fileName: 'lab1.hdlboard.json' });
  });

  test('stops at the limit and says so', async () => {
    const many = Array.from({ length: MAX_LISTED_PROJECTS + 5 }, (_, i) => fileIn(`p${i}.hdlboard.json`, projectText(`P${i}`)));
    const outcome = await scanFolder(folder('Projects', many));
    expect(outcome.items).toHaveLength(MAX_LISTED_PROJECTS);
    expect(outcome.truncated).toBe(true);
  });

  test('skips a file that cannot be read instead of failing the scan', async () => {
    const broken: FolderFile = { kind: 'file', name: 'x.hdlboard.json', getFile: async () => Promise.reject(new Error('permission denied')) };
    const outcome = await scanFolder(folder('Projects', [broken, fileIn('ok.hdlboard.json', projectText('Ok'))]));
    expect(outcome.items).toHaveLength(1);
    expect(outcome.skipped).toEqual([{ path: 'Projects/x.hdlboard.json', reason: 'permission denied' }]);
  });
});

describe('scanChosenFiles', () => {
  test('finds project files up to one folder down, with the files next to each', async () => {
    const project = chosen('Projects/lab1/lab1.hdlboard.json', projectText('Lab 1'));
    const sibling = chosen('Projects/lab1/a.vhd');
    const elsewhere = chosen('Projects/lab2/b.vhd');
    const tooDeep = chosen('Projects/lab1/deep/d.hdlboard.json', projectText('Deep'));
    const outcome = await scanChosenFiles([project, sibling, elsewhere, tooDeep]);
    expect(outcome.items.map((item) => item.name)).toEqual(['Lab 1']);
    expect(outcome.sources.get(outcome.items[0].key)).toEqual({ kind: 'files', projectFile: project, others: [sibling] });
  });
});

describe('itemsFromListing', () => {
  test('turns what the Windows app read into items and keeps its problems', () => {
    const outcome = itemsFromListing({
      folder: 'C:/p',
      projects: [{ path: 'C:/p/a.hdlboard.json', text: projectText('A'), modifiedMs: 1000 }],
      skipped: [{ path: 'C:/p/big.hdlboard.json', reason: 'larger than 1 MB' }],
      truncated: true,
    });
    expect(outcome.items.map((item) => item.name)).toEqual(['A']);
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.truncated).toBe(true);
  });
});
