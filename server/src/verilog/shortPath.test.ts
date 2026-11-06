// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { hasSpace, posixLinkPath, windowsShortPath } from './shortPath.js';
import { hasShellSpecial } from './toolPaths.js';
import { makeTempDir } from '../testSupport/sessionDir.js';

const WINDOWS_ONLY = process.platform === 'win32' ? false : 'the 8.3 short form exists only on Windows';
const POSIX_ONLY = process.platform === 'win32' ? 'the link is the Linux form' : false;

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

describe('posixLinkPath', () => {
  const temp = makeTempDir('hdlboard-link-');
  after(() => temp.cleanup());

  test('returns a path the shell would not split unchanged', () => {
    assert.equal(posixLinkPath('/tmp/.mount_HDLBoaX1/resources/iverilog'), '/tmp/.mount_HDLBoaX1/resources/iverilog');
  });

  test('names the same folder by a link without a space', { skip: POSIX_ONLY }, () => {
    const spaced = join(temp.path, 'HDL Board ø', 'iverilog');
    mkdirSync(spaced, { recursive: true });
    writeFileSync(join(spaced, 'vvp.conf'), '');
    const link = posixLinkPath(spaced, temp.path);
    assert.equal(hasShellSpecial(link), false, `link still has a shell character: ${link}`);
    assert.equal(realpathSync(join(link, 'vvp.conf')), realpathSync(join(spaced, 'vvp.conf')));
  });

  test('keeps the original when the temporary directory would need quoting too', { skip: POSIX_ONLY }, () => {
    const spaced = join(temp.path, 'HDL Board', 'iverilog');
    mkdirSync(spaced, { recursive: true });
    assert.equal(posixLinkPath(spaced, join(temp.path, 'HDL Board')), spaced);
  });
});
