// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compilerFlags, resolveToolPaths, runtimeFlags, withUsableBundledDir } from './toolPaths.js';

const WINDOWS = 'win32';
const LINUX = 'linux';

describe('withUsableBundledDir', () => {
  const shorten = (dir: string) => dir.replace('Program Files', 'PROGRA~1');

  test('swaps a Windows tree path containing a space for its short form', () => {
    const paths = resolveToolPaths({ IVERILOG_DIR: 'C:\\Program Files\\HDLBoard\\resources\\iverilog' }, {}, WINDOWS);
    assert.deepEqual(withUsableBundledDir(paths, shorten, WINDOWS), {
      iverilog: 'C:\\PROGRA~1\\HDLBoard\\resources\\iverilog\\iverilog.exe',
      vvp: 'C:\\PROGRA~1\\HDLBoard\\resources\\iverilog\\vvp.exe',
      bundledDir: 'C:\\PROGRA~1\\HDLBoard\\resources\\iverilog',
    });
  });

  test('leaves a path without a space, tools from PATH, and Linux alone', () => {
    const plain = resolveToolPaths({ IVERILOG_DIR: 'C:\\HDLBoard\\iverilog' }, {}, WINDOWS);
    assert.equal(withUsableBundledDir(plain, shorten, WINDOWS), plain);
    const onPath = resolveToolPaths({}, {}, WINDOWS);
    assert.equal(withUsableBundledDir(onPath, shorten, WINDOWS), onPath);
    const linux = resolveToolPaths({ IVERILOG_DIR: '/opt/Program Files/iverilog' }, {}, LINUX);
    assert.equal(withUsableBundledDir(linux, shorten, LINUX), linux);
  });

  test('keeps the original when no short form exists', () => {
    const paths = resolveToolPaths({ IVERILOG_DIR: 'C:\\Program Files\\iverilog' }, {}, WINDOWS);
    assert.equal(withUsableBundledDir(paths, (dir) => dir, WINDOWS), paths);
  });
});

describe('resolveToolPaths', () => {
  test('uses iverilog and vvp from PATH when nothing is configured', () => {
    assert.deepEqual(resolveToolPaths({}, {}, LINUX), { iverilog: 'iverilog', vvp: 'vvp' });
  });

  test('derives both programs, with .exe, from a bundled directory on Windows', () => {
    const paths = resolveToolPaths({ IVERILOG_DIR: 'C:\\tools\\iverilog' }, {}, WINDOWS);
    assert.deepEqual(paths, {
      iverilog: 'C:\\tools\\iverilog\\iverilog.exe',
      vvp: 'C:\\tools\\iverilog\\vvp.exe',
      bundledDir: 'C:\\tools\\iverilog',
    });
  });

  test('derives both programs, without an extension, from a bundled directory on Linux', () => {
    const paths = resolveToolPaths({ IVERILOG_DIR: '/opt/iverilog' }, {}, LINUX);
    assert.deepEqual(paths, { iverilog: '/opt/iverilog/iverilog', vvp: '/opt/iverilog/vvp', bundledDir: '/opt/iverilog' });
  });

  test('prefers the bundled directory over explicit executables', () => {
    const env = { IVERILOG_DIR: '/opt/iverilog', IVERILOG_EXE: '/usr/bin/iverilog', VVP_EXE: '/usr/bin/vvp' };
    assert.equal(resolveToolPaths(env, {}, LINUX).iverilog, '/opt/iverilog/iverilog');
  });

  test('takes an explicit iverilog and finds vvp beside it', () => {
    const paths = resolveToolPaths({ IVERILOG_EXE: '/usr/local/bin/iverilog' }, {}, LINUX);
    assert.deepEqual(paths, { iverilog: '/usr/local/bin/iverilog', vvp: '/usr/local/bin/vvp' });
  });

  test('lets an explicit vvp override the one beside iverilog', () => {
    const env = { IVERILOG_EXE: '/usr/local/bin/iverilog', VVP_EXE: '/elsewhere/vvp' };
    assert.equal(resolveToolPaths(env, {}, LINUX).vvp, '/elsewhere/vvp');
  });

  test('takes vvp from PATH when iverilog is only a program name', () => {
    assert.equal(resolveToolPaths({ IVERILOG_EXE: 'iverilog' }, {}, LINUX).vvp, 'vvp');
  });

  test('lets options override the environment', () => {
    const paths = resolveToolPaths({ IVERILOG_DIR: '/from-env' }, { iverilogDir: '/from-options' }, LINUX);
    assert.equal(paths.bundledDir, '/from-options');
  });

  test('ignores an empty setting, as an unset environment variable often is', () => {
    assert.deepEqual(resolveToolPaths({ IVERILOG_DIR: '', IVERILOG_EXE: '' }, {}, LINUX), { iverilog: 'iverilog', vvp: 'vvp' });
  });
});

describe('the flags that point the tools at a bundled tree', () => {
  const bundled = { iverilog: 'C:\\t\\iverilog.exe', vvp: 'C:\\t\\vvp.exe', bundledDir: 'C:\\t' };
  const onPath = { iverilog: 'iverilog', vvp: 'vvp' };

  test('add -B for the compiler and -M for the runtime when the tree is bundled', () => {
    assert.deepEqual(compilerFlags(bundled), ['-BC:\\t']);
    assert.deepEqual(runtimeFlags(bundled), ['-MC:\\t']);
  });

  test('add nothing for a system install, which finds its own files', () => {
    assert.deepEqual(compilerFlags(onPath), []);
    assert.deepEqual(runtimeFlags(onPath), []);
  });
});
