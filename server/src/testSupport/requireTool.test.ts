// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { findOnPath, requireTool } from './requireTool.js';
import { makeTempDir } from './sessionDir.js';

const tempDir = makeTempDir('hdlboard-tool-');
after(() => tempDir.cleanup());

const NO_PATH: NodeJS.ProcessEnv = { PATH: '' };
const FAKE_EXE_NAME = process.platform === 'win32' ? 'iverilog.exe' : 'iverilog';

function createFakeIverilog(): string {
  const path = join(tempDir.path, FAKE_EXE_NAME);
  writeFileSync(path, '');
  return path;
}

describe('findOnPath', () => {
  test('finds an executable that is in a PATH directory', () => {
    const found = findOnPath('node', { PATH: dirname(process.execPath) });
    assert.ok(found?.toLowerCase().includes('node'));
  });

  test('returns null when PATH is empty', () => {
    assert.equal(findOnPath('node', NO_PATH), null);
  });

  test('returns null for a name that is not on PATH', () => {
    assert.equal(findOnPath('no-such-tool-hdlboard', { PATH: dirname(process.execPath) }), null);
  });
});

describe('requireTool', () => {
  test('prefers the bundled directory named by IVERILOG_DIR', () => {
    const exe = createFakeIverilog();
    const lookup = requireTool('iverilog', { ...NO_PATH, IVERILOG_DIR: tempDir.path });
    assert.deepEqual(lookup, { exe, skip: false });
  });

  test('accepts an explicit IVERILOG_EXE', () => {
    const exe = createFakeIverilog();
    assert.equal(requireTool('iverilog', { ...NO_PATH, IVERILOG_EXE: exe }).exe, exe);
  });

  test('accepts an explicit GHDL_EXE', () => {
    const exe = createFakeIverilog();
    assert.equal(requireTool('ghdl', { ...NO_PATH, GHDL_EXE: exe }).exe, exe);
  });

  test('explains what to set when the tool is missing', () => {
    const lookup = requireTool('ghdl', NO_PATH);
    assert.equal(lookup.exe, null);
    assert.match(String(lookup.skip), /ghdl not found.*GHDL_EXE/);
  });

  test('ignores an environment path that does not exist', () => {
    const lookup = requireTool('iverilog', { ...NO_PATH, IVERILOG_EXE: join(tempDir.path, 'missing') });
    assert.equal(lookup.exe, null);
  });
});
