// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { createZip, readZip } from './zip';
import { baseName, filesInZip, isZipName } from './zipUpload';
import { projectZipEntries } from './download';

// Made by Python's zipfile with ZIP_DEFLATED, as Windows Explorer and macOS Finder pack:
// project/ (a folder), project/vhdl/counter.vhd ("library ieee;\n" × 20),
// __MACOSX/project/._counter.vhd and project/verilog/top.v.
const DEFLATED_ZIP =
  'UEsDBBQAAAAIACeIQV0AAAAAAgAAAAAAAAAIAAAAcHJvamVjdC8DAFBLAwQUAAAACAAniEFdlV9K9hUAAAAYAQAAGAAAAHByb2plY3QvdmhkbC9jb3VudGVyLnZoZMvJTCpKLKpUyExNTbXmyhnlKUB4AFBLAwQUAAAACAAniEFdgxbcjAMAAAABAAAAHgAAAF9fTUFDT1NYL3Byb2plY3QvLl9jb3VudGVyLnZoZKsAAFBLAwQUAAAACAAniEFddfuTGRQAAAAWAAAAFQAAAHByb2plY3QvdmVyaWxvZy90b3AudsvNTynNSVUoyS+wVkjNS8kFc7kAUEsBAhQAFAAAAAgAJ4hBXQAAAAACAAAAAAAAAAgAAAAAAAAAAAAQAP1BAAAAAHByb2plY3QvUEsBAhQAFAAAAAgAJ4hBXZVfSvYVAAAAGAEAABgAAAAAAAAAAAAAAIABKAAAAHByb2plY3QvdmhkbC9jb3VudGVyLnZoZFBLAQIUABQAAAAIACeIQV2DFtyMAwAAAAEAAAAeAAAAAAAAAAAAAACAAXMAAABfX01BQ09TWC9wcm9qZWN0Ly5fY291bnRlci52aGRQSwECFAAUAAAACAAniEFddfuTGRQAAAAWAAAAFQAAAAAAAAAAAAAAgAGyAAAAcHJvamVjdC92ZXJpbG9nL3RvcC52UEsFBgAAAAAEAAQACwEAAPkAAAAAAA==';

const deflated = () => Uint8Array.from(atob(DEFLATED_ZIP), (c) => c.charCodeAt(0));
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('readZip', () => {
  test('reads back what Download All wrote, folders and UTF-8 included', async () => {
    const files = [
      { name: 'DE1_SoC.vhdl', folder: 'vhdl' as const, content: '-- Ø\nentity x is end;\n' },
      { name: 'top.v', folder: 'verilog' as const, content: 'module top; endmodule\n' },
    ];
    const read = await readZip(createZip(projectZipEntries(files)));
    expect(read.map((f) => [f.path, text(f.data)])).toEqual([
      ['vhdl/DE1_SoC.vhdl', files[0].content],
      ['verilog/top.v', files[1].content],
    ]);
  });

  test('inflates deflated entries and leaves folders out', async () => {
    const read = await readZip(deflated());
    expect(read.map((f) => f.path)).toEqual([
      'project/vhdl/counter.vhd',
      '__MACOSX/project/._counter.vhd',
      'project/verilog/top.v',
    ]);
    expect(text(read[0].data)).toBe('library ieee;\n'.repeat(20));
  });

  test('throws for something that is no ZIP', async () => {
    await expect(readZip(new TextEncoder().encode('just text, no archive'))).rejects.toThrow();
  });
});

describe('zip upload', () => {
  test('isZipName and baseName', () => {
    expect(isZipName('HDLBoard-project-2026-10-01.ZIP')).toBe(true);
    expect(isZipName('counter.vhd')).toBe(false);
    expect(baseName('vhdl/sub/counter.vhd')).toBe('counter.vhd');
    expect(baseName('counter.vhd')).toBe('counter.vhd');
    expect(baseName('a\\b\\c.v')).toBe('c.v');
  });

  test('filesInZip names files by base name and drops macOS resource forks', async () => {
    const files = await filesInZip(new Blob([deflated()]));
    expect(files.map((f) => f.name)).toEqual(['counter.vhd', 'top.v']);
    expect(await files[1].text()).toBe('module top; endmodule\n');
  });
});
