// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { fingerprintOf, isUpToDate, planGistSave, toGistFileChanges } from './gistSavePlan';

const file = (name: string, content: string) => ({ name, content });

describe('planGistSave', () => {
  it('adds new files and leaves unchanged ones alone', () => {
    const plan = planGistSave([file('a.vhd', 'new'), file('b.vhd', 'same')], [file('b.vhd', 'same')], new Set());
    expect(plan).toEqual({ changes: [{ kind: 'add', fileName: 'a.vhd' }], unchangedFileNames: ['b.vhd'] });
  });

  it('updates a file whose text changed', () => {
    const plan = planGistSave([file('a.vhd', 'v2')], [file('a.vhd', 'v1')], new Set());
    expect(plan.changes).toEqual([{ kind: 'update', fileName: 'a.vhd' }]);
  });

  it('ignores a difference in line endings only', () => {
    expect(isUpToDate(planGistSave([file('a.vhd', 'x\r\ny')], [file('a.vhd', 'x\ny')], new Set()))).toBe(true);
  });

  it('deletes a file that left the project', () => {
    const plan = planGistSave([], [file('old.vhd', 'x')], new Set(['old.vhd']));
    expect(plan.changes).toEqual([{ kind: 'delete', fileName: 'old.vhd' }]);
  });

  it('keeps a gist file that never belonged to the project', () => {
    expect(isUpToDate(planGistSave([], [file('README.md', 'notes')], new Set(['old.vhd'])))).toBe(true);
  });

  it('turns the plan into the files of one gist update, null deleting a file', () => {
    const files = [file('a.vhd', 'A')];
    const plan = planGistSave(files, [file('gone.vhd', 'x')], new Set(['gone.vhd']));
    expect(toGistFileChanges(plan, files)).toEqual({ 'a.vhd': { content: 'A' }, 'gone.vhd': null });
  });
});

describe('fingerprintOf', () => {
  it('is the same for the same files in another order', () => {
    expect(fingerprintOf([file('a', '1'), file('b', '2')])).toBe(fingerprintOf([file('b', '2'), file('a', '1')]));
  });

  it('changes when a file changes', () => {
    expect(fingerprintOf([file('a', '1')])).not.toBe(fingerprintOf([file('a', '2')]));
  });

  it('changes when a file is renamed', () => {
    expect(fingerprintOf([file('a', '1')])).not.toBe(fingerprintOf([file('b', '1')]));
  });
});
