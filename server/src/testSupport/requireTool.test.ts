// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, describe, test, type TestContext } from 'node:test';
import { findOnPath, requireTool } from './requireTool.js';
import { makeTempDir } from './sessionDir.js';

const tempDir = makeTempDir('hdlboard-tool-');
after(() => tempDir.cleanup());

const NO_PATH: NodeJS.ProcessEnv = { PATH: '' };
/** A repository root with no vendored tree in it, so a machine's real one cannot leak into a test. */
const NO_VENDORED_TREE = tempDir.path;
const FAKE_EXE_NAME = process.platform === 'win32' ? 'iverilog.exe' : 'iverilog';

function createFakeIverilog(): string {
  const path = join(tempDir.path, FAKE_EXE_NAME);
  writeFileSync(path, '');
  return path;
}

/** A stand-in repository root holding a vendored `winInstaller/vendor/iverilog/iverilog`. */
function repoWithVendoredTree(t: TestContext): { root: string; exe: string } {
  const repo = makeTempDir('hdlboard-repo-');
  t.after(() => repo.cleanup());
  const treeDir = join(repo.path, 'winInstaller', 'vendor', 'iverilog');
  mkdirSync(treeDir, { recursive: true });
  const exe = join(treeDir, FAKE_EXE_NAME);
  writeFileSync(exe, '');
  return { root: repo.path, exe };
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

  test('finds ghdl in the bin directory of GHDL_DIR', (t) => {
    const install = makeTempDir('hdlboard-ghdl-');
    t.after(() => install.cleanup());
    mkdirSync(join(install.path, 'bin'));
    const exe = join(install.path, 'bin', process.platform === 'win32' ? 'ghdl.exe' : 'ghdl');
    writeFileSync(exe, '');
    assert.equal(requireTool('ghdl', { ...NO_PATH, GHDL_DIR: install.path }).exe, exe);
  });

  test('explains what to set when the tool is missing', () => {
    const lookup = requireTool('ghdl', NO_PATH);
    assert.equal(lookup.exe, null);
    assert.match(String(lookup.skip), /ghdl not found.*GHDL_EXE/);
  });

  test('ignores an environment path that does not exist', () => {
    const lookup = requireTool('iverilog', { ...NO_PATH, IVERILOG_EXE: join(tempDir.path, 'missing') }, NO_VENDORED_TREE);
    assert.equal(lookup.exe, null);
  });

  test('falls back to the vendored Icarus tree in the repository, before PATH', (t) => {
    const repo = repoWithVendoredTree(t);
    assert.equal(requireTool('iverilog', NO_PATH, repo.root).exe, repo.exe);
  });

  test('prefers an explicit environment setting over the vendored tree', (t) => {
    const repo = repoWithVendoredTree(t);
    const explicit = createFakeIverilog();
    assert.equal(requireTool('iverilog', { ...NO_PATH, IVERILOG_EXE: explicit }, repo.root).exe, explicit);
  });

  test('does not look for ghdl in the vendored Icarus tree', () => {
    assert.equal(requireTool('ghdl', NO_PATH, tempDir.path).exe, null);
  });
});
