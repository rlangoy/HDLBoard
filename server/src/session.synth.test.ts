// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How the session runs the synthesis check of protocol 8 beside a run: it never delays
 * READY, it holds for one RUN, and only a newer RUN stops it (docs/impl_sim_only_warnings.md § 7).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PrepareResult, RunPlan, SimEngine, SynthCommand } from './engines/types.js';
import type { ServerFrame, SynthCheckRequest } from './protocol.js';
import type { BatchHandle } from './runtime.js';
import { Session } from './session.js';
import { SynthSlots } from './synthCheck.js';

const FILES = [
  { name: 'top.vhd', content: 'entity top' },
  { name: 'top_tb.vhd', content: 'entity top_tb' },
];
const CHECK: SynthCheckRequest = { id: 7, top: 'top', files: ['top.vhd'] };

const planOf = (dir: string): RunPlan => ({
  mode: 'batch',
  dir,
  runTarget: 'top_tb',
  timing: { pollIntervalNs: 1, minDwellNs: 1 },
  pacing: 'stdin',
  messages: [],
  synth: { flags: ['--std=08'], order: ['top.vhd', 'top_tb.vhd'] },
});

/** The check's "tool": Node running `script` in the check's folder. */
const nodeTool = (script: string): SynthCommand => ({ cmd: process.execPath, args: ['-e', script], extraFiles: [] });

interface EngineSetup {
  readonly tool?: SynthCommand;
  readonly compiles?: boolean;
}

/** A batch engine whose compile succeeds (or fails) at once and whose run never ends by itself. */
function engineOf({ tool = nodeTool(''), compiles = true }: EngineSetup = {}) {
  const asked: Array<{ top: string; files: readonly string[] }> = [];
  const engine: SimEngine = {
    language: 'vhdl',
    prepare: (request): Promise<PrepareResult> =>
      Promise.resolve(compiles ? { ok: true, plan: planOf(request.dir) } : { ok: false, stage: 'analyze', text: 'top.vhd:1:1: error' }),
    startBoardRun: () => assert.fail('these tests only prepare batch runs'),
    startBatchRun: (): BatchHandle => ({ kill: () => {}, done: new Promise(() => {}) }),
    synthCommand: (_inputs, target) => {
      asked.push(target);
      return tool;
    },
  };
  return { engine, asked };
}

function sessionWith(engine: SimEngine, options: { synthTimeoutMs?: number; slots?: number } = {}) {
  const frames: ServerFrame[] = [];
  const session = new Session((frame) => frames.push(frame), () => engine, {
    synthTimeoutMs: options.synthTimeoutMs ?? 10_000,
    synthSlots: new SynthSlots(options.slots ?? 2),
  });
  return { session, frames };
}

const results = (frames: readonly ServerFrame[]) => frames.filter((frame) => frame.verb === 'SYNTH-RESULT');

