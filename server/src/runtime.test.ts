// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { lineSplitter, runCommand } from './runtime.js';
import { makeTempDir } from './testSupport/sessionDir.js';

const SHORT_TIMEOUT_MS = 300;
const node = process.execPath;

describe('lineSplitter', () => {
  function collect(): { lines: string[]; feed: (chunk: Buffer | string) => void } {
    const lines: string[] = [];
    return { lines, feed: lineSplitter((line) => lines.push(line)) };
  }

  test('emits one line per complete line', () => {
    const { lines, feed } = collect();
    feed('one\ntwo\n');
    assert.deepEqual(lines, ['one', 'two']);
  });

  test('holds a partial line back until its newline arrives', () => {
    const { lines, feed } = collect();
    feed('hel');
    assert.deepEqual(lines, []);
    feed('lo\n');
    assert.deepEqual(lines, ['hello']);
  });

  test('joins a line that a chunk boundary split in two', () => {
    const { lines, feed } = collect();
    feed('a\nbc');
    feed('d\ne\n');
    assert.deepEqual(lines, ['a', 'bcd', 'e']);
  });

  test('keeps empty lines, leaving it to the caller to drop them', () => {
    const { lines, feed } = collect();
    feed('a\n\nb\n');
    assert.deepEqual(lines, ['a', '', 'b']);
  });

  test('treats a Windows line ending as one line ending, not a line that ends in a carriage return', () => {
    const { lines, feed } = collect();
    feed('design says hi\r\nsecond\r\n');
    assert.deepEqual(lines, ['design says hi', 'second']);
  });

  test('handles a Windows line ending split across two chunks', () => {
    const { lines, feed } = collect();
    feed('one\r');
    feed('\ntwo\r\n');
    assert.deepEqual(lines, ['one', 'two']);
  });

  test('accepts a Buffer as well as a string', () => {
    const { lines, feed } = collect();
    feed(Buffer.from('x\n'));
    assert.deepEqual(lines, ['x']);
  });
});

describe('runCommand', () => {
  const cwdDir = makeTempDir('hdlboard-runtime-');
  after(() => cwdDir.cleanup());

  test('returns what the command printed and a zero exit code', async () => {
    const result = await runCommand({ cmd: node, args: ['-e', 'console.log("hi")'], cwd: cwdDir.path });
    assert.equal(result.code, 0);
    assert.equal(result.out.trim(), 'hi');
    assert.equal(result.timedOut, false);
  });

  test('returns stderr and a non-zero exit code when the command fails', async () => {
    const script = 'console.error("boom"); process.exit(3)';
    const result = await runCommand({ cmd: node, args: ['-e', script], cwd: cwdDir.path });
    assert.equal(result.code, 3);
    assert.equal(result.err.trim(), 'boom');
  });

  test('runs in the working directory it is given', async () => {
    const result = await runCommand({ cmd: node, args: ['-e', 'console.log(process.cwd())'], cwd: cwdDir.path });
    assert.equal(result.out.trim().toLowerCase(), cwdDir.path.toLowerCase());
  });

  test('kills a command that outlives its timeout, and says so', async () => {
    const script = 'setInterval(() => {}, 1000)';
    const result = await runCommand({ cmd: node, args: ['-e', script], cwd: cwdDir.path, timeoutMs: SHORT_TIMEOUT_MS });
    assert.equal(result.timedOut, true);
    assert.notEqual(result.code, 0);
  });

  test('reports a program that cannot be started, without throwing', async () => {
    const result = await runCommand({ cmd: 'no-such-program-hdlboard', args: [], cwd: cwdDir.path });
    assert.equal(result.code, -1);
    assert.match(result.err, /ENOENT|no-such-program/);
  });

  test('passes each argument as one argument, never through a shell', async () => {
    const script = 'console.log(process.argv.slice(1).join("|"))';
    const result = await runCommand({ cmd: node, args: ['-e', script, 'a b', '$HOME', '&& echo injected'], cwd: cwdDir.path });
    assert.equal(result.out.trim(), 'a b|$HOME|&& echo injected');
  });
});
