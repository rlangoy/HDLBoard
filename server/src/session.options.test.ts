// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** How the session hands the `OPTIONS` frame's compiler options to the engine. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeCompilerOptions, DEFAULT_COMPILER_OPTIONS, type CompilerOptions } from './compilerOptions.js';
import type { PrepareRequest, SimEngine } from './engines/types.js';
import type { ServerFrame } from './protocol.js';
import { RUN_REFUSED_FOR_OPTIONS, Session } from './session.js';

const FILES = [{ name: 'top.vhdl', content: '' }];
const SYNOPSYS_ON: CompilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ghdl: { synopsys: true, relaxed: false } };

/** An engine whose every compile fails at once, after noting the options it was asked to compile with. */
function recordingEngine() {
  const seen: Array<CompilerOptions | undefined> = [];
  const engine: SimEngine = {
    language: 'vhdl',
    prepare: (request: PrepareRequest) => {
      seen.push(request.compilerOptions);
      return Promise.resolve({ ok: false, stage: 'analyze', text: 'not compiled in this test' });
    },
    startBoardRun: () => assert.fail('nothing runs in these tests'),
    startBatchRun: () => assert.fail('nothing runs in these tests'),
  };
  return { engine, seen };
}

async function runOnce(arrange: (session: Session) => void) {
  const { engine, seen } = recordingEngine();
  const frames: ServerFrame[] = [];
  const session = new Session((frame) => frames.push(frame), () => engine);
  arrange(session);
  await session.handleRun(FILES, 'top.vhdl');
  session.destroy();
  return { seen, frames };
}

describe('the session compiler options', () => {
  test('are the defaults when no OPTIONS frame was sent', async () => {
    const { seen } = await runOnce(() => {});
    assert.deepEqual(seen, [DEFAULT_COMPILER_OPTIONS]);
  });

  test('are what the last OPTIONS frame said', async () => {
    const { seen } = await runOnce((session) => session.handleOptions({ ok: true, options: SYNOPSYS_ON }));
    assert.deepEqual(seen, [SYNOPSYS_ON]);
  });

  test('refuse the run after an invalid OPTIONS frame, compiling nothing', async () => {
    const { seen } = await runOnce((session) => session.handleOptions(decodeCompilerOptions('{"ghdl":{"x":1}}')));
    assert.deepEqual(seen, []);
  });

  test('say why the run was refused', async () => {
    const { frames } = await runOnce((session) => session.handleOptions(decodeCompilerOptions('{"ghdl":{"x":1}}')));
    assert.deepEqual(frames, [
      { verb: 'ERROR', stage: 'protocol', text: `${RUN_REFUSED_FOR_OPTIONS}\nInvalid compiler options: ghdl.x is not a known option` },
    ]);
  });
});
