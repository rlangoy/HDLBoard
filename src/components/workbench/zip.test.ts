// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { crc32, createZip } from './zip';
import { projectZipEntries, projectZipName } from './download';

/** Reads a stored-only archive back through its central directory. */
function readZip(zip: Uint8Array): { path: string; text: string; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const eocd = zip.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const path = decoder.decode(zip.subarray(p + 46, p + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(local + 26, true);
    const dataStart = local + 30 + localNameLen + view.getUint16(local + 28, true);
    const data = zip.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    out.push({ path, text: decoder.decode(data), crc });
    p += 46 + nameLen;
  }
  return out;
}

describe('crc32', () => {
  test('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('createZip', () => {
  test('round-trips paths and UTF-8 content', () => {
    const zip = createZip([
      { path: 'vhdl/DE1_SoC.vhdl', data: 'entity DE1_SoC is\nend entity;\n' },
      { path: 'verilog/tellerØ.v', data: '// blåbær\nmodule m; endmodule\n' },
    ]);
    expect(readZip(zip)).toMatchObject([
      { path: 'vhdl/DE1_SoC.vhdl', text: 'entity DE1_SoC is\nend entity;\n' },
      { path: 'verilog/tellerØ.v', text: '// blåbær\nmodule m; endmodule\n' },
    ]);
  });

  test('an empty project is still a valid (empty) archive', () => {
    expect(readZip(createZip([]))).toEqual([]);
  });
});

describe('projectZipEntries', () => {
  test('mirrors the folder tree and de-duplicates clashing names', () => {
    const entries = projectZipEntries([
      { name: 'a.vhd', folder: 'vhdl', content: '1' },
      { name: 'a.vhd', folder: 'vhdl', content: '2' },
      { name: 'A.vhd', folder: 'vhdl', content: '3' },
      { name: 'a.vhd', folder: 'work', content: '4' },
      { name: 'README', folder: 'vhdl', content: '5' },
      { name: 'README', folder: 'vhdl', content: '6' },
    ]);
    expect(entries.map((e) => e.path)).toEqual([
      'vhdl/a.vhd',
      'vhdl/a (2).vhd',
      'vhdl/A (3).vhd',
      'work/a.vhd',
      'vhdl/README',
      'vhdl/README (2)',
    ]);
  });
});

describe('projectZipName', () => {
  test('is dated in local time', () => {
    expect(projectZipName(new Date(2026, 8, 7))).toBe('HDLBoard-project-2026-09-07.zip');
  });
});
