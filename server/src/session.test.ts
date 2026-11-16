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

describe('Session teardown', () => {
  test('aborts the compile in progress, so a closed connection leaves no compiler running', async () => {
    const { engine } = controlledEngine();
    let signal: AbortSignal | undefined;
    const prepare = engine.prepare;
    const session = new Session(() => {}, () => ({ ...engine, prepare: (request) => ((signal = request.signal), prepare(request)) }));
    void session.handleRun(FILES, 'top.vhdl');
    await settle();
    session.destroy();
    assert.equal(signal?.aborted, true);
  });
});

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
    await settle(); // the compile has started
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
    await settle(); // the first compile has started; the second RUN waits for it
    const second = session.handleRun(FILES, 'top.vhdl');
    compiles[0].resolve({ ok: true, plan: batchPlan(tmpdir()) });
    await first;
    await settle();
    compiles[1].resolve({ ok: true, plan: batchPlan(tmpdir()) });
    await second;
    await settle();
    session.destroy();

    assert.equal(started.length, 1);
    assert.deepEqual(verbs(frames), ['READY']);
  });

  test('a superseded compile that fails reports nothing', async () => {
    const frames: ServerFrame[] = [];
    const { engine, compiles } = controlledEngine();
    const session = new Session((frame) => frames.push(frame), () => engine);

    const first = session.handleRun(FILES, 'top.vhdl');
    await settle(); // the first compile has started; the second RUN waits for it
    const second = session.handleRun(FILES, 'top.vhdl');
    compiles[0].resolve({ ok: false, stage: 'analyze', text: 'stale error' });
    await first;
    await settle();
    compiles[1].resolve({ ok: true, plan: batchPlan(tmpdir()) });
    await second;
    session.destroy();

    assert.deepEqual(verbs(frames), ['READY']);
  });
});

describe('Session: why a failed run stopped', () => {
  interface FailedRun {
    /** The ERROR frame's text, the student's reason. */
    readonly text: string | undefined;
    /** What the server log heard (`onCrash`). */
    readonly logged: readonly string[];
  }

  /** Runs a batch design that prints `output`, then exits; no memory cap unless given. */
  async function failedRun(
    output: readonly string[],
    exit: { code: number | null; stderr: string; signal?: NodeJS.Signals | null },
    memoryCapMb?: number,
  ): Promise<FailedRun> {
    const frames: ServerFrame[] = [];
    const logged: string[] = [];
    const engine: SimEngine = {
      language: 'vhdl',
      prepare: async () => ({ ok: true, plan: batchPlan(tmpdir()) }),
      startBoardRun: () => assert.fail('a batch run'),
      startBatchRun: (_plan, run) => {
        for (const line of output) run.onOutput(line);
        return { kill: () => {}, done: Promise.resolve({ ...exit, timedOut: false }) };
      },
    };
    const onCrash = (description: string) => logged.push(description);
    const session = new Session((frame) => frames.push(frame), () => engine, { onCrash, memoryCapMb });
    await session.handleRun(FILES, 'top.vhdl');
    await settle();
    session.destroy();
    const error = frames.find((frame) => frame.verb === 'ERROR');
    return { text: error?.verb === 'ERROR' ? error.text : undefined, logged };
  }

  const BOUND_CHECK = 'ghdl:error: bound check failure at top.vhdl:19';

  test("the simulator's own report is the reason", async () => {
    const { text } = await failedRun([BOUND_CHECK, 'ghdl:error: simulation failed'], { code: 1, stderr: '' });
    assert.equal(text, 'The simulation stopped as reported above.');
  });

  test("the simulator's own report is no crash", async () => {
    const { logged } = await failedRun([BOUND_CHECK], { code: 1, stderr: '' });
    assert.deepEqual(logged, []);
  });

  test('a report the output limit dropped is quoted whole, so the student still gets it', async () => {
    const flood = Array.from({ length: 300 }, (_, i) => `tick ${i}`);
    const { text } = await failedRun([...flood, BOUND_CHECK], { code: 1, stderr: '' });
    assert.equal(text, `The simulation stopped:\n${BOUND_CHECK}`);
  });

  test('stderr, when there is any, is the reason', async () => {
    const { text } = await failedRun([], { code: 1, stderr: 'vvp: Unable to open input file.' });
    assert.equal(text, 'vvp: Unable to open input file.');
  });

  test('stderr that is only whitespace is no reason', async () => {
    const { text } = await failedRun([BOUND_CHECK], { code: 1, stderr: '\n' });
    assert.equal(text, 'The simulation stopped as reported above.');
  });

  test('a crash after a report is still logged', async () => {
    const { logged } = await failedRun([BOUND_CHECK], { code: 1, stderr: 'Segmentation fault' });
    assert.deepEqual(logged, ['GHDL crashed with exit code 1: Segmentation fault']);
  });

  test('a crash after a report does not point the student at the report', async () => {
    const { text } = await failedRun(['ERROR: top.v:4: mismatch'], { code: null, stderr: '', signal: 'SIGSEGV' });
    assert.equal(text, 'Simulation exited unexpectedly.');
  });

  test('a run that dies without a word is logged', async () => {
    const { logged } = await failedRun([], { code: 1, stderr: '' });
    assert.deepEqual(logged, ['GHDL exited with exit code 1 and no message']);
  });

  test('a run that dies without a word on a memory-capped host names the cap', async () => {
    const { text } = await failedRun([], { code: 139, stderr: '' }, 96);
    assert.match(text ?? '', /^Simulation exited unexpectedly, possibly out of memory: each simulation on this server gets 96 MB\./);
  });

  test('a $fatal the output limit dropped is quoted, not the $error shown before it', async () => {
    const flood = Array.from({ length: 300 }, (_, i) => `tick ${i}`);
    const { text } = await failedRun(['ERROR: top.v:3: mismatch', ...flood, 'FATAL: top.v:9: boom'], { code: 1, stderr: '' });
    assert.equal(text, 'The simulation stopped:\nFATAL: top.v:9: boom');
  });

  describe("a design's own stop with a status from 128 up (std.env.stop(200))", () => {
    const STOP_200 = 'simulation stopped @5ns with status 200';

    test('is the reason the student is given', async () => {
      const { text } = await failedRun([STOP_200], { code: 200, stderr: '' }, 96);
      assert.equal(text, 'The simulation stopped as reported above.');
    });

    test('is no crash in the server log', async () => {
      const { logged } = await failedRun([STOP_200], { code: 200, stderr: '' });
      assert.deepEqual(logged, []);
    });

    test('a signal after it is still a crash', async () => {
      const { logged } = await failedRun([STOP_200], { code: null, stderr: '', signal: 'SIGKILL' });
      assert.deepEqual(logged, ['GHDL crashed on SIGKILL']);
    });
  });

  test('a $fatal in a file whose name holds spaces is no crash', async () => {
    const { logged } = await failedRun(['FATAL: my test.v:5: fatal reason'], { code: 1, stderr: '' });
    assert.deepEqual(logged, []);
  });
});
