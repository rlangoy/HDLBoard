// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { projectJson } from '../../project/testHelpers';
import {
  defaultProject,
  hasUnsavedChanges,
  newProject,
  openProject,
  parseStoredProject,
  projectFileText,
  withDetails,
  withEntryRemoved,
  withEntryRenamed,
  type OpenProject,
} from './projectFile';
import { diskLayout, pendingLayoutChange, projectDirectoryOf, samePath, sourceFolderOf, targetPathOf } from './projectLayout';

const entry = (name: string, url = '') => ({ name, url, description: `about ${name}` });

/** A project file on disk, read by relative path through a fake folder. */
function folder(files: Record<string, string>) {
  const read: string[] = [];
  return {
    read,
    readLocal: async (path: string) => {
      read.push(path);
      if (path in files) return files[path];
      throw new Error(`ENOENT ${path}`);
    },
  };
}

function project(overrides: Partial<OpenProject> = {}): OpenProject {
  return { ...newProject('Fantasic Leds', []), fileName: 'fantasicleds.hdlboard.json', ...overrides };
}

describe('where the files go (docs/impl_project_structure.md § 6.1, § 6.3)', () => {
  it('derives the project folder from the project file name', () => {
    expect(projectDirectoryOf({ fileName: 'fantasicleds.hdlboard.json' })).toBe('fantasicleds');
    expect(projectDirectoryOf({ fileName: 'Lab-1.HDLBoard.json' })).toBe('Lab-1');
  });

  it('puts each file in <projectDirectory>/<sourceDirectory>', () => {
    const p = project();
    expect(sourceFolderOf(p)).toBe('fantasicleds/src');
    expect(targetPathOf(p, 'DE1_SoC.vhdl')).toBe('fantasicleds/src/DE1_SoC.vhdl');
    expect(targetPathOf({ ...p, sourceDirectory: 'rtl' }, 'a.vhd')).toBe('fantasicleds/rtl/a.vhd');
  });

  it('compares paths ignoring case', () => {
    expect(samePath('proj/src/x.vhd', 'proj/Src/X.vhd')).toBe(true);
    expect(samePath('proj/src/x.vhd', 'proj/rtl/x.vhd')).toBe(false);
  });

  it('writes both folders into the project file, the project folder following the file name', () => {
    const p = withDetails(project(), { fileName: 'other.hdlboard.json', sourceDirectory: 'rtl' });
    const json = JSON.parse(projectFileText(p, []));
    expect(json.projectDirectory).toBe('other');
    expect(json.sourceDirectory).toBe('rtl');
  });

  it('starts a new project with src', () => {
    expect(newProject('x', []).sourceDirectory).toBe('src');
  });
});

