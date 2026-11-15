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
import { Session, crashOf } from './session.js';

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
  /** Runs a batch design that prints `output`, then exits with `code` and `stderr`. */
  async function failedRun(
    output: readonly string[],
    result: { code: number | null; stderr: string; signal?: NodeJS.Signals | null },
    crashes: string[] = [],
  ): Promise<ServerFrame | undefined> {
    const frames: ServerFrame[] = [];
    const engine: SimEngine = {
      language: 'vhdl',
      prepare: async () => ({ ok: true, plan: batchPlan(tmpdir()) }),
      startBoardRun: () => assert.fail('a batch run'),
      startBatchRun: (_plan, run) => {
        for (const line of output) run.onOutput(line);
        return { kill: () => {}, done: Promise.resolve({ ...result, timedOut: false }) };
      },
    };
    const session = new Session((frame) => frames.push(frame), () => engine, { onCrash: (crash) => crashes.push(crash) });
    await session.handleRun(FILES, 'top.vhdl');
    await settle();
    session.destroy();
    return frames.find((frame) => frame.verb === 'ERROR');
  }

  test('a segfault is a crash for the server log, quoting its stderr', async () => {
    const crashes: string[] = [];
    await failedRun([], { code: null, stderr: 'Segmentation fault\n(core dumped)', signal: 'SIGSEGV' }, crashes);
    assert.deepEqual(crashes, ['GHDL crashed on SIGSEGV: Segmentation fault']);
  });

  test('a silent failure is logged too: the student is told only a guess', async () => {
    const crashes: string[] = [];
    await failedRun([], { code: 1, stderr: '' }, crashes);
    assert.deepEqual(crashes, ['GHDL exited with exit code 1 and no message']);
  });

  test("a design's own error is no crash: the simulator said why", async () => {
    const crashes: string[] = [];
    await failedRun(['ghdl:error: bound check failure at top.vhdl:19'], { code: 1, stderr: '' }, crashes);
    assert.deepEqual(crashes, []);
  });

  test("GHDL's own error on stdout is the reason, not an unexplained exit", async () => {
    const error = await failedRun(['ghdl:error: bound check failure at top.vhdl:19', 'ghdl:error: simulation failed'], { code: 1, stderr: '' });
    assert.deepEqual(error, { verb: 'ERROR', stage: 'runtime', text: 'The simulation stopped as reported above.' });
  });

  test("Icarus's $fatal on stdout is the reason too", async () => {
    const error = await failedRun(['FATAL: top.v:1: boom 3', '       Time: 5  Scope: t'], { code: 1, stderr: '' });
    assert.equal(error?.verb === 'ERROR' && error.text, 'The simulation stopped as reported above.');
  });

  test('stderr, when there is any, still says it — and a crash after a report is still a crash', async () => {
    const crashes: string[] = [];
    const error = await failedRun(['ghdl:error: simulation failed'], { code: 1, stderr: 'Segmentation fault' }, crashes);
    assert.equal(error?.verb === 'ERROR' && error.text, 'Segmentation fault');
    assert.deepEqual(crashes, ['GHDL crashed with exit code 1: Segmentation fault']);
  });

  test('a signal after an Icarus $error is a crash, and the student is not pointed at the $error', async () => {
    const saved = process.env.HDLBOARD_SIM_MEMORY_MB;
    delete process.env.HDLBOARD_SIM_MEMORY_MB;
    try {
      const crashes: string[] = [];
      const error = await failedRun(['ERROR: top.v:4: mismatch', '       Time: 5  Scope: t'], { code: null, stderr: '', signal: 'SIGSEGV' }, crashes);
      assert.deepEqual(crashes, ['GHDL crashed on SIGSEGV']);
      assert.equal(error?.verb === 'ERROR' && error.text, 'Simulation exited unexpectedly.');
    } finally {
      if (saved !== undefined) process.env.HDLBOARD_SIM_MEMORY_MB = saved;
    }
  });

  test("an installed GHDL names itself by its path: C:\\…\\ghdl.exe:error: and /usr/bin/ghdl-mcode:error:", async () => {
    for (const line of [
      'C:\\Program Files\\HDLBoard\\resources\\ghdl\\bin\\ghdl.exe:error: index (5) out of bounds (0 to 3) at bound.vhdl:9',
      '/usr/bin/ghdl-mcode:error: bound check failure at top.vhdl:19',
    ]) {
      const crashes: string[] = [];
      const error = await failedRun([line], { code: 1, stderr: '' }, crashes);
      assert.equal(error?.verb === 'ERROR' && error.text, 'The simulation stopped as reported above.', line);
      assert.deepEqual(crashes, [], line);
    }
  });

  test("a design's own std.env.stop(1) is no crash", async () => {
    const crashes: string[] = [];
    const error = await failedRun(['simulation stopped @5ns with status 1'], { code: 1, stderr: '' }, crashes);
    assert.equal(error?.verb === 'ERROR' && error.text, 'The simulation stopped as reported above.');
    assert.deepEqual(crashes, []);
  });

  test("a student's own $display(\"ERROR: ...\") is no simulator report: a silent exit after it is still logged", async () => {
    const crashes: string[] = [];
    await failedRun(['ERROR: mismatch at 40'], { code: 1, stderr: '' }, crashes);
    assert.deepEqual(crashes, ['GHDL exited with exit code 1 and no message']);
  });

  test('a report the line budget dropped is quoted whole, so the student still gets it', async () => {
    const flood = Array.from({ length: 300 }, (_, i) => `tick ${i}`);
    const error = await failedRun([...flood, 'ghdl:error: bound check failure at top.vhdl:19'], { code: 1, stderr: '' });
    assert.equal(error?.verb === 'ERROR' && error.text, 'The simulation stopped:\nghdl:error: bound check failure at top.vhdl:19');
  });

  test('stderr that is only whitespace is no message', async () => {
    const error = await failedRun(['ghdl:error: bound check failure at top.vhdl:19'], { code: 1, stderr: '\n' });
    assert.equal(error?.verb === 'ERROR' && error.text, 'The simulation stopped as reported above.');
  });

  test('a memory cap that is no whole number is not named', async () => {
    const saved = process.env.HDLBOARD_SIM_MEMORY_MB;
    process.env.HDLBOARD_SIM_MEMORY_MB = '96M';
    try {
      const error = await failedRun([], { code: 1, stderr: '' });
      assert.equal(error?.verb === 'ERROR' && error.text, 'Simulation exited unexpectedly.');
    } finally {
      if (saved === undefined) delete process.env.HDLBOARD_SIM_MEMORY_MB;
      else process.env.HDLBOARD_SIM_MEMORY_MB = saved;
    }
  });

  test("the design's own report text is no simulator error", async () => {
    const saved = process.env.HDLBOARD_SIM_MEMORY_MB;
    delete process.env.HDLBOARD_SIM_MEMORY_MB;
    try {
      const error = await failedRun(['top.vhdl:5:5:@0ms:(report note): an error occurred'], { code: 1, stderr: '' });
      assert.equal(error?.verb === 'ERROR' && error.text, 'Simulation exited unexpectedly.');
    } finally {
      if (saved !== undefined) process.env.HDLBOARD_SIM_MEMORY_MB = saved;
    }
  });

  test('a silent exit on a memory-capped host names the cap', async () => {
    const saved = process.env.HDLBOARD_SIM_MEMORY_MB;
    process.env.HDLBOARD_SIM_MEMORY_MB = '96';
    try {
      const error = await failedRun([], { code: 139, stderr: '' });
      assert.match(error?.verb === 'ERROR' ? error.text : '', /^Simulation exited unexpectedly, possibly out of memory: each simulation on this server gets 96 MB\./);
    } finally {
      if (saved === undefined) delete process.env.HDLBOARD_SIM_MEMORY_MB;
      else process.env.HDLBOARD_SIM_MEMORY_MB = saved;
    }
  });
});

