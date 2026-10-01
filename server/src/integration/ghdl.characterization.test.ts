// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Characterization tests for the GHDL path: they pin what the backend does *today*,
 * so the engine refactor (docs/Verilog_implementation_plan.md, phase E) can prove it
 * changed nothing. They are written against the unchanged backend and must pass on
 * it — they describe existing behaviour, they do not argue for new behaviour.
 *
 * Cases I-G1 to I-G4 of § 7.5: a clean board run of every shared fixture, an
 * analysis error, an elaboration error, and a multi-file project in either order.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { requireTool } from '../testSupport/requireTool.js';
import {
  INVERTER_VHDL,
  INVERTING_TOP_VHDL,
  NO_BOARD_PORTS_VHDL,
  SYNTAX_ERROR_VHDL,
  UNKNOWN_INPUT_PORT_VHDL,
} from '../testSupport/vhdlSources.js';
import { readFixture } from '../testSupport/fixture.js';
import { playBoardScenario } from '../testSupport/playScenario.js';
import { loadScenarios, type ScenarioStep } from '../testSupport/scenarios.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';
import type { VhdlFileInput } from '../protocol.js';

const ghdl = requireTool('ghdl');

const INVERTING_STEPS: readonly ScenarioStep[] = [
  { name: 'all switches off lights every LED', sw: '0000000000', key: '1111', expect: { ledr: '1111111111' } },
  { name: 'the LEDs are the inverse of the switches', sw: '1010101010', key: '1111', expect: { ledr: '0101010101' } },
];

describe('GHDL path — current behaviour (characterization)', { skip: ghdl.skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined });
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);

  describe('I-G1: a clean board run of each shared fixture', () => {
    const boardFixtures = loadScenarios().fixtures.filter((f) => f.mode === 'board' && f.files.vhdl);
    for (const fixture of boardFixtures) {
      test(`plays the "${fixture.id}" scenario`, () =>
        withSession(async (client) => {
          const name = fixture.files.vhdl as string;
          await startRun(client, [{ name, content: readFixture('vhdl', name) }], name);
          await playBoardScenario(client, fixture.steps ?? []);
        }));
    }
  });

  test('I-G2: a syntax error is reported as an analyze error naming the file', () =>
    withSession(async (client) => {
      client.run([{ name: 'bad.vhdl', content: SYNTAX_ERROR_VHDL }], 'bad.vhdl');
      const frame = await client.until((f) => f.verb === 'ERROR');
      assert.ok(frame.verb === 'ERROR');
      assert.equal(frame.stage, 'analyze');
      assert.match(frame.text, /bad\.vhdl:\d+/);
    }));

  test('I-G3a: no design with a board port is reported as an elaborate error naming the entities', () =>
    withSession(async (client) => {
      client.run([{ name: 'aloof.vhdl', content: NO_BOARD_PORTS_VHDL }]);
      const frame = await client.until((f) => f.verb === 'ERROR');
      assert.ok(frame.verb === 'ERROR');
      assert.equal(frame.stage, 'elaborate');
      assert.match(frame.text, /None of the declared entities \(aloof\)/);
    }));

  test('I-G3b: an extra input port the board lacks is held at 0, with a warning on its declaration', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'lonely.vhdl', content: UNKNOWN_INPUT_PORT_VHDL }], 'lonely.vhdl');
      const warning = client.frames.find((f) => f.verb === 'LOG' && f.text.includes(':warning:'));
      assert.ok(warning?.verb === 'LOG');
      assert.equal(warning.text.split('\n')[0], 'lonely.vhdl:7:5:warning: `BTN` is not a board input, so it is held at 0.');
      // BTN held at 0 selects the else branch: every LED off, whatever the switches say.
      await playBoardScenario(client, [{ name: 'BTN is 0', sw: '1111111111', key: '1111', expect: { ledr: '0000000000' } }]);
    }));

  describe('I-G4: a project that spans two files works in either order', () => {
    const top = { name: 'top.vhdl', content: INVERTING_TOP_VHDL };
    const inverter = { name: 'inverter.vhdl', content: INVERTER_VHDL };
    const orders: Array<[string, VhdlFileInput[]]> = [
      ['top file first', [top, inverter]],
      ['top file last', [inverter, top]],
    ];
    for (const [label, files] of orders) {
      test(`runs with the ${label}`, () =>
        withSession(async (client) => {
          await startRun(client, files, 'top.vhdl');
          await playBoardScenario(client, INVERTING_STEPS);
        }));
    }
  });
});
