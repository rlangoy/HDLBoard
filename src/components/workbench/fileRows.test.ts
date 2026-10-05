// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { filesInFolderOrder } from './fileKinds';
import { fileAfterDelete, fileRows, rowsByFolder, type RowContext } from './fileRows';
import type { VhdlFile } from './files';

const file = (id: string, folder: VhdlFile['folder']): VhdlFile => ({ id, name: `${id}.x`, folder, content: '' });

// Project order deliberately mixes the folders.
const files = [file('v1', 'verilog'), file('d1', 'vhdl'), file('w1', 'work'), file('d2', 'vhdl')];

const context: RowContext = {
  shownIds: ['d2'],
  topFileId: 'd1',
  roleOf: (id) => (id === 'w1' ? 'tb' : 'rtl'),
  problemsOf: (id) => (id === 'v1' ? { errors: 2, warnings: 1 } : { errors: 0, warnings: 0 }),
};

const ids = (list: readonly { id: string }[]) => list.map((item) => item.id);

describe('filesInFolderOrder', () => {
  test('lists vhdl/, then verilog/, then work/, each in project order', () => {
    expect(ids(filesInFolderOrder(files))).toEqual(['d1', 'd2', 'v1', 'w1']);
  });
});

describe('fileRows', () => {
  test('are in Files order', () => {
    expect(ids(fileRows(files, context))).toEqual(['d1', 'd2', 'v1', 'w1']);
  });

  test('mark shown and top independently', () => {
    const rows = fileRows(files, context);
    expect(rows.map((r) => [r.id, r.shown, r.isTop])).toEqual([
      ['d1', false, true],
      ['d2', true, false],
      ['v1', false, false],
      ['w1', false, false],
    ]);
  });

  test('carry each file’s role and problem counts', () => {
    const [, , verilog, work] = fileRows(files, context);
    expect(verilog.problems).toEqual({ errors: 2, warnings: 1 });
    expect(work.role).toBe('tb');
  });
});

describe('rowsByFolder', () => {
  test('groups the rows and leaves empty folders out', () => {
    const groups = rowsByFolder(fileRows(files.filter((f) => f.folder !== 'verilog'), context));
    expect(groups.map((g) => [g.folder, ids(g.rows)])).toEqual([
      ['vhdl', ['d1', 'd2']],
      ['work', ['w1']],
    ]);
  });
});

describe('fileAfterDelete', () => {
  test('is the next file in Files order', () => {
    expect(fileAfterDelete(files, 'd2')).toBe('v1');
  });

  test('is the file before when the last one goes', () => {
    expect(fileAfterDelete(files, 'w1')).toBe('v1');
  });

  test('is the next file when the first one goes', () => {
    expect(fileAfterDelete(files, 'd1')).toBe('d2');
  });

  test('is nothing when the only file goes', () => {
    expect(fileAfterDelete([file('d1', 'vhdl')], 'd1')).toBeNull();
  });
});
