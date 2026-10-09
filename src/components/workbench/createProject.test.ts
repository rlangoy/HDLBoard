// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import {
  availableFiles,
  filesInProject,
  parseStoredProject,
  projectEntries,
  startProject,
  withDetails,
  withEntryEdited,
  withEntryRemoved,
  withEntryRenamed,
  withFileLeft,
  withFilesAdded,
} from './projectFile';
import { projectSnapshot } from './projectGitHub';

/** Create Project (projectFile.ts): a new project, and the files in Files it may take. */

const IN_FILES = ['adder.vhd', 'adder_tb.vhd', 'notes.vhd'];
const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name);

describe('Create Project', () => {
  it('starts empty, offering every file now in Files', () => {
    const project = startProject(IN_FILES);
    expect([names(projectEntries(project, IN_FILES)), availableFiles(project, IN_FILES)]).toEqual([[], IN_FILES]);
  });

  it('starts without a name, so the student names it', () => {
    expect(startProject(IN_FILES).name).toBe('');
  });

  it('adds the files the student picks, in Files order', () => {
    const project = withFilesAdded(startProject(IN_FILES), ['notes.vhd', 'adder.vhd']);
    expect([names(projectEntries(project, IN_FILES)), availableFiles(project, IN_FILES)]).toEqual([['adder.vhd', 'notes.vhd'], ['adder_tb.vhd']]);
  });

  it('lets a file made later join at once', () => {
    const project = startProject(IN_FILES);
    expect(names(projectEntries(project, [...IN_FILES, 'counter.vhd']))).toEqual(['counter.vhd']);
  });

  it('takes a file out of the project, keeping it in Files and its description', () => {
    const described = withEntryEdited(withFilesAdded(startProject(IN_FILES), IN_FILES), 'adder.vhd', { description: 'the design' });
    const left = withFileLeft(described, 'adder.vhd');
    const back = withFilesAdded(left, ['adder.vhd']);
    expect([availableFiles(left, IN_FILES), projectEntries(back, IN_FILES).find((row) => row.name === 'adder.vhd')?.description]).toEqual([
      ['adder.vhd'],
      'the design',
    ]);
  });

  it('keeps an offered file offered when it is renamed, and forgets it when it is deleted', () => {
    const renamed = withEntryRenamed(startProject(IN_FILES), 'notes.vhd', 'readme.vhd');
    const deleted = withEntryRemoved(renamed, 'adder.vhd');
    expect(availableFiles(deleted, ['adder_tb.vhd', 'readme.vhd'])).toEqual(['adder_tb.vhd', 'readme.vhd']);
  });

  it('saves only the files in the project', () => {
    const project = withFilesAdded(startProject(IN_FILES), ['adder.vhd']);
    const files = IN_FILES.map((name) => ({ name, content: name }));
    expect([names(filesInProject(project, files)), names(projectSnapshot(project, files).files)]).toEqual([
      ['adder.vhd'],
      ['project.hdlboard.json', 'adder.vhd'],
    ]);
  });

  it('names the project file after the project while it has never been saved', () => {
    const named = withDetails(startProject(IN_FILES), { name: '4-bit Adder' });
    expect(named.fileName).toBe('4-bit-adder.hdlboard.json');
  });

  it('keeps a project file name the student chose', () => {
    const chosen = withDetails(startProject(IN_FILES), { fileName: 'lab1.hdlboard.json' });
    expect(withDetails(chosen, { name: 'Lab 1' }).fileName).toBe('lab1.hdlboard.json');
  });

  it('keeps the file name of a project that was opened or saved', () => {
    const opened = { ...withDetails(startProject([]), { name: 'Adder' }), location: 'adder.hdlboard.json' };
    expect(withDetails(opened, { name: 'Adder 2' }).fileName).toBe('adder.hdlboard.json');
  });

  it('remembers the offered files in the desktop workspace', () => {
    const project = startProject(IN_FILES);
    expect(parseStoredProject(JSON.parse(JSON.stringify(project)))?.excluded).toEqual(project.excluded);
  });
});
