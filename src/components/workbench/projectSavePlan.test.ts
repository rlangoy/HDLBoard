// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { nameKey } from '../../project/fileName';
import { newProject, withOnDisk, type OpenProject } from './projectFile';
import { planDiskSave, readExisting, runSavePlan, SaveWriteError, type SaveDisk } from './projectSavePlan';

/**
 * A disk in memory that, like Windows, ignores case: writing `p/Src/x` over `p/src/x`
 * writes the existing file and keeps its case.
 */
class MemoryDisk implements SaveDisk {
  files = new Map<string, { path: string; text: string }>();
  folders = new Set<string>();
  failWrite?: string;
  failRemove?: string;
  writes: string[] = [];
  constructor(initial: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(initial)) this.put(path, text);
  }
  private put(path: string, text: string) {
    const known = this.files.get(nameKey(path));
    this.files.set(nameKey(path), { path: known?.path ?? path, text });
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/');
      if (![...this.folders].some((f) => nameKey(f) === nameKey(folder))) this.folders.add(folder);
    }
  }
  paths(): string[] {
    return [...this.files.values()].map((file) => file.path).sort();
  }
  text(path: string): string | undefined {
    return this.files.get(nameKey(path))?.text;
  }
  async list(folder: string): Promise<string[]> {
    return [...this.files.values()]
      .map((file) => file.path)
      .filter((path) => nameKey(path.split('/').slice(0, -1).join('/')) === nameKey(folder))
      .map((path) => path.split('/').pop()!);
  }
  async write(path: string, text: string) {
    if (this.failWrite && nameKey(this.failWrite) === nameKey(path)) throw new Error('disk full');
    this.writes.push(path);
    this.put(path, text);
  }
  async remove(path: string) {
    if (this.failRemove && nameKey(this.failRemove) === nameKey(path)) throw new Error('in use');
    if (!this.files.delete(nameKey(path))) throw new Error('ENOENT');
  }
  async isEmptyFolder(folder: string) {
    const inside = (path: string) => nameKey(path).startsWith(`${nameKey(folder)}/`);
    return ![...this.files.values()].some((file) => inside(file.path)) && ![...this.folders].some((f) => inside(f));
  }
  async removeEmptyFolder(folder: string) {
    if (!(await this.isEmptyFolder(folder))) throw new Error('not empty');
    for (const f of this.folders) if (nameKey(f) === nameKey(folder)) this.folders.delete(f);
  }
}

const PROJECT_FILE = 'fantasicleds.hdlboard.json';

function project(overrides: Partial<OpenProject> = {}): OpenProject {
  return { ...newProject('Fantasic Leds', [], 'default'), fileName: PROJECT_FILE, ...overrides };
}

const files = (...names: string[]) => names.map((name) => ({ name, text: `-- ${name}` }));
const projectFile = (name = PROJECT_FILE) => ({ name, text: '{}' });

/** Plans against the disk, runs, and records the result the way the Workbench does. */
async function save(disk: MemoryDisk, p: OpenProject, names: string[], overwrite = true) {
  const plan = planDiskSave(p, files(...names), projectFile(p.fileName), await readExisting(disk, p));
  if (plan.clashes.length > 0 && !overwrite) return { plan, project: p };
  const outcome = await runSavePlan(plan, disk);
  return { plan, outcome, project: withOnDisk(p, plan.onDisk, p.fileName) };
}

