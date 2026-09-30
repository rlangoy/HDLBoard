// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { hasSpace, windowsShortPath } from './shortPath.js';
import { makeTempDir } from '../testSupport/sessionDir.js';

const WINDOWS_ONLY = process.platform === 'win32' ? false : 'the 8.3 short form exists only on Windows';

describe('windowsShortPath', () => {
  const temp = makeTempDir('hdlboard-short-');
  after(() => temp.cleanup());

  test('returns a path without a space unchanged', () => {
    assert.equal(windowsShortPath('C:\\HDLBoard\\resources\\iverilog'), 'C:\\HDLBoard\\resources\\iverilog');
  });

  test('names the same folder without a space', { skip: WINDOWS_ONLY }, () => {
    const spaced = join(temp.path, 'Program Files', 'iver ilog');
    mkdirSync(spaced, { recursive: true });
    const short = windowsShortPath(spaced);
    assert.equal(hasSpace(short), false, `short form still has a space: ${short}`);
    assert.equal(realpathSync.native(short).toLowerCase(), realpathSync.native(spaced).toLowerCase());
  });

  test('returns a missing path unchanged', { skip: WINDOWS_ONLY }, () => {
    const missing = join(temp.path, 'no such dir');
    assert.equal(windowsShortPath(missing), missing);
  });
});
