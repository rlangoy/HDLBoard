// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog path's run control and robustness (docs/Verilog_implementation_plan.md
 * § 7.5): output arriving while a design runs, `$fatal`, a runaway testbench, RESET and
 * STOP, teardown, hostile file names and a session directory with a non-ASCII letter.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { playBoardScenario } from '../testSupport/playScenario.js';
import { loadScenarios } from '../testSupport/scenarios.js';
import { countProcesses, waitForProcessCount } from '../testSupport/processCount.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const icarus = icarusForTests();

const BOARD_DESIGN = 'DE1_SoC.v';
const LEDS_FOLLOW_SWITCHES = { sw: '1010101010', key: '1111', ledr: '1010101010' };
const TEARDOWN_TIMEOUT_MS = 5_000;
const OUTPUT_WITHIN_MS = 200;
const PROMPT_STOP_MS = 2_000;
/** The session's own `vvp` may still be exiting when the test's directory is removed. */
const REMOVE_RETRIES = 20;
const REMOVE_RETRY_DELAY_MS = 100;
const NON_ASCII_DIRECTORY_PREFIX = 'hdlboard tmp ø ';

const CHATTY_DESIGN = `module chatty(input [9:0] SW, output [9:0] LEDR);
  assign LEDR = SW;
  initial $display("hello from the design");
endmodule
`;
const FATAL_DESIGN = `module fatal_top(input [9:0] SW, output [9:0] LEDR);
  assign LEDR = SW;
  initial begin #500; $fatal(1, "boom"); end
endmodule
`;
const RUNAWAY_TESTBENCH = `module tb_runaway;
  integer i;
  initial begin i = 0; forever i = i + 1; end
endmodule
`;
const HOSTILE_NAMES = ['hdl_board_tb.v', '../escape.v', 'sub/dir.v', '-Wall.v'];

const boardFile = () => [{ name: BOARD_DESIGN, content: readFixture('verilog', BOARD_DESIGN) }];
const loggedText = (client: WsTestClient): string =>
  client.frames.flatMap((frame) => (frame.verb === 'LOG' ? [frame.text] : [])).join('\n');

describe('Verilog path — controls and robustness', { skip: icarus.skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend(backendOptionsFor(icarus.tools));
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);

  async function driveSwitches(client: WsTestClient): Promise<void> {
    client.stim(LEDS_FOLLOW_SWITCHES.sw + LEDS_FOLLOW_SWITCHES.key);
    await client.untilState((state) => state.ledr === LEDS_FOLLOW_SWITCHES.ledr);
  }

  test('I-V7: a $display in a running design reaches the console within 200 ms', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'chatty.v', content: CHATTY_DESIGN }], 'chatty.v');
      await client.until((frame) => frame.verb === 'LOG' && frame.text === 'hello from the design', OUTPUT_WITHIN_MS);
    }));

  test('I-V10: $fatal ends the run with a runtime error carrying its message', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'fatal_top.v', content: FATAL_DESIGN }], 'fatal_top.v');
      const frame = await client.until((f) => f.verb === 'ERROR' || f.verb === 'DONE');
      assert.ok(frame.verb === 'ERROR', `expected an ERROR, got ${JSON.stringify(frame)}`);
      assert.equal(frame.stage, 'runtime');
      assert.match(`${frame.text}\n${loggedText(client)}`, /boom/);
    }));

  test('I-V12: a runaway testbench can be stopped promptly', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'tb_runaway.v', content: RUNAWAY_TESTBENCH }], 'tb_runaway.v');
      client.stop();
      const done = await client.until((frame) => frame.verb === 'DONE', PROMPT_STOP_MS);
      assert.deepEqual(done, { verb: 'DONE', reason: 'stopped' });
    }));

  test('I-V13: RESET starts a fresh run that keeps the switch positions', () =>
    withSession(async (client) => {
      await startRun(client, boardFile(), BOARD_DESIGN);
      await driveSwitches(client);
      client.reset();
      await client.until((frame) => frame.verb === 'READY');
      await client.until((frame) => frame.verb === 'STATE');
      await client.untilState((state) => state.ledr === LEDS_FOLLOW_SWITCHES.ledr);
    }));

  test('I-V13: STOP ends the run and reports why', () =>
    withSession(async (client) => {
      await startRun(client, boardFile(), BOARD_DESIGN);
      client.stop();
      assert.deepEqual(await client.until((frame) => frame.verb === 'DONE'), { verb: 'DONE', reason: 'stopped' });
    }));

  test('I-V14: dropping the connection mid-run leaves no vvp or iverilog process behind', async () => {
    const vvpBefore = countProcesses('vvp');
    const iverilogBefore = countProcesses('iverilog');
    await withSession(async (client) => {
      await startRun(client, boardFile(), BOARD_DESIGN);
      assert.ok(countProcesses('vvp') > vvpBefore, 'expected a vvp process while the session runs');
    });
    await waitForProcessCount('vvp', vvpBefore, TEARDOWN_TIMEOUT_MS);
    await waitForProcessCount('iverilog', iverilogBefore, TEARDOWN_TIMEOUT_MS);
  });

  describe('I-V15: file names that would collide with or escape the session directory', () => {
    for (const name of HOSTILE_NAMES) {
      test(`rejects ${name} with an analyze error and writes nothing outside`, () =>
        withSession(async (client) => {
          client.run([{ name, content: 'module x; endmodule\n' }], name);
          const frame = await client.until((f) => f.verb === 'ERROR');
          assert.ok(frame.verb === 'ERROR');
          assert.ok(['analyze', 'protocol'].includes(frame.stage), `stage was ${frame.stage}`);
          assert.ok(!existsSync(join(tmpdir(), 'escape.v')));
        }));
    }
  });

  test('I-V16: a session directory with a non-ASCII letter still delivers STATE', async (t) => {
    const original = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
    const awkward = mkdtempSync(join(tmpdir(), NON_ASCII_DIRECTORY_PREFIX));
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = awkward;
    const vvpBefore = countProcesses('vvp');
    t.after(async () => {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      // Only once the session's own vvp has gone can its directory be removed on Windows.
      await waitForProcessCount('vvp', vvpBefore, TEARDOWN_TIMEOUT_MS);
      rmSync(awkward, { recursive: true, force: true, maxRetries: REMOVE_RETRIES, retryDelay: REMOVE_RETRY_DELAY_MS });
    });
    const fixture = loadScenarios().fixtures.find((f) => f.id === 'de1_soc');
    await withSession(async (client) => {
      await startRun(client, boardFile(), BOARD_DESIGN);
      await playBoardScenario(client, fixture?.steps ?? []);
    });
  });
});