async function waitForResult(frames: readonly ServerFrame[], count = 1): Promise<void> {
  for (let i = 0; i < 400 && results(frames).length < count; i++) await new Promise((resolve) => setTimeout(resolve, 10));
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the synthesis check of a run', () => {
  test('answers after READY, with the tool\'s exit code and text', async () => {
    const { engine } = engineOf({ tool: nodeTool("console.error('top.vhd:4:5:error: latch infered');process.exit(1)") });
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    await waitForResult(frames);
    session.destroy();
    const verbs = frames.map((frame) => frame.verb);
    assert.ok(verbs.indexOf('READY') < verbs.indexOf('SYNTH-RESULT'));
    assert.deepEqual(results(frames), [{ verb: 'SYNTH-RESULT', id: 7, outcome: { kind: 'exit', code: 1 }, text: 'top.vhd:4:5:error: latch infered' }]);
  });

  test('checks the top and the files the page named', async () => {
    const { engine, asked } = engineOf();
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    await waitForResult(frames);
    session.destroy();
    assert.deepEqual(asked, [{ top: 'top', files: ['top.vhd'] }]);
  });

  test('holds for one RUN only: the next runs unchecked', async () => {
    const { engine } = engineOf();
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    await waitForResult(frames);
    await session.handleRun(FILES, 'top_tb.vhd');
    await pause(300);
    session.destroy();
    assert.equal(results(frames).length, 1);
  });

  test('is not run without a SYNTH-CHECK', async () => {
    const { engine, asked } = engineOf();
    const { session, frames } = sessionWith(engine);
    await session.handleRun(FILES, 'top_tb.vhd');
    await pause(200);
    session.destroy();
    assert.deepEqual(asked, []);
    assert.deepEqual(results(frames), []);
  });

  test('is skipped when the run does not compile', async () => {
    const { engine, asked } = engineOf({ compiles: false });
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    session.destroy();
    assert.deepEqual(asked, []);
    assert.deepEqual(results(frames), [{ verb: 'SYNTH-RESULT', id: 7, outcome: { kind: 'skipped' }, text: '' }]);
  });

  test('is refused for a file the RUN did not send', async () => {
    const { engine } = engineOf();
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck({ ...CHECK, files: ['other.vhd'] });
    await session.handleRun(FILES, 'top_tb.vhd');
    session.destroy();
    assert.deepEqual(results(frames).map((frame) => frame.outcome), [{ kind: 'refused' }]);
  });

  test('is unavailable for an engine without a check', async () => {
    const { engine } = engineOf();
    const { synthCommand: _none, ...unchecked } = engine;
    const { session, frames } = sessionWith(unchecked);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    session.destroy();
    assert.deepEqual(results(frames).map((frame) => frame.outcome), [{ kind: 'unavailable' }]);
  });

  test('is busy when the server has no slot free, and the run still runs', async () => {
    const { engine } = engineOf();
    const { session, frames } = sessionWith(engine, { slots: 0 });
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    await waitForResult(frames);
    session.destroy();
    assert.ok(frames.some((frame) => frame.verb === 'READY'));
    assert.deepEqual(results(frames).map((frame) => frame.outcome), [{ kind: 'busy' }]);
  });

  test('times out without stopping the run', async () => {
    const { engine } = engineOf({ tool: nodeTool('setTimeout(() => {}, 20000)') });
    const { session, frames } = sessionWith(engine, { synthTimeoutMs: 200 });
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    await waitForResult(frames);
    session.destroy();
    assert.deepEqual(results(frames).map((frame) => frame.outcome), [{ kind: 'timeout' }]);
    assert.equal(frames.some((frame) => frame.verb === 'DONE'), false);
  });

  test('outlives Stop: a run may end before its check does', async () => {
    const { engine } = engineOf({ tool: nodeTool('setTimeout(() => process.exit(0), 300)') });
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    session.handleStop();
    await waitForResult(frames);
    session.destroy();
    assert.deepEqual(results(frames).map((frame) => frame.outcome), [{ kind: 'exit', code: 0 }]);
  });

  test('is cancelled by a newer RUN, which answers its own check only', async () => {
    const { engine } = engineOf({ tool: nodeTool('setTimeout(() => process.exit(0), 1500)') });
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    session.handleSynthCheck({ ...CHECK, id: 8 });
    await session.handleRun(FILES, 'top_tb.vhd');
    await waitForResult(frames);
    await pause(200);
    session.destroy();
    assert.deepEqual(results(frames).map((frame) => frame.id), [8]);
  });

  test('a RUN refused before the session is answered skipped, and leaves no check for the next', async () => {
    const { engine, asked } = engineOf();
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    session.refuseSynthCheck();
    await session.handleRun(FILES, 'top_tb.vhd');
    await pause(200);
    session.destroy();
    assert.deepEqual(asked, []);
    assert.deepEqual(results(frames).map((frame) => frame.outcome), [{ kind: 'skipped' }]);
  });

  test('says nothing after the session has ended', async () => {
    const { engine } = engineOf({ tool: nodeTool('setTimeout(() => process.exit(0), 300)') });
    const { session, frames } = sessionWith(engine);
    session.handleSynthCheck(CHECK);
    await session.handleRun(FILES, 'top_tb.vhd');
    session.destroy();
    await pause(600);
    assert.deepEqual(results(frames), []);
  });
});
