// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { folderAfterRename, folderForUpload, hasTopDot, sourceFolderFor, topAfterDelete } from './fileKinds';

describe('folderForUpload', () => {
  test.each(['a.v', 'A.V', 'defs.vh'])('K-1: %s goes to verilog/', (name) => {
    expect(folderForUpload(name)).toBe('verilog');
  });

  test.each(['a.vhd', 'a.vhdl', 'A.VHD'])('K-2: %s goes to vhdl/', (name) => {
    expect(folderForUpload(name)).toBe('vhdl');
  });

  test('K-3: a VHDL testbench goes to work/', () => {
    expect(folderForUpload('tb_a.vhd')).toBe('work');
    expect(folderForUpload('TB_a.vhdl')).toBe('work');
  });

  test('K-4: a Verilog testbench stays in verilog/', () => {
    expect(folderForUpload('tb_a.v')).toBe('verilog');
  });

  test.each(['a.txt', 'a', 'a.vhd.txt', 'notes.verilog'])('K-5: %s is not accepted', (name) => {
    expect(folderForUpload(name)).toBeUndefined();
  });
});

describe('sourceFolderFor', () => {
  test('K-6: a top file in verilog/ sends verilog/', () => {
    expect(sourceFolderFor({ folder: 'verilog' })).toBe('verilog');
  });

  test.each([{ folder: 'vhdl' as const }, { folder: 'work' as const }, undefined])('K-7: %j sends vhdl/', (top) => {
    expect(sourceFolderFor(top)).toBe('vhdl');
  });
});

describe('folderAfterRename', () => {
  test('K-8: changing the language moves the file to the new language’s folder', () => {
    expect(folderAfterRename('vhdl', 'x.v')).toBe('verilog');
    expect(folderAfterRename('verilog', 'x.vhd')).toBe('vhdl');
    expect(folderAfterRename('work', 'x.v')).toBe('verilog');
  });

  test('K-9: a rename within the language, or to an unknown extension, stays put', () => {
    expect(folderAfterRename('vhdl', 'y.vhdl')).toBe('vhdl');
    expect(folderAfterRename('verilog', 'y.vh')).toBe('verilog');
    expect(folderAfterRename('work', 'tb_y.vhd')).toBe('work');
    expect(folderAfterRename('vhdl', 'y.txt')).toBe('vhdl');
  });
});

describe('hasTopDot', () => {
  test('is true for the design folders only', () => {
    expect(hasTopDot('vhdl')).toBe(true);
    expect(hasTopDot('verilog')).toBe(true);
    expect(hasTopDot('work')).toBe(false);
  });
});

describe('topAfterDelete', () => {
  const files = [
    { id: 'a', folder: 'vhdl' as const },
    { id: 'b', folder: 'verilog' as const },
    { id: 'c', folder: 'verilog' as const },
    { id: 'd', folder: 'work' as const },
  ];

  test('E-7: the top falls to another file in the same folder', () => {
    expect(topAfterDelete(files, 'b')).toBe('c');
  });

  test('is nothing when the deleted file was the last of its folder', () => {
    expect(topAfterDelete(files, 'a')).toBeNull();
  });

  test('is nothing for a folder that cannot hold a top file', () => {
    expect(topAfterDelete(files, 'd')).toBeNull();
  });
});