describe('diskLayout', () => {
  it('is none when nothing is known on disk', () => {
    expect(diskLayout(project())).toBe('none');
  });

  it('is flat when every file is next to the project file', () => {
    expect(diskLayout(project({ onDisk: { 'a.vhd': 'a.vhd', 'b.vhd': 'B.vhd' } }))).toBe('flat');
  });

  it('is folders when every file is at its target, ignoring case', () => {
    expect(diskLayout(project({ onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd', 'b.vhd': 'FantasicLeds/Src/b.vhd' } }))).toBe('folders');
  });

  it('is still folders with new files that have no place on disk yet', () => {
    // A new file is simply not in onDisk.
    expect(diskLayout(project({ onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' } }))).toBe('folders');
  });

  it('is mixed when a file is flat or in an old folder', () => {
    expect(diskLayout(project({ onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd', 'b.vhd': 'b.vhd' } }))).toBe('mixed');
    expect(diskLayout(project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' } }))).toBe('mixed');
  });
});

describe('pendingLayoutChange (the project page hints, § 7)', () => {
  it('says nothing when every file is at its target', () => {
    expect(pendingLayoutChange(project({ onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' } }))).toEqual({ copy: false, move: false });
  });

  it('copies a flat project', () => {
    expect(pendingLayoutChange(project({ onDisk: { 'a.vhd': 'a.vhd' } }))).toEqual({ copy: true, move: false });
  });

  it('moves when the source folder changed', () => {
    const p = project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: 'fantasicleds.hdlboard.json' });
    expect(pendingLayoutChange(p)).toEqual({ copy: false, move: true });
  });

  it('moves, without the outside-rename note, when the project file was renamed on the page', () => {
    const p = project({ fileName: 'newname.hdlboard.json', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: 'fantasicleds.hdlboard.json' });
    expect(pendingLayoutChange(p)).toEqual({ copy: false, move: true });
  });

  it('notes a project file renamed outside HDLBoard: its files are in the old project folder', () => {
    const p = project({ fileName: 'newname.hdlboard.json', onDisk: { 'a.vhd': 'oldname/src/a.vhd' }, onDiskFileName: 'newname.hdlboard.json' });
    expect(pendingLayoutChange(p)).toEqual({ copy: false, move: true, renamedOutsideFrom: 'oldname/src' });
  });

  it('treats a change of case only as no change', () => {
    const p = project({ sourceDirectory: 'Src', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' } });
    expect(pendingLayoutChange(p)).toEqual({ copy: false, move: false });
  });
});

describe('opening a project from a folder (§ 6.4)', () => {
  it('reads each file from <projectDirectory>/<sourceDirectory> and records where it was', async () => {
    const disk = folder({ 'fantasicleds/src/a.vhd': 'A', 'fantasicleds/src/b.vhd': 'B' });
    const { project: p, files } = await openProject({
      text: projectJson([entry('a.vhd'), entry('b.vhd')], { projectDirectory: 'fantasicleds', sourceDirectory: 'src' }),
      location: 'C:\\Labs\\fantasicleds.hdlboard.json',
      readLocal: disk.readLocal,
    });
    expect(files.map((f) => f.content)).toEqual(['A', 'B']);
    expect(p.onDisk).toEqual({ 'a.vhd': 'fantasicleds/src/a.vhd', 'b.vhd': 'fantasicleds/src/b.vhd' });
    expect(p.onDiskFileName).toBe('fantasicleds.hdlboard.json');
    expect(p.sourceDirectory).toBe('src');
    expect(diskLayout(p)).toBe('folders');
  });

  it('falls back to the file next to the project file: an old flat project', async () => {
    const disk = folder({ 'a.vhd': 'A' });
    const { project: p, files } = await openProject({ text: projectJson([entry('a.vhd')]), location: 'C:\\Labs\\lab1.hdlboard.json', readLocal: disk.readLocal });
    expect(files).toEqual([{ name: 'a.vhd', content: 'A' }]);
    // Looked in the default folders first: the project file name and src.
    expect(disk.read).toEqual(['lab1/src/a.vhd', 'a.vhd']);
    expect(p.onDisk).toEqual({ 'a.vhd': 'a.vhd' });
    expect(diskLayout(p)).toBe('flat');
  });

  it('prefers the source folder after a conversion, while the flat copies are still there', async () => {
    const disk = folder({ 'lab1/src/a.vhd': 'new', 'a.vhd': 'old' });
    const { files, project: p } = await openProject({
      text: projectJson([entry('a.vhd')], { projectDirectory: 'lab1', sourceDirectory: 'src' }),
      location: 'C:\\Labs\\lab1.hdlboard.json',
      readLocal: disk.readLocal,
    });
    expect(files[0].content).toBe('new');
    expect(p.onDisk).toEqual({ 'a.vhd': 'lab1/src/a.vhd' });
  });

  it('finds the files of a project file renamed outside HDLBoard through the folder it names', async () => {
    const disk = folder({ 'oldname/src/a.vhd': 'A' });
    const { project: p } = await openProject({
      text: projectJson([entry('a.vhd')], { projectDirectory: 'oldname' }),
      location: 'C:\\Labs\\newname.hdlboard.json',
      readLocal: disk.readLocal,
    });
    expect(p.onDisk).toEqual({ 'a.vhd': 'oldname/src/a.vhd' });
    expect(pendingLayoutChange(p).renamedOutsideFrom).toBe('oldname/src');
    // The next save writes the folder named after the file.
    expect(JSON.parse(projectFileText(p, ['a.vhd'])).projectDirectory).toBe('newname');
  });

  it('says where it looked when a file is in neither place', async () => {
    const disk = folder({});
    const { project: p } = await openProject({
      text: projectJson([entry('a.vhd')], { projectDirectory: 'lab1', sourceDirectory: 'rtl' }),
      location: 'C:\\Labs\\lab1.hdlboard.json',
      readLocal: disk.readLocal,
    });
    expect(p.unloaded['a.vhd']).toMatch(/Not found in lab1\/rtl or next to the project file/);
    expect(p.onDisk).toBeUndefined();
  });

  it('matches chosen files by their path first, so another project in the folder cannot stand in', async () => {
    const { files, project: p } = await openProject({
      text: projectJson([entry('DE1_SoC.vhdl')]),
      location: 'fantasicleds.hdlboard.json',
      localFiles: [
        { name: 'DE1_SoC.vhdl', content: 'flat', path: 'DE1_SoC.vhdl' },
        { name: 'DE1_SoC.vhdl', content: 'mine', path: 'fantasicleds/src/DE1_SoC.vhdl' },
      ],
    });
    expect(files[0].content).toBe('mine');
    expect(p.onDisk).toEqual({ 'de1_soc.vhdl': 'fantasicleds/src/DE1_SoC.vhdl' });
  });

  it('matches files of an older zip (vhdl/…) by name, keeping where they were', async () => {
    const { files, project: p } = await openProject({
      text: projectJson([entry('a.vhd')]),
      location: 'lab.hdlboard.json',
      localFiles: [{ name: 'a.vhd', content: 'A', path: 'vhdl/a.vhd' }],
    });
    expect(files[0].content).toBe('A');
    expect(p.onDisk).toEqual({ 'a.vhd': 'vhdl/a.vhd' });
  });

  it('knows nothing on disk for files handed over without a path (a gist, a plain upload)', async () => {
    const { project: p } = await openProject({
      text: projectJson([entry('a.vhd')], { projectDirectory: 'x', sourceDirectory: 'y' }),
      location: 'https://gist.githubusercontent.com/u/1/raw/lab.hdlboard.json',
      localFiles: [{ name: 'a.vhd', content: 'A' }],
    });
    expect(p.onDisk).toBeUndefined();
    expect(p.sourceDirectory).toBe('y');
  });

  it('records where the saved copy of a file with its own URL is', async () => {
    const disk = folder({ 'lab/src/d.vhd': 'copy' });
    const fetchFn = (async () => new Response('from url')) as unknown as typeof fetch;
    const { project: p, files } = await openProject({
      text: projectJson([entry('d.vhd', 'https://example.com/d.vhd')]),
      location: 'C:\\Labs\\lab.hdlboard.json',
      readLocal: disk.readLocal,
      fetch: fetchFn,
    });
    expect(files[0].content).toBe('from url');
    expect(p.onDisk).toEqual({ 'd.vhd': 'lab/src/d.vhd' });
  });

  it('opens 500 files', async () => {
    const names = Array.from({ length: 500 }, (_, i) => `f${i}.vhd`);
    const disk = folder(Object.fromEntries(names.map((name) => [`big/src/${name}`, name])));
    const { files, project: p } = await openProject({
      text: projectJson(names.map((name) => entry(name))),
      location: 'C:\\Labs\\big.hdlboard.json',
      readLocal: disk.readLocal,
    });
    expect(files).toHaveLength(500);
    expect(diskLayout(p)).toBe('folders');
  });
});

describe('keeping track of places on disk', () => {
  const p = project({ onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd', 'b.vhd': 'fantasicleds/src/b.vhd' } });

  it('forgets the place of a file renamed in Files: the old file on disk is another one now', () => {
    expect(withEntryRenamed(p, 'a.vhd', 'c.vhd').onDisk).toEqual({ 'b.vhd': 'fantasicleds/src/b.vhd' });
  });

  it('forgets the place of a file that left the project', () => {
    expect(withEntryRemoved(p, 'b.vhd').onDisk).toEqual({ 'a.vhd': 'fantasicleds/src/a.vhd' });
  });

  it('keeps the source folder and places with the stored workspace', () => {
    const stored = parseStoredProject(JSON.parse(JSON.stringify({ ...p, sourceDirectory: 'rtl', onDiskFileName: 'fantasicleds.hdlboard.json' })));
    expect(stored?.sourceDirectory).toBe('rtl');
    expect(stored?.onDisk).toEqual(p.onDisk);
    expect(stored?.onDiskFileName).toBe('fantasicleds.hdlboard.json');
  });

  it('reads a workspace stored before project folders as src, nothing on disk', () => {
    const { sourceDirectory: _s, onDisk: _o, ...older } = p;
    const stored = parseStoredProject(JSON.parse(JSON.stringify(older)));
    expect(stored?.sourceDirectory).toBe('src');
    expect(stored?.onDisk).toBeUndefined();
  });
});

describe('the Default project: the workspace when no other project is open', () => {
  const files = [
    { name: 'DE1_SoC.vhdl', content: '-- vhdl' },
    { name: 'DE1_SoC.v', content: '// v' },
  ];

  it('is "Default", "Not set yet", with its files in src', () => {
    const p = defaultProject(files);
    const json = JSON.parse(projectFileText(p, files.map((f) => f.name)));
    expect([json.name, json.description, json.sourceDirectory, json.projectDirectory]).toEqual(['Default', 'Not set yet', 'src', 'default']);
    expect(json.files.map((f: { name: string }) => f.name)).toEqual(['DE1_SoC.vhdl', 'DE1_SoC.v']);
    expect(targetPathOf(p, 'DE1_SoC.vhdl')).toBe('default/src/DE1_SoC.vhdl');
  });

  it('reads as saved until something changes', () => {
    const p = defaultProject(files);
    expect(hasUnsavedChanges(p, files)).toBe(false);
    expect(hasUnsavedChanges(p, [...files, { name: 'and_gate.vhd', content: '' }])).toBe(true);
    expect(hasUnsavedChanges(p, [{ ...files[0], content: 'edited' }, files[1]])).toBe(true);
  });

  it('takes in an example or a dropped file at once', () => {
    const p = defaultProject(files);
    const json = JSON.parse(projectFileText(p, [...files.map((f) => f.name), 'and_gate.vhd']));
    expect(json.files.map((f: { name: string }) => f.name)).toContain('and_gate.vhd');
  });
});
