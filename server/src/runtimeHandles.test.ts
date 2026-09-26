// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, test } from 'node:test';
import { createBatchHandle, createRunHandle } from './runtime.js';

const node = process.execPath;
const SHORT_TIMEOUT_MS = 300;
const WAIT_MS = 5_000;

const spawnNode = (script: string) => spawn(node, ['-e', script]);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves with the first value a callback-registering function delivers. */
function firstValue<T>(register: (deliver: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve) => register(resolve));
}

describe('createRunHandle', () => {
  test('delivers each line the process prints, one call per line', async () => {
    const handle = createRunHandle(spawnNode('console.log("one"); console.log("two");'));
    const lines: string[] = [];
    handle.onOutput((line) => lines.push(line));
    await firstValue<unknown>((deliver) => handle.onExit(deliver));
    assert.deepEqual(lines, ['one', 'two']);
  });

  test('reports the exit code and everything written to stderr', async () => {
    const handle = createRunHandle(spawnNode('console.error("boom"); process.exit(3);'));
    const [code, stderr] = await firstValue<[number | null, string]>((deliver) =>
      handle.onExit((exitCode, text) => deliver([exitCode, text])),
    );
    assert.equal(code, 3);
    assert.equal(stderr.trim(), 'boom');
  });

  test('writes pacing grants to the process as lines it can read from stdin', async () => {
    const script = 'let n = 0; process.stdin.on("data", (d) => { n += String(d).split("\\n").length - 1; if (n >= 3) { console.log("got " + n); process.exit(0); } });';
    const handle = createRunHandle(spawnNode(script));
    const printed = firstValue<string>((deliver) => handle.onOutput(deliver));
    handle.grantPacing(3);
    assert.equal(await printed, 'got 3');
  });

  test('does nothing when asked to grant zero lines', async () => {
    const handle = createRunHandle(spawnNode('setTimeout(() => process.exit(0), 100);'));
    handle.grantPacing(0);
    await firstValue<unknown>((deliver) => handle.onExit(deliver));
  });

  test('ignores a grant that arrives after the process has gone, instead of crashing the backend', async () => {
    const handle = createRunHandle(spawnNode('process.exit(0);'));
    await firstValue<unknown>((deliver) => handle.onExit(deliver));
    handle.grantPacing(5);
    await delay(50); // an unhandled EPIPE would surface here as an uncaught exception
  });

  test('stops the process when killed, and reports that it exited', async () => {
    const handle = createRunHandle(spawnNode('setInterval(() => {}, 1000);'));
    const exited = firstValue<unknown>((deliver) => handle.onExit(deliver));
    handle.kill();
    await Promise.race([exited, delay(WAIT_MS).then(() => assert.fail('the process was not stopped'))]);
  });

  test('delivers no output after it has been killed', async () => {
    const handle = createRunHandle(spawnNode('setInterval(() => console.log("tick"), 20);'));
    const lines: string[] = [];
    handle.onOutput((line) => lines.push(line));
    await delay(150);
    handle.kill();
    const countAtKill = lines.length;
    await delay(150);
    assert.equal(lines.length, countAtKill);
  });
});

describe('createBatchHandle', () => {
  test('resolves when the process ends on its own, having shown its output', async () => {
    const lines: string[] = [];
    const handle = createBatchHandle(spawnNode('console.log("done");'), (line) => lines.push(line), WAIT_MS);
    assert.deepEqual(await handle.done, { code: 0, timedOut: false, stderr: '' });
    assert.deepEqual(lines, ['done']);
  });

  test('carries a failing exit code and its stderr', async () => {
    const handle = createBatchHandle(spawnNode('console.error("bad"); process.exit(2);'), () => {}, WAIT_MS);
    const result = await handle.done;
    assert.equal(result.code, 2);
    assert.equal(result.stderr.trim(), 'bad');
  });

  test('stops a process that outlives its timeout, and says so', async () => {
    const handle = createBatchHandle(spawnNode('setInterval(() => {}, 1000);'), () => {}, SHORT_TIMEOUT_MS);
    const result = await handle.done;
    assert.equal(result.timedOut, true);
  });

  test('stops the process when killed, without reporting a timeout', async () => {
    const handle = createBatchHandle(spawnNode('setInterval(() => {}, 1000);'), () => {}, WAIT_MS);
    handle.kill();
    const result = await handle.done;
    assert.equal(result.timedOut, false);
  });
});
