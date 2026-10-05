// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseWorkspace, serializeWorkspace, type Workspace } from './desktop';

const ws: Workspace = {
  files: [
    { id: 'a', name: 'a.vhdl', folder: 'vhdl', content: 'x' },
    { id: 'file-3', name: 'b.v', folder: 'verilog', content: 'y' },
  ],
  activeFileId: 'file-3',
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
      activeFileId: 'gone',
      topFileId: 'gone',
      topUnit: 'x',
      testbench: { roles: { a: 'maybe', gone: 'tb' }, pairs: { a: 'gone' } },
    });
    expect(parseWorkspace(stored)).toEqual({
      files: [ws.files[0]],
      activeFileId: 'a',
      topFileId: null,
      topUnit: null,
      testbench: { roles: {}, pairs: {} },
    });
  });

  it('reads a workspace stored before the testbench split as having no overrides', () => {
    const { topUnit: _unit, testbench: _overrides, ...old } = ws;
    expect(parseWorkspace(serializeWorkspace(old))).toEqual({ ...old, topUnit: null, testbench: { roles: {}, pairs: {} } });
  });

  it('stores the shown file as activeFileId, and no tabs', () => {
    const stored = JSON.parse(serializeWorkspace(ws));
    expect(stored.activeFileId).toBe('file-3');
    expect(stored).not.toHaveProperty('openTabs');
  });

  it('reads the shown file of a workspace from 1.3.0 or earlier from its active tab', () => {
    const { activeFileId: _shown, ...rest } = ws;
    const old = JSON.stringify({ version: 1, ...rest, openTabs: ['a', 'file-3'], activeTabId: 'a' });
    expect(parseWorkspace(old)?.activeFileId).toBe('a');
  });

  it('shows the first file in Files order when the stored one is gone', () => {
    const stored = JSON.stringify({ version: 1, ...ws, activeFileId: 'gone' });
    expect(parseWorkspace(stored)?.activeFileId).toBe('a');
  });

  it('shows nothing in a workspace with no files', () => {
    const stored = JSON.stringify({ version: 1, ...ws, files: [] });
    expect(parseWorkspace(stored)?.activeFileId).toBeNull();
  });
});
