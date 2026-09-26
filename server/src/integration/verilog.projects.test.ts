// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog path's handling of projects (docs/Verilog_implementation_plan.md § 7.5):
 * errors and how they are reported, several files, include files of every shape, a
 * large project, and a run that mixes the two languages.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { VhdlFileInput } from '../protocol.js';
import { matchesExpectation } from '../testSupport/boardState.js';
import { readFixture } from '../testSupport/fixture.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const icarus = icarusForTests();

const PROMPT_ERROR_MS = 1_000;
const CHAIN_DEPTH = 6;
const LARGE_PROJECT_MODULES = 100;
const LARGE_PROJECT_READY_MS = 3_000;

const SYNTAX_ERROR = 'module bad(input a;\nendmodule\n';
const UNKNOWN_MODULE = 'module top(input [9:0] SW, output [9:0] LEDR);\n  missing_module m(.a(SW), .y(LEDR));\nendmodule\n';
const INVERTING_TOP = `module top(input [9:0] SW, output [9:0] LEDR);
  inverter u(.a(SW), .y(LEDR));
endmodule
`;
const INVERTER = 'module inverter(input [9:0] a, output [9:0] y);\n  assign y = ~a;\nendmodule\n';
const SW_AND_LEDR_ONLY = 'module partial(input [9:0] SW, output [9:0] LEDR);\n  assign LEDR = SW;\nendmodule\n';
const MISSING_INCLUDE = '`include "nowhere.vh"\nmodule top(output [9:0] LEDR);\n  assign LEDR = 10\'d0;\nendmodule\n';

/** `inc1.vh` includes `inc2.vh` … the last defines the macro the top uses. */
function nestedIncludes(depth: number): VhdlFileInput[] {
  const headers = Array.from({ length: depth }, (_, index) => {
    const number = index + 1;
    const content = number === depth ? '`define DEEP_VALUE 10\'h2aa\n' : `\`include "inc${number + 1}.vh"\n`;
    return { name: `inc${number}.vh`, content };
  });
  const top = 'module top(input [9:0] SW, output [9:0] LEDR);\n  assign LEDR = `DEEP_VALUE;\nendmodule\n';
  return [{ name: 'top.v', content: `\`include "inc1.vh"\n${top}` }, ...headers];
}

const CIRCULAR_INCLUDES: VhdlFileInput[] = [
  { name: 'top.v', content: '`include "a.vh"\nmodule top(output [9:0] LEDR);\n  assign LEDR = 10\'d0;\nendmodule\n' },
  { name: 'a.vh', content: '`include "b.vh"\n' },
  { name: 'b.vh', content: '`include "a.vh"\n' },
];

/** `m0` is the top, each `mN` instantiates `m(N+1)`, and the last drives the LEDs. */
function moduleChain(length: number): VhdlFileInput[] {
  return Array.from({ length: length + 1 }, (_, index) => {
    const isTop = index === 0;
    const isLast = index === length;
    const ports = isTop ? 'input [9:0] SW, output [9:0] LEDR' : 'input [9:0] a, output [9:0] y';
    const [inPort, outPort] = isTop ? ['SW', 'LEDR'] : ['a', 'y'];
    const body = isLast ? `assign ${outPort} = ${inPort};` : `m${index + 1} next(.a(${inPort}), .y(${outPort}));`;
    return { name: `m${index}.v`, content: `module m${index}(${ports});\n  ${body}\nendmodule\n` };
  });
}

describe('Verilog path — projects', { skip: icarus.skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend(backendOptionsFor(icarus.tools));
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);

  async function errorOf(client: WsTestClient, files: VhdlFileInput[], top: string, timeoutMs?: number) {
    client.run(files, top);
    const frame = await client.until((f) => f.verb === 'ERROR', timeoutMs);
    assert.ok(frame.verb === 'ERROR');
    return frame;
  }

  test('I-V2: a syntax error is reported as an analyze error naming the file and line', () =>
    withSession(async (client) => {
      const frame = await errorOf(client, [{ name: 'bad.v', content: SYNTAX_ERROR }], 'bad.v');
      assert.equal(frame.stage, 'analyze');
      assert.match(frame.text, /bad\.v:\d+: /);
    }));

  test('I-V3: an unknown module is reported as an error naming it', () =>
    withSession(async (client) => {
      const frame = await errorOf(client, [{ name: 'top.v', content: UNKNOWN_MODULE }], 'top.v');
      assert.match(frame.text, /missing_module/);
    }));

  describe('I-V5: a module used before the file that defines it, in either order', () => {
    const top = { name: 'top.v', content: INVERTING_TOP };
    const inverter = { name: 'inverter.v', content: INVERTER };
    for (const [label, files] of [['top first', [top, inverter]], ['inverter first', [inverter, top]]] as const) {
      test(label, () => withSession((client) => startRun(client, [...files], 'top.v')));
    }
  });

  test('I-V6: a design with only SW and LEDR runs, and the displays stay blank', () =>
    withSession(async (client) => {
      await startRun(client, [{ name: 'partial.v', content: SW_AND_LEDR_ONLY }], 'partial.v');
      client.stim('1100110011' + '1111');
      await client.untilState((state) => matchesExpectation(state, { ledr: '1100110011', hex: 'blank' }));
    }));

  test('I-V17: a macro from the deepest of six nested includes takes effect', () =>
    withSession(async (client) => {
      await startRun(client, nestedIncludes(CHAIN_DEPTH), 'top.v');
      await client.untilState((state) => state.ledr === '1010101010');
    }));

  test('I-V18: a missing include is reported by name, promptly', () =>
    withSession(async (client) => {
      const frame = await errorOf(client, [{ name: 'top.v', content: MISSING_INCLUDE }], 'top.v', PROMPT_ERROR_MS);
      assert.equal(frame.stage, 'analyze');
      assert.match(frame.text, /nowhere\.vh/);
    }));

  test('I-V19: circular includes are reported promptly and do not hang', () =>
    withSession(async (client) => {
      const frame = await errorOf(client, CIRCULAR_INCLUDES, 'top.v', PROMPT_ERROR_MS);
      assert.equal(frame.stage, 'analyze');
    }));

  test('I-V20: a project of 101 files is ready within a few seconds', () =>
    withSession(async (client) => {
      const startedAt = Date.now();
      await startRun(client, moduleChain(LARGE_PROJECT_MODULES), 'm0.v');
      assert.ok(Date.now() - startedAt < LARGE_PROJECT_READY_MS, `took ${Date.now() - startedAt} ms`);
      client.stim('0000011111' + '1111');
      await client.untilState((state) => state.ledr === '0000011111');
    }));

  test('I-X2: one run mixing .v and .vhdl files is refused with a message naming the mismatch', () =>
    withSession(async (client) => {
      const files = [
        { name: 'DE1_SoC.v', content: readFixture('verilog', 'DE1_SoC.v') },
        { name: 'DE1_SoC.vhdl', content: readFixture('vhdl', 'DE1_SoC.vhdl') },
      ];
      const frame = await errorOf(client, files, 'DE1_SoC.v');
      assert.equal(frame.stage, 'analyze');
      assert.match(frame.text, /DE1_SoC\.vhdl/);
    }));
});