describe('crashOf', () => {
  const exit = (code: number | null, stderr: string, signal: NodeJS.Signals | null = null) => crashOf({ code, stderr, signal });

  test('a signal is a crash', () => {
    assert.equal(exit(null, '', 'SIGBUS'), 'crashed on SIGBUS');
  });

  test('an exit code from 128 up is a signal a shell reported', () => {
    assert.equal(exit(139, ''), 'crashed with exit code 139');
  });

  test('stderr naming a crash is one, whatever the exit code', () => {
    assert.equal(exit(1, 'std::bad_alloc'), 'crashed with exit code 1: std::bad_alloc');
  });

  test('an ordinary error on stderr is no crash', () => {
    assert.equal(exit(1, 'vvp: Unable to open input file.'), undefined);
  });

  test('quotes one printable line, so stderr cannot write lines into the log', () => {
    assert.equal(exit(null, 'Segmentation fault\u001b[31m\nhdl-board: fake', 'SIGSEGV'), 'crashed on SIGSEGV: Segmentation fault?[31m');
  });
});

describe('crashOf on Windows', () => {
  test('a Windows status reads as hex: an access violation is 0xC0000005', () => {
    assert.equal(crashOf({ code: 3221225477, stderr: '', signal: null }), 'crashed with exit code 0xC0000005');
  });
});

describe('crashOf: wording', () => {
  test('a Windows stderr keeps no carriage return in the log', () => {
    assert.equal(crashOf({ code: 3221225477, stderr: 'Segmentation fault\r\n(core dumped)', signal: null }), 'crashed with exit code 0xC0000005: Segmentation fault');
  });

  test('no exit code and no signal reads as a sentence', () => {
    assert.equal(crashOf({ code: null, stderr: '', signal: null }), 'exited with no exit code and no message');
  });
});
