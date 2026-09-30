// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveGhdlExe } from './ghdlPath.js';

const WINDOWS = 'win32';
const LINUX = 'linux';

describe('resolveGhdlExe', () => {
  test('uses ghdl from PATH when nothing is configured', () => {
    assert.equal(resolveGhdlExe({}, {}, LINUX), 'ghdl');
  });

  test('derives bin\\ghdl.exe from an installation directory on Windows', () => {
    assert.equal(resolveGhdlExe({ GHDL_DIR: 'C:\\tools\\ghdl' }, {}, WINDOWS), 'C:\\tools\\ghdl\\bin\\ghdl.exe');
  });

  test('derives bin/ghdl from an installation directory on Linux', () => {
    assert.equal(resolveGhdlExe({ GHDL_DIR: '/opt/ghdl' }, {}, LINUX), '/opt/ghdl/bin/ghdl');
  });

  test('prefers the installation directory over an explicit executable', () => {
    assert.equal(resolveGhdlExe({ GHDL_DIR: '/opt/ghdl', GHDL_EXE: '/usr/bin/ghdl' }, {}, LINUX), '/opt/ghdl/bin/ghdl');
  });

  test('accepts an explicit executable', () => {
    assert.equal(resolveGhdlExe({ GHDL_EXE: '/usr/local/bin/ghdl' }, {}, LINUX), '/usr/local/bin/ghdl');
  });

  test('lets options override the environment', () => {
    assert.equal(resolveGhdlExe({ GHDL_DIR: '/from-env' }, { ghdlDir: '/from-options' }, LINUX), '/from-options/bin/ghdl');
    assert.equal(resolveGhdlExe({ GHDL_EXE: '/env/ghdl' }, { ghdlExe: '/options/ghdl' }, LINUX), '/options/ghdl');
  });

  test('treats empty settings as unset', () => {
    assert.equal(resolveGhdlExe({ GHDL_DIR: '', GHDL_EXE: '' }, { ghdlDir: '' }, LINUX), 'ghdl');
  });
});
