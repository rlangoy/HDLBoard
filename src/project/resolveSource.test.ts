// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { baseName, fileNameProblem, sameFileName } from './fileName';
import { resolveSource } from './resolveSource';
import { selectProjectFile } from './selectProjectFile';
import { entry } from './testHelpers';

/** The resolution table in § 5. */
describe('resolveSource', () => {
  it('resolves an empty url next to a local project file', () => {
    expect(resolveSource(entry('counter.vhd'), 'projects/counter/counter.hdlboard.json')).toBe(
      'projects/counter/counter.vhd',
    );
  });

  it('resolves an empty url next to a Windows path', () => {
    expect(resolveSource(entry('counter.vhd'), 'C:\\work\\counter.hdlboard.json')).toBe('C:\\work\\counter.vhd');
  });

  it('resolves an empty url next to a project file in the current directory', () => {
    expect(resolveSource(entry('counter.vhd'), 'counter.hdlboard.json')).toBe('counter.vhd');
  });

  it('resolves an empty url next to a remote project file', () => {
    expect(resolveSource(entry('counter.vhd'), 'https://example.com/ex1/counter.hdlboard.json')).toBe(
      'https://example.com/ex1/counter.vhd',
    );
  });

  it('uses a non-empty url as-is', () => {
    const shared = entry('debounce.vhd', 'https://other.org/x.vhd');
    expect(resolveSource(shared, 'projects/a.hdlboard.json')).toBe('https://other.org/x.vhd');
    expect(resolveSource(shared, 'https://example.com/a.hdlboard.json')).toBe('https://other.org/x.vhd');
  });
});

describe('file name rules', () => {
  it('accepts plain names', () => {
    expect(fileNameProblem('counter_tb.vhdl')).toBeNull();
    expect(fileNameProblem('my file.v')).toBeNull();
  });

  it('compares names case-insensitively', () => {
    expect(sameFileName('counter.vhd', 'Counter.VHD')).toBe(true);
  });

  it('takes the base name of paths and URLs', () => {
    expect(baseName('https://example.com/ex1/counter.hdlboard.json?x=1')).toBe('counter.hdlboard.json');
    expect(baseName('folder/a%20b.hdlboard.json')).toBe('a b.hdlboard.json');
  });
});

/** Choosing the project file in a folder or gist (§ 6.4). */
describe('selectProjectFile', () => {
  it('reports none when there is no .hdlboard.json file', () => {
    expect(selectProjectFile(['a.vhd', 'b.json'])).toEqual({ kind: 'none' });
  });

  it('picks the only project file automatically, case-insensitively', () => {
    expect(selectProjectFile(['a.vhd', 'Counter.HDLBoard.JSON'])).toEqual({
      kind: 'one',
      name: 'Counter.HDLBoard.JSON',
    });
  });

  it('asks the user when there are several', () => {
    expect(selectProjectFile(['b.hdlboard.json', 'a.vhd', 'a.hdlboard.json'])).toEqual({
      kind: 'several',
      names: ['a.hdlboard.json', 'b.hdlboard.json'],
    });
  });

  it('never treats the sync sidecar as a project file', () => {
    expect(selectProjectFile(['.hdlboard-sync.json'])).toEqual({ kind: 'none' });
  });
});
