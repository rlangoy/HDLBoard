// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { after, afterEach, describe, test } from 'node:test';
import { startTestBackend } from '../testSupport/testBackend.js';
import { getToolPaths, setToolPaths } from './tools.js';
import { resolveToolPaths } from './toolPaths.js';

describe('the configured Icarus tools', () => {
  const original = getToolPaths();
  afterEach(() => setToolPaths(original));

  test('default to whatever the environment and PATH say', () => {
    setToolPaths(resolveToolPaths(process.env));
    assert.deepEqual(getToolPaths(), resolveToolPaths(process.env));
  });

  test('can be set once at startup and read back by the engine', () => {
    setToolPaths({ iverilog: '/x/iverilog', vvp: '/x/vvp' });
    assert.deepEqual(getToolPaths(), { iverilog: '/x/iverilog', vvp: '/x/vvp' });
  });
});

describe('starting the backend with Icarus options', () => {
  const original = getToolPaths();
  // Native to each platform: a backslash is a shell character on Linux, so there the tree would be linked (shortPath.ts).
  const bundle = process.platform === 'win32' ? 'C:\\bundle\\iverilog' : '/bundle/iverilog';
  after(() => setToolPaths(original));

  test('a bundled directory option is applied before anything can spawn', async () => {
    const backend = await startTestBackend({ iverilogDir: bundle });
    try {
      assert.equal(getToolPaths().bundledDir, bundle);
    } finally {
      await backend.stop();
    }
  });

  test('explicit executables are applied when there is no bundled directory', async (t) => {
    // A bundled tree from the environment outranks explicit executables; CI sets one.
    const inherited = process.env.IVERILOG_DIR;
    delete process.env.IVERILOG_DIR;
    t.after(() => {
      if (inherited !== undefined) process.env.IVERILOG_DIR = inherited;
    });
    const backend = await startTestBackend({ iverilogExe: '/opt/bin/iverilog', vvpExe: '/opt/bin/vvp' });
    try {
      assert.deepEqual(getToolPaths(), { iverilog: '/opt/bin/iverilog', vvp: '/opt/bin/vvp' });
    } finally {
      await backend.stop();
    }
  });
});
