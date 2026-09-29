// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { runIconFor } from './runIcon';

const design = { id: 'a', folder: 'vhdl' } as const;
const testbench = { id: 'tb', folder: 'work' } as const;

describe('runIconFor', () => {
  test('offers Play on the active tab while nothing runs', () => {
    expect(runIconFor('stopped', null, design)).toEqual({ tabId: 'a', kind: 'play' });
  });

  test('offers nothing on a tab whose file cannot be top', () => {
    expect(runIconFor('stopped', null, testbench)).toBeNull();
  });

  test('offers nothing with no tab open', () => {
    expect(runIconFor('stopped', null, undefined)).toBeNull();
  });

  test('keeps Stop on the running file while another tab is active', () => {
    expect(runIconFor('running', 'b', design)).toEqual({ tabId: 'b', kind: 'stop' });
  });

  test('shows Stop on the file being compiled', () => {
    expect(runIconFor('compiling', 'a', design)).toEqual({ tabId: 'a', kind: 'stop' });
  });

  test('offers no Play while a run with no top file is going', () => {
    expect(runIconFor('running', null, design)).toBeNull();
  });
});
