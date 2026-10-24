// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The simulation works when the board's names change (docs/board_io_config_spec.md
 * § 14.2): each shared board fixture, written in the DE1-SoC's names and run on the
 * DE1-SoC board, gives exactly the board behaviour its scenario expects — in VHDL on
 * GHDL and in Verilog on Icarus. The Default names keep running with no BOARD frame
 * (every other integration test), and a design in the wrong names is told so.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { DE1_SOC_BOARD_IO } from '../testSupport/boards.js';
import { readFixture, type FixtureLanguage } from '../testSupport/fixture.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { playBoardScenario } from '../testSupport/playScenario.js';
import { requireTool } from '../testSupport/requireTool.js';
import { loadScenarios, type Fixture } from '../testSupport/scenarios.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const ghdl = requireTool('ghdl');
const icarus = icarusForTests();
const skip = ghdl.skip || icarus.skip;

/**
 * A fixture in the DE1-SoC's names. The fixtures are known text, so a word rename is
 * enough here; the frontend's token-aware rename is tested on its own.
 */
function inDe1SocNames(source: string): string {
  return source.replace(/\bKEY_N\b/g, 'KEY').replace(/\bHEX(\d)_N\b/g, 'HEX$1');
}

const LANGUAGES: readonly FixtureLanguage[] = ['vhdl', 'verilog'];
const boardFixtures = (): Fixture[] => loadScenarios().fixtures.filter((f) => f.mode === 'board' && f.files.vhdl && f.files.verilog);

function fileOf(language: FixtureLanguage, name: string, rename = inDe1SocNames) {
  return { name, content: rename(readFixture(language, name)) };
}

describe('Boards with other port names', { skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined, ...backendOptionsFor(icarus.tools) });
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);

  for (const language of LANGUAGES) {
    for (const fixture of boardFixtures()) {
      test(`${fixture.id} (${language}) in the DE1-SoC's names runs its scenario on the DE1-SoC board`, () =>
        withSession(async (client) => {
          const file = fileOf(language, fixture.files[language] as string);
          assert.doesNotMatch(file.content, /\bKEY_N\b|\bHEX\d_N\b/);
          client.board(DE1_SOC_BOARD_IO);
          await startRun(client, [file], file.name);
          await playBoardScenario(client, fixture.steps ?? []);
        }));
    }
  }

  test('a VHDL design in the Default names on the DE1-SoC is told which name it meant', () =>
    withSession(async (client) => {
      const file = fileOf('vhdl', 'keyCouter2Led.vhdl', (text) => text);
      client.board(DE1_SOC_BOARD_IO);
      await startRun(client, [file], file.name);
      const warning = client.frames.find((frame) => frame.verb === 'LOG' && frame.text.includes('`KEY_N`'));
      assert.ok(warning && warning.verb === 'LOG', 'expected a warning about KEY_N');
      assert.match(warning.text, /did you mean `KEY`\?/);
    }));

  test('a Verilog design with none of the DE1-SoC names runs as a testbench, and says why', () =>
    withSession(async (client) => {
      const source = 'module keys(input wire [3:0] KEY_N, output wire [6:0] HEX0_N);\n  assign HEX0_N = {3\'b111, KEY_N};\nendmodule\n';
      const file = { name: 'keys.v', content: source };
      client.board(DE1_SOC_BOARD_IO);
      client.run([file], file.name);
      const hint = await client.until((frame) => frame.verb === 'LOG' && frame.text.includes('standalone testbench'));
      assert.ok(hint.verb === 'LOG');
      assert.match(hint.text, /CLOCK_50, CLOCK_500Hz, SW, KEY, LEDR, HEX0…HEX5/);
    }));

  test('a testbench with no board ports runs as a batch run on the DE1-SoC, as before', () =>
    withSession(async (client) => {
      const files = [fileOf('vhdl', 'and_gate_tb.vhd'), fileOf('vhdl', 'and_gate.vhdl')];
      client.board(DE1_SOC_BOARD_IO);
      client.run(files, 'and_gate_tb.vhd');
      const done = await client.until((frame) => frame.verb === 'DONE' || frame.verb === 'ERROR', 30_000);
      assert.deepEqual(done, { verb: 'DONE', reason: 'completed' });
    }));
});
