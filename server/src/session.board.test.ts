// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The session's board (docs/board_io_config_spec.md § 8.2), over several runs: Default
 * until a `BOARD` frame arrives, then that board, sticky like `WAVE`; after an invalid
 * frame every run is refused, with nothing compiled, until a valid one arrives.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeBoardBody, encodeBoardBody } from './boardFrame.js';
import { DEFAULT_BOARD_IO, type BoardIo } from './engines/boardPorts.js';
import type { PrepareRequest, SimEngine } from './engines/types.js';
import type { ServerFrame } from './protocol.js';
import { RUN_REFUSED_FOR_BOARD, Session } from './session.js';
import { DE1_SOC_BOARD_IO } from './testSupport/boards.js';

const FILES = [{ name: 'top.vhdl', content: '' }];

/** An engine whose every compile fails at once, after noting the board it was asked to prepare for. */
function recordingEngine() {
  const boards: BoardIo[] = [];
  const engine: SimEngine = {
    language: 'vhdl',
    prepare: (request: PrepareRequest) => {
      boards.push(request.board);
      return Promise.resolve({ ok: false, stage: 'analyze', text: 'not compiled in this test' });
    },
    startBoardRun: () => assert.fail('nothing runs in these tests'),
    startBatchRun: () => assert.fail('nothing runs in these tests'),
  };
  return { engine, boards };
}

function sessionWith(engine: SimEngine) {
  const frames: ServerFrame[] = [];
  const session = new Session((frame) => frames.push(frame), () => engine);
  return { session, frames };
}

const valid = (board: BoardIo) => decodeBoardBody(encodeBoardBody(board));
const invalid = () => decodeBoardBody('switches SW');

describe('the session board', () => {
  test('is the Default board when no BOARD frame was sent', async () => {
    const { engine, boards } = recordingEngine();
    const { session } = sessionWith(engine);
    await session.handleRun(FILES, 'top.vhdl');
    session.destroy();
    assert.deepEqual(boards, [DEFAULT_BOARD_IO]);
  });

  test('stays what the last BOARD frame said, for every later run', async () => {
    const { engine, boards } = recordingEngine();
    const { session } = sessionWith(engine);
    session.handleBoard(valid(DE1_SOC_BOARD_IO));
    await session.handleRun(FILES, 'top.vhdl');
    await session.handleRun(FILES, 'top.vhdl');
    session.destroy();
    assert.deepEqual(boards, [DE1_SOC_BOARD_IO, DE1_SOC_BOARD_IO]);
  });

  test('follows the newest of two BOARD frames', async () => {
    const { engine, boards } = recordingEngine();
    const { session } = sessionWith(engine);
    session.handleBoard(valid(DE1_SOC_BOARD_IO));
    session.handleBoard(valid(DEFAULT_BOARD_IO));
    await session.handleRun(FILES, 'top.vhdl');
    session.destroy();
    assert.deepEqual(boards, [DEFAULT_BOARD_IO]);
  });

  test('refuses runs after an invalid BOARD frame, compiling nothing, until a valid one arrives', async () => {
    const { engine, boards } = recordingEngine();
    const { session, frames } = sessionWith(engine);
    session.handleBoard(invalid());
    await session.handleRun(FILES, 'top.vhdl');
    assert.deepEqual(frames, [{ verb: 'ERROR', stage: 'protocol', text: `${RUN_REFUSED_FOR_BOARD}\nBOARD: clock50 is missing` }]);
    assert.deepEqual(boards, []);

    session.handleBoard(valid(DE1_SOC_BOARD_IO));
    await session.handleRun(FILES, 'top.vhdl');
    session.destroy();
    assert.deepEqual(boards, [DE1_SOC_BOARD_IO]);
  });
});

describe('Stop while a run compiles', () => {
  test('ends the run at once, and nothing starts when the compile finishes', async () => {
    let finishCompile: () => void = () => {};
    const engine: SimEngine = {
      language: 'vhdl',
      prepare: () =>
        new Promise((resolve) => {
          finishCompile = () => resolve({ ok: true, plan: { mode: 'board', dir: '', runTarget: '', timing: { pollIntervalNs: 1, minDwellNs: 1 }, pacing: 'stdin', messages: [] } });
        }),
      startBoardRun: () => assert.fail('a stopped run must not start'),
      startBatchRun: () => assert.fail('a stopped run must not start'),
    };
    const { session, frames } = sessionWith(engine);
    const run = session.handleRun(FILES, 'top.vhdl');
    session.handleStop();
    finishCompile();
    await run;
    session.destroy();
    assert.deepEqual(frames, [{ verb: 'DONE', reason: 'stopped' }]);
  });
});

describe('a RUN while another compiles', () => {
  test('waits for that compile before its own starts, and only the newest run is answered', async () => {
    const finishers: Array<() => void> = [];
    let compiles = 0;
    const engine: SimEngine = {
      language: 'vhdl',
      prepare: () => {
        compiles++;
        return new Promise((resolve) => finishers.push(() => resolve({ ok: false, stage: 'analyze', text: `compile ${compiles}` })));
      },
      startBoardRun: () => assert.fail('nothing runs in this test'),
      startBatchRun: () => assert.fail('nothing runs in this test'),
    };
    const { session, frames } = sessionWith(engine);
    const first = session.handleRun(FILES, 'top.vhdl');
    await new Promise((resolve) => setImmediate(resolve));
    const second = session.handleRun(FILES, 'top.vhdl');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(compiles, 1, 'the second compile must wait for the first');
    finishers[0]();
    await first;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(compiles, 2);
    finishers[1]();
    await second;
    session.destroy();
    assert.deepEqual(frames, [{ verb: 'ERROR', stage: 'analyze', text: 'compile 2' }]);
  });
});
