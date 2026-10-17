// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The session's side of the waveform (docs/waveform_viewer_spec.md § 7.4, § 7.5) with a
 * fake engine: which frames a run sends, when the file is offered, and when it goes.
 */

import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import type { PrepareRequest, RunPlan, SimEngine } from '../engines/types.js';
import type { ServerFrame } from '../protocol.js';
import type { BatchResult } from '../runtime.js';
import { Session } from '../session.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const verbs = (frames: readonly ServerFrame[]) => frames.map((frame) => frame.verb);
const FILES = [{ name: 'tb.vhdl', content: '' }];

interface FakeRun {
  readonly dir: string;
  readonly waveFile: string | undefined;
  finish(result: Partial<BatchResult>): void;
  killed: boolean;
}

/** An engine that plans a batch run (with a waveform when asked) and lets the test end it. */
function waveEngine(content = 'wave data') {
  const runs: FakeRun[] = [];
  const requests: PrepareRequest[] = [];
  const engine: SimEngine = {
    language: 'vhdl',
    prepare: async (request) => {
      requests.push(request);
      const plan: RunPlan = {
        mode: 'batch',
        dir: request.dir,
        runTarget: 'tb',
        timing: { pollIntervalNs: 1, minDwellNs: 1 },
        pacing: 'stdin',
        messages: [],
        ...(request.wave === undefined ? {} : { wave: { format: request.wave.vhdlFormat } }),
      };
      return { ok: true, plan };
    },
    startBoardRun: () => assert.fail('batch runs only'),
    startBatchRun: (plan, { waveFile }) => {
      if (waveFile !== undefined) writeFileSync(join(plan.dir, waveFile), content);
      let settleRun!: (result: BatchResult) => void;
      const done = new Promise<BatchResult>((resolve) => (settleRun = resolve));
      const run: FakeRun = {
        dir: plan.dir,
        waveFile,
        killed: false,
        finish: (result) => settleRun({ code: 0, timedOut: false, stderr: '', ...result }),
      };
      runs.push(run);
      return {
        kill: () => {
          run.killed = true;
          run.finish({ code: null });
        },
        done,
      };
    },
  };
  return { engine, runs, requests };
}

function session(options: ConstructorParameters<typeof Session>[2] = {}) {
  const frames: ServerFrame[] = [];
  const chunks: Buffer[] = [];
  const fake = waveEngine();
  const s = new Session((frame) => frames.push(frame), () => fake.engine, { sendBinary: (c) => chunks.push(c), vhdlWaveFormat: 'ghw', ...options });
  return { s, frames, chunks, ...fake };
}

describe('recording a waveform', () => {
  test('off by default: no WAVE frames, nothing asked of the engine (NFR-5)', async () => {
    const { s, frames, runs, requests } = session();
    await s.handleRun(FILES, 'tb.vhdl');
    runs[0].finish({});
    await settle();
    s.destroy();
    assert.equal(requests[0].wave, undefined);
    assert.equal(runs[0].waveFile, undefined);
    assert.deepEqual(verbs(frames), ['READY', 'DONE']);
  });

  test('on: WAVE-READY before DONE, then the file on WAVE-GET', async () => {
    const { s, frames, chunks, runs } = session();
    s.handleWave(true);
    await s.handleRun(FILES, 'tb.vhdl');
    assert.equal(runs[0].waveFile, 'wave-1.ghw');
    runs[0].finish({});
    await settle();
    assert.deepEqual(verbs(frames), ['READY', 'WAVE-READY', 'DONE']);
    assert.deepEqual(frames[1], { verb: 'WAVE-READY', run: 1, format: 'ghw', bytes: 9, status: 'complete' });

    await s.handleWaveGet(1);
    s.destroy();
    assert.deepEqual(verbs(frames).slice(3), ['WAVE-BEGIN', 'WAVE-END']);
    assert.equal(gunzipSync(Buffer.concat(chunks)).toString(), 'wave data');
  });

  test('a failing testbench still offers its waveform as complete', async () => {
    const { s, frames, runs } = session();
    s.handleWave(true);
    await s.handleRun(FILES, 'tb.vhdl');
    runs[0].finish({ code: 1, stderr: 'assertion failure' });
    await settle();
    s.destroy();
    assert.deepEqual(verbs(frames), ['READY', 'WAVE-READY', 'ERROR']);
    assert.equal((frames[1] as { status: string }).status, 'complete');
  });

  test('Stop offers what was recorded, as stopped', async () => {
    const { s, frames } = session();
    s.handleWave(true);
    await s.handleRun(FILES, 'tb.vhdl');
    s.handleStop();
    await settle();
    s.destroy();
    assert.deepEqual(verbs(frames), ['READY', 'WAVE-READY', 'DONE']);
    assert.equal((frames[1] as { status: string }).status, 'stopped');
  });

  test('WAVE-GET before the run ends, or for an older run, is WAVE-NONE', async () => {
    const { s, frames, runs } = session();
    s.handleWave(true);
    await s.handleRun(FILES, 'tb.vhdl');
    await s.handleWaveGet(1);
    runs[0].finish({});
    await settle();
    await s.handleRun(FILES, 'tb.vhdl');
    runs[1].finish({});
    await settle();
    await s.handleWaveGet(1);
    s.destroy();
    assert.deepEqual(frames[1], { verb: 'WAVE-NONE', run: 1 });
    assert.deepEqual(frames[frames.length - 1], { verb: 'WAVE-NONE', run: 1 });
  });

  test('the next run deletes the old file and names its own', async () => {
    const { s, runs } = session();
    s.handleWave(true);
    await s.handleRun(FILES, 'tb.vhdl');
    runs[0].finish({});
    await settle();
    const first = join(runs[0].dir, runs[0].waveFile ?? assert.fail('the first run recorded no waveform'));
    assert.ok(existsSync(first));
    await s.handleRun(FILES, 'tb.vhdl');
    assert.equal(existsSync(first), false);
    assert.equal(runs[1].waveFile, 'wave-2.ghw');
    s.destroy();
  });

  test('the size guard stops a run whose waveform is too large and says why', async () => {
    const { s, frames, runs } = session({ maxWaveBytes: 4, waveCheckMs: 5 });
    s.handleWave(true);
    await s.handleRun(FILES, 'tb.vhdl');
    await wait(40);
    await settle();
    s.destroy();
    assert.equal(runs[0].killed, true);
    assert.deepEqual(verbs(frames), ['READY', 'WAVE-READY', 'LOG', 'DONE']);
    assert.equal((frames[1] as { status: string }).status, 'size-limit');
    assert.match((frames[2] as { text: string }).text, /too large/);
    assert.deepEqual(frames[3], { verb: 'DONE', reason: 'stopped' });
  });

  test('a timed-out run offers its waveform as timeout', async () => {
    const { s, frames, runs } = session();
    s.handleWave(true);
    await s.handleRun(FILES, 'tb.vhdl');
    runs[0].finish({ code: null, timedOut: true });
    await settle();
    s.destroy();
    assert.equal((frames[1] as { status: string }).status, 'timeout');
  });
});
