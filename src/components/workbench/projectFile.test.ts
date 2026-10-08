// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { ProjectError } from '../../project/parseProject';
import { fakeFetch, projectJson } from '../../project/testHelpers';
import {
  MISSING_LOCAL_FILE,
  hasUnsavedChanges,
  newProject,
  openProject,
  pickProjectUpload,
  projectEntries,
  projectFileBase,
  projectFileNameFromBase,
  projectFileNameError,
  projectFileNameFor,
  projectFileText,
  withEntriesLoaded,
  withEntryEdited,
  withEntryRemoved,
  withEntryRenamed,
  withSaved,
} from './projectFile';

const entry = (name: string, url = '', description = `about ${name}`) => ({ name, url, description });

describe('openProject', () => {
  it('reads entries without a URL from the files chosen with the project file, ignoring case', async () => {
    const { project, files } = await openProject({
      text: projectJson([entry('counter.vhd'), entry('counter_tb.vhd')]),
      location: 'counter.hdlboard.json',
      localFiles: [
        { name: 'COUNTER.vhd', content: 'design' },
        { name: 'counter_tb.vhd', content: 'tb' },
      ],
    });
    expect(files).toEqual([
      { name: 'counter.vhd', content: 'design' },
      { name: 'counter_tb.vhd', content: 'tb' },
    ]);
    expect(project.fileName).toBe('counter.hdlboard.json');
    expect(project.unloaded).toEqual({});
    expect(hasUnsavedChanges(project, ['counter.vhd', 'counter_tb.vhd'])).toBe(false);
  });

  it('downloads entries with a URL, and keeps going when one fails', async () => {
    const { fetchFn } = fakeFetch({ 'GET https://example.com/a.vhd': 'from url' });
    const { project, files } = await openProject({
      text: projectJson([entry('a.vhd', 'https://example.com/a.vhd'), entry('b.vhd', 'https://example.com/b.vhd'), entry('c.vhd')]),
      location: 'p.json',
      fetch: fetchFn,
    });
    expect(files).toEqual([{ name: 'a.vhd', content: 'from url' }]);
    expect(Object.keys(project.unloaded)).toEqual(['b.vhd', 'c.vhd']);
    expect(project.unloaded['c.vhd']).toBe(MISSING_LOCAL_FILE);
    // Not a .hdlboard.json: the project file is named after the project.
    expect(project.fileName).toBe('test.hdlboard.json');
  });

  it('uses a chosen copy when the download fails', async () => {
    const { fetchFn } = fakeFetch({});
    const { files } = await openProject({
      text: projectJson([entry('a.vhd', 'https://example.com/a.vhd')]),
      location: 'x.hdlboard.json',
      localFiles: [{ name: 'a.vhd', content: 'copy' }],
      fetch: fetchFn,
    });
    expect(files).toEqual([{ name: 'a.vhd', content: 'copy' }]);
  });

  it('does not put files Files cannot hold in Files, but keeps their entries', async () => {
    const { project, files } = await openProject({
      text: projectJson([entry('notes.txt'), entry('tb_x.vhd')]),
      location: 'x.hdlboard.json',
      localFiles: [{ name: 'notes.txt', content: 'hi' }, { name: 'tb_x.vhd', content: '' }],
    });
    expect(files).toEqual([]);
    expect(projectEntries(project, []).map((row) => row.status)).toEqual(['unloaded', 'unloaded']);
  });

  it('refuses an invalid project file', async () => {
    await expect(openProject({ text: '{"version":1}', location: 'x.json' })).rejects.toThrow(ProjectError);
  });
});