describe('planDiskSave (docs/impl_project_structure.md § 6.5)', () => {
  it('writes a new file to its target, the project file last', () => {
    const plan = planDiskSave(project(), files('a.vhd', 'b.vhd'), projectFile(), new Set());
    expect(plan.writes.map((w) => w.path)).toEqual(['fantasicleds/src/a.vhd', 'fantasicleds/src/b.vhd', PROJECT_FILE]);
    expect(plan.deletes).toEqual([]);
    expect(plan.clashes).toEqual([]);
    expect(plan.onDisk).toEqual({ 'a.vhd': 'fantasicleds/src/a.vhd', 'b.vhd': 'fantasicleds/src/b.vhd' });
  });

  it('writes a file at its own place again without asking', () => {
    const p = project({ onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE });
    const plan = planDiskSave(p, files('a.vhd'), projectFile(), new Set(['fantasicleds/src/a.vhd', nameKey(PROJECT_FILE)]));
    expect(plan.clashes).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('copies a flat file and keeps the original (D9)', () => {
    const p = project({ onDisk: { 'a.vhd': 'a.vhd' }, onDiskFileName: PROJECT_FILE });
    const plan = planDiskSave(p, files('a.vhd'), projectFile(), new Set(['a.vhd', nameKey(PROJECT_FILE)]));
    expect(plan.writes[0].path).toBe('fantasicleds/src/a.vhd');
    expect(plan.deletes).toEqual([]);
  });

  it('moves a file out of the old source folder (D10)', () => {
    const p = project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE });
    const plan = planDiskSave(p, files('a.vhd'), projectFile(), new Set(['fantasicleds/src/a.vhd']));
    expect(plan.writes[0].path).toBe('fantasicleds/rtl/a.vhd');
    expect(plan.deletes).toEqual(['fantasicleds/src/a.vhd']);
  });

  it('moves the files and deletes the old project file after a rename (D11, D21)', () => {
    const p = project({ fileName: 'newname.hdlboard.json', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE });
    const plan = planDiskSave(p, files('a.vhd'), projectFile('newname.hdlboard.json'), new Set());
    expect(plan.writes.map((w) => w.path)).toEqual(['newname/src/a.vhd', 'newname.hdlboard.json']);
    expect(plan.deletes).toEqual(['fantasicleds/src/a.vhd', PROJECT_FILE]);
  });

  it('asks before a rename overwrites another project file (AC-18)', () => {
    const p = project({ fileName: 'other.hdlboard.json', onDiskFileName: PROJECT_FILE });
    const plan = planDiskSave(p, [], projectFile('other.hdlboard.json'), new Set(['other.hdlboard.json']));
    expect(plan.clashes).toEqual(['other.hdlboard.json']);
  });

  it('asks before overwriting a file that is not its own, listing the full relative path (D12)', () => {
    const plan = planDiskSave(project(), files('DE1_SoC.vhdl'), projectFile(), new Set(['fantasicleds/src/de1_soc.vhdl']));
    expect(plan.clashes).toEqual(['fantasicleds/src/DE1_SoC.vhdl']);
  });

  it('asks before a first save overwrites a project file of the same name', () => {
    const plan = planDiskSave(project(), [], projectFile(), new Set([nameKey(PROJECT_FILE)]));
    expect(plan.clashes).toEqual([PROJECT_FILE]);
  });

  it('decides "same place" ignoring case (proj/src/x vs proj/Src/x)', () => {
    const p = project({ sourceDirectory: 'Src', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE });
    const plan = planDiskSave(p, files('a.vhd'), projectFile(), new Set(['fantasicleds/src/a.vhd', nameKey(PROJECT_FILE)]));
    // Only the case of the source folder changed: write only, no delete, no clash.
    expect(plan.writes[0].path).toBe('fantasicleds/Src/a.vhd');
    expect(plan.deletes).toEqual([]);
    expect(plan.clashes).toEqual([]);
  });

  it('writes the project file text it is given, not the last saved one', () => {
    const p = project({ savedText: 'stale' });
    const plan = planDiskSave(p, [], { name: PROJECT_FILE, text: 'current' }, new Set());
    expect(plan.writes[plan.writes.length - 1]).toEqual({ path: PROJECT_FILE, text: 'current' });
  });

  it('plans 500 files in one pass', () => {
    const names = Array.from({ length: 500 }, (_, i) => `f${i}.vhd`);
    const p = project({ onDisk: Object.fromEntries(names.map((n) => [n, n])), onDiskFileName: PROJECT_FILE });
    const plan = planDiskSave(p, files(...names), projectFile(), new Set(names));
    expect(plan.writes).toHaveLength(501);
    expect(plan.clashes).toEqual([]);
  });
});

