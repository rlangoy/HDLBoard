// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { paneRunFor, type PaneRunInput } from './paneRun';

const design: PaneRunInput = {
  status: 'stopped',
  runFileId: null,
  runUnitName: null,
  target: { fileId: 'a', line: 1, unitName: 'a' },
  folder: 'vhdl',
  pane: 'rtl',
};

describe('paneRunFor', () => {
  test('offers Play on a design while nothing runs', () => {
    expect(paneRunFor(design)).toBe('play');
  });

  test('offers nothing on a work/ file in the design pane', () => {
    expect(paneRunFor({ ...design, folder: 'work' })).toBeNull();
  });

  test('offers Play on a work/ testbench in the TB pane', () => {
    expect(paneRunFor({ ...design, folder: 'work', pane: 'tb' })).toBe('play');
  });

  test('shows Stop on the pane whose file is compiling', () => {
    expect(paneRunFor({ ...design, status: 'compiling', runFileId: 'a' })).toBe('stop');
  });

  test('shows Stop on the pane running its unit', () => {
    expect(paneRunFor({ ...design, status: 'running', runFileId: 'a', runUnitName: 'A' })).toBe('stop');
  });

  test('greys Play out on a pane of the same file showing another unit', () => {
    expect(paneRunFor({ ...design, status: 'running', runFileId: 'a', runUnitName: 'a_tb' })).toBe('blocked');
  });

  test('greys Play out on another file while a run goes', () => {
    expect(paneRunFor({ ...design, status: 'running', runFileId: 'b' })).toBe('blocked');
  });

  test('offers nothing while running on a file that could not run from this pane', () => {
    expect(paneRunFor({ ...design, status: 'running', runFileId: 'b', folder: 'work' })).toBeNull();
  });
});
