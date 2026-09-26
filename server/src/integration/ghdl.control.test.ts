// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Characterization tests, part two: batch runs, the RESET and STOP controls, and
 * teardown (docs/Verilog_implementation_plan.md § 7.5, cases I-G5 to I-G7). Like the
 * protocol cases they pin what the GHDL path does today, before it is refactored.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
import { countProcesses, waitForProcessCount } from '../testSupport/processCount.js';
import { requireTool } from '../testSupport/requireTool.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const ghdl = requireTool('ghdl');

const BOARD_DESIGN = 'DE1_SoC.vhdl';
const LEDS_FOLLOW_SWITCHES = { sw: '1010101010', key: '1111', ledr: '1010101010' };
const TEARDOWN_TIMEOUT_MS = 5_000;

/** No ports at all: the backend runs it directly, as a self-contained testbench. */
const PORTLESS_TESTBENCH_VHDL = `entity tb_hello is
end entity;

architecture sim of tb_hello is
begin
  process
  begin
    report "hello one";
    wait for 10 ns;
    report "hello two";
    wait;
  end process;
end architecture;
`;

describe('GHDL path — controls and teardown (characterization)', { skip: ghdl.skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined });
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);
  const boardFile = () => [{ name: BOARD_DESIGN, content: readFixture('vhdl', BOARD_DESIGN) }];

  async function driveSwitches(client: WsTestClient): Promise<void> {
    client.stim(LEDS_FOLLOW_SWITCHES.sw + LEDS_FOLLOW_SWITCHES.key);
    await client.untilState((state) => state.ledr === LEDS_FOLLOW_SWITCHES.ledr);
  }

  test('I-G5: a portless testbench runs to its end, showing its report lines', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'tb_hello.vhdl', content: PORTLESS_TESTBENCH_VHDL }], 'tb_hello.vhdl');
      const done = await client.until((frame) => frame.verb === 'DONE');
      assert.deepEqual(done, { verb: 'DONE', reason: 'completed' });
      const logged = client.frames.flatMap((frame) => (frame.verb === 'LOG' ? [frame.text] : [])).join('\n');
      assert.match(logged, /hello one/);
      assert.match(logged, /hello two/);
    }));

  test('I-G6: RESET starts a fresh run that keeps the switch positions', () =>
    withSession(async (client) => {
      await startRun(client, boardFile(), BOARD_DESIGN);
      await driveSwitches(client);
      client.reset();
      await client.until((frame) => frame.verb === 'READY');
      await client.until((frame) => frame.verb === 'STATE'); // a new run publishes its state afresh
      await client.untilState((state) => state.ledr === LEDS_FOLLOW_SWITCHES.ledr);
    }));

  test('I-G6: STOP ends the run and reports why', () =>
    withSession(async (client) => {
      await startRun(client, boardFile(), BOARD_DESIGN);
      client.stop();
      const done = await client.until((frame) => frame.verb === 'DONE');
      assert.deepEqual(done, { verb: 'DONE', reason: 'stopped' });
    }));

  test('I-G7: dropping the connection mid-run leaves no ghdl process behind', async () => {
    const before = countProcesses('ghdl');
    await withSession(async (client) => {
      await startRun(client, boardFile(), BOARD_DESIGN);
      assert.ok(countProcesses('ghdl') > before, 'expected a ghdl process while the session runs');
    });
    await waitForProcessCount('ghdl', before, TEARDOWN_TIMEOUT_MS);
  });
});