describe('the project follows Files', () => {
  const base = withSaved(
    {
      ...newProject('Counter', ['a.vhd', 'b.vhd']),
      entries: [entry('a.vhd'), entry('b.vhd'), entry('gone.vhd')],
      unloaded: { 'gone.vhd': 'missing' },
    },
    ['a.vhd', 'b.vhd'],
  );

  it('lists files added to Files after the project entries', () => {
    expect(projectEntries(base, ['a.vhd', 'b.vhd', 'new.v']).map((r) => [r.name, r.status, r.description])).toEqual([
      ['a.vhd', 'loaded', 'about a.vhd'],
      ['b.vhd', 'loaded', 'about b.vhd'],
      ['gone.vhd', 'unloaded', 'about gone.vhd'],
      ['new.v', 'loaded', ''],
    ]);
    expect(hasUnsavedChanges(base, ['a.vhd', 'b.vhd', 'new.v'])).toBe(true);
  });

  it('drops a file deleted from Files', () => {
    expect(projectEntries(base, ['b.vhd']).map((r) => r.name)).toEqual(['b.vhd', 'gone.vhd']);
  });

  it('keeps the description of a renamed file', () => {
    const renamed = withEntryRenamed(base, 'a.vhd', 'alu.vhd');
    expect(projectEntries(renamed, ['alu.vhd', 'b.vhd'])[0]).toMatchObject({ name: 'alu.vhd', description: 'about a.vhd' });
  });

  it('edits a description, also of a file the project did not list yet', () => {
    const edited = withEntryEdited(withEntryEdited(base, 'b.vhd', { description: 'B' }), 'new.v', { description: 'N' });
    const rows = projectEntries(edited, ['a.vhd', 'b.vhd', 'new.v']);
    expect(rows.find((r) => r.name === 'b.vhd')?.description).toBe('B');
    expect(rows.find((r) => r.name === 'new.v')?.description).toBe('N');
  });

  it('removes an unloaded entry, and marks entries loaded', () => {
    expect(projectEntries(withEntryRemoved(base, 'gone.vhd'), ['a.vhd']).map((r) => r.name)).toEqual(['a.vhd']);
    expect(withEntriesLoaded(base, ['GONE.vhd']).unloaded).toEqual({});
  });

  it('saves in the § 4 format', () => {
    expect(JSON.parse(projectFileText(base, ['a.vhd']))).toEqual({
      version: 1,
      name: 'Counter',
      board: 'DE1-SoC',
      description: '',
      files: [entry('a.vhd'), entry('gone.vhd')],
    });
  });
});

describe('names', () => {
  it('makes a project file name from the project name', () => {
    expect(projectFileNameFor('4-bit Counter')).toBe('4-bit-counter.hdlboard.json');
    expect(projectFileNameFor('!!!')).toBe('project.hdlboard.json');
  });

  it('checks the project file name', () => {
    expect(projectFileNameError('a.hdlboard.json')).toBeUndefined();
    expect(projectFileNameError('a.json')).toMatch(/end in/);
    expect(projectFileNameError('a/b.hdlboard.json')).toMatch(/forbidden/);
  });

  it('edits only the part before the fixed .hdlboard.json', () => {
    expect(projectFileBase('Lab-1.HDLBoard.json')).toBe('Lab-1');
    expect(projectFileNameFromBase(' lab2 ')).toBe('lab2.hdlboard.json');
    // A typed or pasted extension is not added twice.
    expect(projectFileNameFromBase('lab2.hdlboard.json')).toBe('lab2.hdlboard.json');
    expect(projectFileNameFromBase('lab2.json')).toBe('lab2.hdlboard.json');
    expect(projectFileNameError(projectFileNameFromBase('  '))).toMatch(/Enter a name/);
  });

  it('prefers a .hdlboard.json among uploads', () => {
    expect(pickProjectUpload([{ name: 'x.json' }, { name: 'p.hdlboard.json' }])?.name).toBe('p.hdlboard.json');
    expect(pickProjectUpload([{ name: 'a.vhd' }, { name: 'x.json' }])?.name).toBe('x.json');
    expect(pickProjectUpload([{ name: 'a.vhd' }])).toBeUndefined();
  });
});

describe('a project opened by its path (Windows app)', () => {
  it('reads files without a URL next to the project file', async () => {
    const { files, project } = await openProject({
      text: projectJson([entry('a.vhd'), entry('b.vhd')]),
      location: 'C:\Labs\p.hdlboard.json',
      readLocal: async (name) => {
        if (name === 'a.vhd') return 'A';
        throw new Error('ENOENT');
      },
    });
    expect(files).toEqual([{ name: 'a.vhd', content: 'A' }]);
    expect(project.unloaded['b.vhd']).toMatch(/ENOENT/);
  });
});