describe('running a plan against a disk', () => {
  it('saves a new project into the folder layout (AC-1)', async () => {
    const disk = new MemoryDisk();
    await save(disk, project(), ['a.vhd', 'b.vhd']);
    expect(disk.paths()).toEqual(['fantasicleds.hdlboard.json', 'fantasicleds/src/a.vhd', 'fantasicleds/src/b.vhd']);
  });

  it('keeps two projects with the same file names apart in one folder (AC-2)', async () => {
    const disk = new MemoryDisk();
    await save(disk, project(), ['DE1_SoC.vhdl']);
    await save(disk, { ...newProject('x', [], 'default'), fileName: 'not_so_fantasicleds.hdlboard.json' }, ['DE1_SoC.vhdl']);
    expect(disk.paths()).toEqual([
      'fantasicleds.hdlboard.json',
      'fantasicleds/src/DE1_SoC.vhdl',
      'not_so_fantasicleds.hdlboard.json',
      'not_so_fantasicleds/src/DE1_SoC.vhdl',
    ]);
  });

  it('converts a flat project, leaving the flat files alone (AC-3)', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: '{}', 'a.vhd': 'old' });
    await save(disk, project({ onDisk: { 'a.vhd': 'a.vhd' }, onDiskFileName: PROJECT_FILE }), ['a.vhd']);
    expect(disk.paths()).toEqual(['a.vhd', PROJECT_FILE, 'fantasicleds/src/a.vhd']);
  });

  it('moves the files when the source folder changes and reports the emptied folder (AC-4, D13)', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: '{}', 'fantasicleds/src/a.vhd': 'A' });
    const { outcome } = await save(disk, project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE }), ['a.vhd']);
    expect(disk.paths()).toEqual([PROJECT_FILE, 'fantasicleds/rtl/a.vhd']);
    // Left in place, offered for removal.
    expect(disk.folders.has('fantasicleds/src')).toBe(true);
    expect(outcome?.emptiedFolders).toEqual(['fantasicleds/src']);
  });

  it('does not offer a folder that still holds other files', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: '{}', 'fantasicleds/src/a.vhd': 'A', 'fantasicleds/src/notes.txt': 'mine' });
    const { outcome } = await save(disk, project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE }), ['a.vhd']);
    expect(outcome?.emptiedFolders).toEqual([]);
  });

  it('a renamed project opens again with every file, and the old project file is gone (AC-13)', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: '{}', 'fantasicleds/src/a.vhd': 'A' });
    await save(disk, project({ fileName: 'newname.hdlboard.json', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE }), ['a.vhd']);
    expect(disk.paths()).toEqual(['newname.hdlboard.json', 'newname/src/a.vhd']);
  });

  it('AC-15: a second save after a conversion or a move writes nothing outside the target paths and deletes nothing', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: '{}', 'a.vhd': 'flat', 'fantasicleds/old/b.vhd': 'B' });
    const first = await save(disk, project({ sourceDirectory: 'src', onDisk: { 'a.vhd': 'a.vhd', 'b.vhd': 'fantasicleds/old/b.vhd' }, onDiskFileName: PROJECT_FILE }), ['a.vhd', 'b.vhd']);
    const after = disk.paths();
    disk.writes = [];
    const second = await save(disk, first.project, ['a.vhd', 'b.vhd']);
    expect(second.plan.deletes).toEqual([]);
    expect(second.plan.clashes).toEqual([]);
    expect(disk.writes).toEqual(['fantasicleds/src/a.vhd', 'fantasicleds/src/b.vhd', PROJECT_FILE]);
    expect(disk.paths()).toEqual(after);
  });

  it('AC-17: changing only the case of the source folder leaves one folder with every file in it', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: '{}', 'fantasicleds/src/a.vhd': 'A' });
    const { plan } = await save(disk, project({ sourceDirectory: 'Src', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE }), ['a.vhd']);
    expect(plan.clashes).toEqual([]);
    expect(disk.paths()).toEqual([PROJECT_FILE, 'fantasicleds/src/a.vhd']);
    expect(disk.text('fantasicleds/src/a.vhd')).toBe('-- a.vhd');
  });

  it('a failed write deletes nothing and keeps the old project file (AC-7)', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: 'old', 'fantasicleds/src/a.vhd': 'A', 'fantasicleds/src/b.vhd': 'B' });
    disk.failWrite = 'fantasicleds/rtl/b.vhd';
    const p = project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd', 'b.vhd': 'fantasicleds/src/b.vhd' }, onDiskFileName: PROJECT_FILE });
    const error = await save(disk, p, ['a.vhd', 'b.vhd']).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveWriteError);
    expect((error as SaveWriteError).path).toBe('fantasicleds/rtl/b.vhd');
    expect((error as SaveWriteError).written).toEqual(['fantasicleds/rtl/a.vhd']);
    expect(disk.text(PROJECT_FILE)).toBe('old');
    expect(disk.text('fantasicleds/src/a.vhd')).toBe('A');
    expect(disk.text('fantasicleds/src/b.vhd')).toBe('B');
  });

  it('a write fails partway; the next successful save leaves exactly the targets and completes the moves', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: 'old', 'fantasicleds/src/a.vhd': 'A', 'fantasicleds/src/b.vhd': 'B' });
    disk.failWrite = 'fantasicleds/rtl/b.vhd';
    const p = project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd', 'b.vhd': 'fantasicleds/src/b.vhd' }, onDiskFileName: PROJECT_FILE });
    const error = (await save(disk, p, ['a.vhd', 'b.vhd']).catch((e: unknown) => e)) as SaveWriteError;
    disk.failWrite = undefined;
    // The Workbench keeps what was written as the project's own.
    const again = await save(disk, { ...p, ownWrites: [...error.written] }, ['a.vhd', 'b.vhd']);
    expect(again.plan.clashes).toEqual([]);
    expect(disk.paths()).toEqual([PROJECT_FILE, 'fantasicleds/rtl/a.vhd', 'fantasicleds/rtl/b.vhd']);
    expect(again.project.ownWrites).toBeUndefined();
  });

  it('a failed delete leaves a stray copy and does not fail the save; the next save does not retry it', async () => {
    const disk = new MemoryDisk({ [PROJECT_FILE]: '{}', 'fantasicleds/src/a.vhd': 'A' });
    disk.failRemove = 'fantasicleds/src/a.vhd';
    const first = await save(disk, project({ sourceDirectory: 'rtl', onDisk: { 'a.vhd': 'fantasicleds/src/a.vhd' }, onDiskFileName: PROJECT_FILE }), ['a.vhd']);
    expect(first.outcome?.leftBehind).toEqual([{ path: 'fantasicleds/src/a.vhd', reason: 'in use' }]);
    const second = await save(disk, first.project, ['a.vhd']);
    expect(second.plan.deletes).toEqual([]);
  });

  it('Cancel on a clash writes nothing (AC-5)', async () => {
    const disk = new MemoryDisk({ 'fantasicleds/src/a.vhd': 'someone else' });
    const { plan } = await save(disk, project(), ['a.vhd'], false);
    expect(plan.clashes).toEqual(['fantasicleds/src/a.vhd']);
    expect(disk.writes).toEqual([]);
    expect(disk.text('fantasicleds/src/a.vhd')).toBe('someone else');
  });
});
