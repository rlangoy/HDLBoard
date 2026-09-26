// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Both engines behind one backend (docs/Verilog_implementation_plan.md § 7.5-7.6): a
 * connection that switches language between runs uses the right engine each time
 * (I-X1), and the VHDL and Verilog twin of each shared fixture give the same board
 * (I-P1 to I-P3). Needs both GHDL and Icarus.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
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

const boardFixtures = (): Fixture[] => loadScenarios().fixtures.filter((f) => f.mode === 'board' && f.files.vhdl && f.files.verilog);
const fileOf = (language: 'vhdl' | 'verilog', fixture: Fixture) => {
  const name = fixture.files[language] as string;
  return { name, content: readFixture(language, name) };
};

describe('Both engines behind one backend', { skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined, ...backendOptionsFor(icarus.tools) });
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);

  async function playFixture(language: 'vhdl' | 'verilog', fixture: Fixture) {
    const file = fileOf(language, fixture);
    let reached: Awaited<ReturnType<typeof playBoardScenario>> = [];
    await withSession(async (client) => {
      await startRun(client, [file], file.name);
      reached = await playBoardScenario(client, fixture.steps ?? []);
    });
    return reached;
  }

  test('I-X1: VHDL, then Verilog, then VHDL again on one connection each use their own engine', () =>
    withSession(async (client) => {
      const fixture = boardFixtures().find((f) => f.id === 'de1_soc') as Fixture;
      const banners: string[] = [];
      for (const language of ['vhdl', 'verilog', 'vhdl'] as const) {
        const file = fileOf(language, fixture);
        const framesBefore = client.frames.length;
        await startRun(client, [file], file.name);
        const firstLog = client.frames.slice(framesBefore).find((frame) => frame.verb === 'LOG');
        banners.push(firstLog?.verb === 'LOG' ? firstLog.text : '');
        await playBoardScenario(client, fixture.steps ?? []);
      }
      assert.match(banners[0] ?? '', /^GHDL/);
      assert.match(banners[1] ?? '', /^Icarus Verilog/);
      assert.match(banners[2] ?? '', /^GHDL/);
    }));

  describe('I-P1..P3: the twins of each fixture give the same board, step for step', () => {
    for (const fixture of boardFixtures()) {
      test(`"${fixture.id}"`, async () => {
        const vhdl = await playFixture('vhdl', fixture);
        const verilog = await playFixture('verilog', fixture);
        assert.deepEqual(verilog, vhdl);
      });
    }
  });
});
