// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseWorkspace, serializeWorkspace, type Workspace } from './desktop';

const ws: Workspace = {
  files: [
    { id: 'a', name: 'a.vhdl', folder: 'vhdl', content: 'x' },
    { id: 'file-3', name: 'b.v', folder: 'verilog', content: 'y' },
  ],
  openTabs: ['a', 'file-3'],
  activeTabId: 'file-3',
  topFileId: 'a',
  topUnit: 'a_tb',
  testbench: { roles: { a: 'tb' }, pairs: { 'file-3': 'a' } },
};

describe('workspace storage format', () => {
  it('round-trips', () => {
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws);
  });

  it('rejects nothing stored, bad JSON and foreign shapes', () => {
    expect(parseWorkspace(null)).toBeUndefined();
    expect(parseWorkspace('{')).toBeUndefined();
    expect(parseWorkspace('[]')).toBeUndefined();
    expect(parseWorkspace(JSON.stringify({ ...ws, version: 99 }))).toBeUndefined();
  });

  it('drops malformed files and dangling references', () => {
    const stored = JSON.stringify({
      version: 1,
      files: [ws.files[0], { id: 'bad', name: 1 }, { ...ws.files[0], content: 'dup' }],
      openTabs: ['gone', 'a', 'a'],
      activeTabId: 'gone',
      topFileId: 'gone',
      topUnit: 'x',
      testbench: { roles: { a: 'maybe', gone: 'tb' }, pairs: { a: 'gone' } },
    });
    expect(parseWorkspace(stored)).toEqual({
      files: [ws.files[0]],
      openTabs: ['a'],
      activeTabId: 'a',
      topFileId: null,
      topUnit: null,
      testbench: { roles: {}, pairs: {} },
    });
  });

  it('reads a workspace stored before the testbench split as having no overrides', () => {
    const { topUnit: _unit, testbench: _overrides, ...old } = ws;
    expect(parseWorkspace(serializeWorkspace(old))).toEqual({ ...old, topUnit: null, testbench: { roles: {}, pairs: {} } });
  });
});
