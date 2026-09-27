// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog path end to end, through the real backend and the real Icarus
 * (docs/Verilog_implementation_plan.md § 7.5, cases I-V*). Expected board behaviour
 * of the shared fixtures comes from `scenarios.json`, the same file the GHDL
 * characterization tests read.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { playBoardScenario } from '../testSupport/playScenario.js';
import { loadScenarios } from '../testSupport/scenarios.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const icarus = icarusForTests();

const FINISHING_DESIGN = `module finisher(input [9:0] SW, output [9:0] LEDR);
  assign LEDR = SW;
  initial begin #1000; $finish; end
endmodule
`;
const STOPPING_DESIGN = FINISHING_DESIGN.replace('$finish', '$stop').replace('finisher', 'stopper');
const UNDRIVEN_DESIGN = `module floaty(input [9:0] SW, output [9:0] LEDR);
  assign LEDR = 10'bzzzzzzzzzz;
endmodule
`;
const STANDALONE_WITH_PORT = `module tb_done(output reg done);
  initial begin done = 0; $display("standalone says hi"); #10 done = 1; $finish; end
endmodule
`;
const MISSPELLED_BOARD_DESIGN = `module leds(input [9:0] switches, output [9:0] LEDS);
  assign LEDS = switches;
endmodule
`;
const WARNING_DESIGN = `module child(input [3:0] a, output [3:0] y);
  assign y = ~a;
endmodule
module narrow(input [9:0] SW, output [9:0] LEDR);
  wire [3:0] low;
  child c(.a(SW), .y(low));
  assign LEDR = {6'b0, low};
endmodule
`;

const verilogFile = (name: string) => ({ name, content: readFixture('verilog', name) });
const loggedText = (client: WsTestClient): string =>
  client.frames.flatMap((frame) => (frame.verb === 'LOG' ? [frame.text] : [])).join('\n');

describe('Verilog path — end to end', { skip: icarus.skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend(backendOptionsFor(icarus.tools));
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);

  describe('I-V1: a clean board run of each shared fixture', () => {
    const boardFixtures = loadScenarios().fixtures.filter((f) => f.mode === 'board' && f.files.verilog);
    for (const fixture of boardFixtures) {
      test(`plays the "${fixture.id}" scenario`, () =>
        withSession(async (client) => {
          const name = fixture.files.verilog as string;
          await startRun(client, [verilogFile(name)], name);
          assert.match(loggedText(client).split('\n')[0] ?? '', /^Icarus Verilog version /);
          await playBoardScenario(client, fixture.steps ?? []);
        }));
    }
  });

  test('I-V4: a warning on a successful compile arrives as a LOG before READY', () =>
    withSession(async (client) => {
      client.run([{ name: 'narrow.v', content: WARNING_DESIGN }], 'narrow.v');
      await client.until((frame) => frame.verb === 'READY');
      assert.match(loggedText(client), /warning/i);
    }));

  test('I-V8: $finish in board mode ends the run as completed', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'finisher.v', content: FINISHING_DESIGN }], 'finisher.v');
      assert.deepEqual(await client.until((frame) => frame.verb === 'DONE'), { verb: 'DONE', reason: 'completed' });
    }));

  test('I-V9: $stop in board mode ends the run as completed', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'stopper.v', content: STOPPING_DESIGN }], 'stopper.v');
      assert.deepEqual(await client.until((frame) => frame.verb === 'DONE'), { verb: 'DONE', reason: 'completed' });
    }));

  test('an undriven LED shows as X, which the protocol allows', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'floaty.v', content: UNDRIVEN_DESIGN }], 'floaty.v');
      const frame = await client.until((f) => f.verb === 'STATE');
      assert.ok(frame.verb === 'STATE');
      assert.match(frame.bits, /^X{10}/);
    }));

  test('I-V11: a portless testbench runs to its end, showing its output', () =>
    withSession(async (client) => {
      const files = [verilogFile('tb_counter8.v'), verilogFile('keyCouter2Led.v')];
      await startRun(client, files, 'tb_counter8.v');
      assert.deepEqual(await client.until((frame) => frame.verb === 'DONE'), { verb: 'DONE', reason: 'completed' });
      for (const expected of loadScenarios().fixtures.find((f) => f.id === 'tb_counter8')?.expectOutput ?? []) {
        assert.ok(loggedText(client).includes(expected), `missing output line "${expected}"`);
      }
    }));

  test('I-V24: blinkTest still blinks when TOGGLE_COUNT does not fit in 7 bits', () =>
    withSession(async (client) => {
      const content = readFixture('verilog', 'blinkTest.v').replace('TOGGLE_COUNT = 125', 'TOGGLE_COUNT = 205');
      await startRun(client, [{ name: 'blinkTest.v', content }], 'blinkTest.v');
      await playBoardScenario(client, [
        { name: 'LEDs turn on after about 410 ms', expect: { ledr: '1111111111' }, withinMs: [300, 700] },
        { name: 'and off again about 410 ms later', expect: { ledr: '0000000000' }, withinMs: [300, 700] },
      ]);
    }));

  test('I-V22: a testbench with ports but no board port runs standalone, hint first', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'tb_done.v', content: STANDALONE_WITH_PORT }], 'tb_done.v');
      assert.deepEqual(await client.until((frame) => frame.verb === 'DONE'), { verb: 'DONE', reason: 'completed' });
      const lines = loggedText(client).split('\n');
      assert.match(lines.find((line) => line.includes('standalone testbench')) ?? '', /tb_done/);
      assert.ok(lines.findIndex((l) => l.includes('standalone testbench')) < lines.findIndex((l) => l === 'standalone says hi'));
    }));

  test('I-V23: a board design with a misspelled port runs standalone and names the board ports', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'leds.v', content: MISSPELLED_BOARD_DESIGN }], 'leds.v');
      assert.match(loggedText(client), /declares none of the board's ports \(CLOCK_50/);
    }));
});
