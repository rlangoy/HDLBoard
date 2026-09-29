// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { PrepareResult, RunPlan, SimEngine } from './engines/types.js';
import type { ServerFrame } from './protocol.js';
import type { BatchHandle } from './runtime.js';
import { Session } from './session.js';

const verbs = (frames: readonly ServerFrame[]) => frames.map((frame) => frame.verb);

/** A promise and the function that settles it, so a test decides when a compile finishes. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

/** Lets the continuation after `engine.prepare` run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const batchPlan = (dir: string): RunPlan => ({
  mode: 'batch',
  dir,
  runTarget: 'top',
  timing: { pollIntervalNs: 1, minDwellNs: 1 },
  pacing: 'stdin',
  messages: [],
});

/** An engine whose compiles finish only when the test says so, and which counts the runs it starts. */
function controlledEngine() {
  const compiles: Array<ReturnType<typeof deferred<PrepareResult>>> = [];
  const started: BatchHandle[] = [];
  const engine: SimEngine = {
    language: 'vhdl',
    prepare: () => {
      const compile = deferred<PrepareResult>();
      compiles.push(compile);
      return compile.promise;
    },
    startBoardRun: () => assert.fail('these tests only prepare batch runs'),
    startBatchRun: () => {
      const handle: BatchHandle = { kill: () => {}, done: new Promise(() => {}) };
      started.push(handle);
      return handle;
    },
  };
  return { engine, compiles, started };
}

const FILES = [{ name: 'top.vhdl', content: '' }];

describe('Session file names', () => {
  test('refuses a name that would be written outside the session directory', async () => {
    const escaped = join(tmpdir(), 'hdl-board-session-test-escape.vhdl');
    rmSync(escaped, { force: true });
    const frames: ServerFrame[] = [];
    const session = new Session((frame) => frames.push(frame));

    await session.handleRun([{ name: '../hdl-board-session-test-escape.vhdl', content: '' }], undefined);
    session.destroy();

    assert.equal(existsSync(escaped), false);
    assert.deepEqual(frames[0], {
      verb: 'ERROR',
      stage: 'analyze',
      text: '../hdl-board-session-test-escape.vhdl must be a plain file name, not a folder or a path.',
    });
  });

  test('refuses a name the compiler would read as an option', async () => {
    const frames: ServerFrame[] = [];
    const { engine, compiles } = controlledEngine();
    const session = new Session((frame) => frames.push(frame), () => engine);

    await session.handleRun([{ name: '-top.vhdl', content: '' }], undefined);
    session.destroy();

    assert.equal(compiles.length, 0);
    assert.deepEqual(verbs(frames), ['ERROR']);
  });
});

describe('Session runs that outlive their request', () => {
  test('a compile that finishes after the session closed starts nothing', async () => {
    const frames: ServerFrame[] = [];
    const { engine, compiles, started } = controlledEngine();
    const session = new Session((frame) => frames.push(frame), () => engine);

    const run = session.handleRun(FILES, 'top.vhdl');
    session.destroy();
    compiles[0].resolve({ ok: true, plan: batchPlan(tmpdir()) });
    await run;

    assert.equal(started.length, 0);
    assert.deepEqual(frames, []);
  });

  test('only the newest of two overlapping RUNs starts a simulation', async () => {
    const frames: ServerFrame[] = [];
    const { engine, compiles, started } = controlledEngine();
    const session = new Session((frame) => frames.push(frame), () => engine);

    const first = session.handleRun(FILES, 'top.vhdl');
    const second = session.handleRun(FILES, 'top.vhdl');
    compiles[1].resolve({ ok: true, plan: batchPlan(tmpdir()) });
    await second;
    compiles[0].resolve({ ok: true, plan: batchPlan(tmpdir()) });
    await first;
    await settle();
    session.destroy();

    assert.equal(started.length, 1);
    assert.deepEqual(verbs(frames), ['READY']);
  });

  test('a run that dies silently says why it may have, where runs are memory-capped', async () => {
    const saved = process.env.HDLBOARD_SIM_MEMORY_MB;
    const errorFor = async (capMb: string | undefined) => {
      if (capMb === undefined) delete process.env.HDLBOARD_SIM_MEMORY_MB;
      else process.env.HDLBOARD_SIM_MEMORY_MB = capMb;
      const frames: ServerFrame[] = [];
      const { engine, compiles } = controlledEngine();
      engine.startBatchRun = () => ({ kill: () => {}, done: Promise.resolve({ code: null, timedOut: false, stderr: '' }) });
      const session = new Session((frame) => frames.push(frame), () => engine);
      const run = session.handleRun(FILES, 'top.vhdl');
      compiles[0].resolve({ ok: true, plan: batchPlan(tmpdir()) });
      await run;
      await settle();
      session.destroy();
      return frames.find((frame) => frame.verb === 'ERROR');
    };
    try {
      assert.deepEqual(await errorFor(undefined), { verb: 'ERROR', stage: 'runtime', text: 'Simulation exited unexpectedly.' });
      const capped = await errorFor('96');
      assert.ok(capped?.verb === 'ERROR' && capped.text.includes('possibly out of memory') && capped.text.includes('96 MB'));
    } finally {
      if (saved === undefined) delete process.env.HDLBOARD_SIM_MEMORY_MB;
      else process.env.HDLBOARD_SIM_MEMORY_MB = saved;
    }
  });

  test('a superseded compile that fails reports nothing', async () => {
    const frames: ServerFrame[] = [];
    const { engine, compiles } = controlledEngine();
    const session = new Session((frame) => frames.push(frame), () => engine);

    const first = session.handleRun(FILES, 'top.vhdl');
    const second = session.handleRun(FILES, 'top.vhdl');
    compiles[0].resolve({ ok: false, stage: 'analyze', text: 'stale error' });
    await first;
    compiles[1].resolve({ ok: true, plan: batchPlan(tmpdir()) });
    await second;
    session.destroy();

    assert.deepEqual(verbs(frames), ['READY']);
  });
});
