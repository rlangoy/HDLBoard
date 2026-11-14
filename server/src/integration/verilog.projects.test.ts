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

/** Far below the compiler's 30 s timeout, yet loose enough for a loaded machine. */
const PROMPT_ERROR_MS = 5_000;
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

/** A top that includes `first`, and drives the LEDs from `LED_VALUE` when a header defines it. */
function topIncluding(first: string): VhdlFileInput {
  const body = 'module top(output [9:0] LEDR);\n`ifdef LED_VALUE\n  assign LEDR = `LED_VALUE;\n`else\n  assign LEDR = 10\'d0;\n`endif\nendmodule\n';
  return { name: 'top.v', content: `\`include "${first}"\n${body}` };
}

const includes = (name: string, included: string): VhdlFileInput => ({ name, content: `\`include "${included}"\n` });

/** A header whose text is wrapped in an include guard. */
function guarded(name: string, text: string): VhdlFileInput {
  const guard = `${name.replace('.', '_').toUpperCase()}_INCLUDED`;
  return { name, content: `\`ifndef ${guard}\n\`define ${guard}\n${text}\`endif\n` };
}

const LED_PATTERN = '1111000011';
const DEFINES_LED_VALUE = `\`define LED_VALUE 10'b${LED_PATTERN}\n`;

const CIRCULAR_INCLUDES: VhdlFileInput[] = [topIncluding('a.vh'), includes('a.vh', 'b.vh'), includes('b.vh', 'a.vh')];
const LONG_CYCLE: VhdlFileInput[] = [topIncluding('a.vh'), includes('a.vh', 'b.vh'), includes('b.vh', 'c.vh'), includes('c.vh', 'a.vh')];
const SPACED_CYCLE: VhdlFileInput[] = [topIncluding('cycle a.vh'), includes('cycle a.vh', 'cycle b.vh'), includes('cycle b.vh', './cycle a.vh')];
/** Each header also includes itself, but only inside an `ifdef that is never taken. */
const withInactiveSelfInclude = (name: string, other: string): VhdlFileInput => ({
  name,
  content: `\`ifdef NEVER_DEFINED\n\`include "${name}"\n\`endif\n\`include "${other}"\n`,
});
const CYCLE_BESIDE_INACTIVE_ONES: VhdlFileInput[] = [topIncluding('a.vh'), withInactiveSelfInclude('a.vh', 'b.vh'), withInactiveSelfInclude('b.vh', 'a.vh')];
/** Icarus defines `__ICARUS__` itself, so a.vh takes the loop through b.vh, not its own `else. */
const CYCLE_CHOSEN_BY_ICARUS: VhdlFileInput[] = [
  topIncluding('a.vh'),
  { name: 'a.vh', content: '`ifdef __ICARUS__\n`include "b.vh"\n`else\n`include "a.vh"\n`endif\n' },
  includes('b.vh', 'a.vh'),
];
/** a.vh includes itself through a macro, which HDLBoard does not trace; Icarus still loops. */
const LOOP_THROUGH_MACRO_INCLUDE: VhdlFileInput[] = [topIncluding('a.vh'), { name: 'a.vh', content: '`define NEXT "a.vh"\n`include `NEXT\n' }];
/** opens.vh opens an `ifdef that top.v closes, so Icarus never reads the self-including header between. */
const LOOP_IN_BLOCK_OPENED_BY_A_HEADER: VhdlFileInput[] = [
  {
    name: 'top.v',
    content: `\`include "opens.vh"\n\`include "self.vh"\n\`endif\nmodule top(output [9:0] LEDR);\n  assign LEDR = 10'b${LED_PATTERN};\nendmodule\n`,
  },
  { name: 'opens.vh', content: '`ifdef NEVER_DEFINED\n' },
  includes('self.vh', 'self.vh'),
];
/** `SET expands to the `define GUARD that stops g.vh including itself again. */
const LOOP_GUARDED_THROUGH_A_MACRO: VhdlFileInput[] = [
  {
    name: 'top.v',
    content: `\`define SET \`define GUARD\n\`include "g.vh"\nmodule top(output [9:0] LEDR);\n  assign LEDR = 10'b${LED_PATTERN};\nendmodule\n`,
  },
  { name: 'g.vh', content: '`ifndef GUARD\n`SET\n`include "g.vh"\n`endif\n' },
];
/** Icarus stops at the missing header, before the self-including one after it. */
const MISSING_BEFORE_LOOP: VhdlFileInput[] = [
  { name: 'top.v', content: `\`include "missing.vh"\n${topIncluding('self.vh').content}` },
  includes('self.vh', 'self.vh'),
];
/** x.vh and y.vh loop, but no source includes either, so Icarus never reads them. */
const CYCLE_IN_UNUSED_HEADERS: VhdlFileInput[] = [
  topIncluding('led.vh'),
  { name: 'led.vh', content: DEFINES_LED_VALUE },
  includes('x.vh', 'y.vh'),
  includes('y.vh', 'x.vh'),
];
const SELF_INCLUDE: VhdlFileInput[] = [topIncluding('self.vh'), includes('self.vh', 'self.vh')];
const GUARDED_CYCLE: VhdlFileInput[] = [
  topIncluding('a.vh'),
  guarded('a.vh', `\`include "b.vh"\n${DEFINES_LED_VALUE}`),
  guarded('b.vh', '`include "a.vh"\n'),
];
const CYCLE_IN_INACTIVE_BRANCH: VhdlFileInput[] = [
  topIncluding('a.vh'),
  { name: 'a.vh', content: `\`ifdef NEVER_DEFINED\n\`include "b.vh"\n\`endif\n${DEFINES_LED_VALUE}` },
  includes('b.vh', 'a.vh'),
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

  describe('I-V19: an unguarded include loop is reported before Icarus runs, at the include that closes it', () => {
    const loops = [
      ['two headers', CIRCULAR_INCLUDES, /^b\.vh:1: error: Including a\.vh here closes a loop: a\.vh → b\.vh → a\.vh\./],
      ['three headers', LONG_CYCLE, /^c\.vh:1: error: Including a\.vh here closes a loop: a\.vh → b\.vh → c\.vh → a\.vh\./],
      ['a header that includes itself', SELF_INCLUDE, /^self\.vh:1: error: Including self\.vh here closes a loop: self\.vh → self\.vh\./],
      ['two headers, not the inactive self-includes beside them', CYCLE_BESIDE_INACTIVE_ONES, /^b\.vh:4: error: .* a\.vh → b\.vh → a\.vh\./],
      ['two headers, through the branch `ifdef __ICARUS__ takes', CYCLE_CHOSEN_BY_ICARUS, /^b\.vh:1: error: .* a\.vh → b\.vh → a\.vh\./],
      ['headers spelled with spaces and ./', SPACED_CYCLE, /^cycle b\.vh:1: error: .* cycle a\.vh → cycle b\.vh → cycle a\.vh\./],
    ] as const;
    for (const [label, files, chain] of loops) {
      test(label, () =>
        withSession(async (client) => {
          const frame = await errorOf(client, [...files], 'top.v', PROMPT_ERROR_MS);
          assert.match(frame.text, chain);
        }));
    }

    test('as an analyze error', () =>
      withSession(async (client) => {
        assert.equal((await errorOf(client, CIRCULAR_INCLUDES, 'top.v', PROMPT_ERROR_MS)).stage, 'analyze');
      }));
  });

  // Icarus stops at an untraced loop only when it runs out of open files: promptly at
  // Windows' 512, but under Linux's often raised limit (1048576 in Docker) not before the
  // compile timeout, which then reports it instead.
  const promptOnlyOnWindows = { skip: process.platform !== 'win32' && 'Icarus runs until the open-file limit' };
  test('I-V19: a loop HDLBoard cannot trace keeps Icarus\'s message, with a hint below it', promptOnlyOnWindows, () =>
    withSession(async (client) => {
      const frame = await errorOf(client, LOOP_THROUGH_MACRO_INCLUDE, 'top.v', PROMPT_ERROR_MS);
      assert.match(frame.text, /Include file a\.vh not found[^]*\n\na\.vh exists, but Icarus could not open it\./);
    }));

  test('I-V19: a missing include before a loop is reported, as Icarus stops there', () =>
    withSession(async (client) => {
      const frame = await errorOf(client, MISSING_BEFORE_LOOP, 'top.v', PROMPT_ERROR_MS);
      assert.match(frame.text, /Include file missing\.vh not found/);
    }));

  test('I-V19: a genuinely missing include is not called a loop', () =>
    withSession(async (client) => {
      const frame = await errorOf(client, [{ name: 'top.v', content: MISSING_INCLUDE }], 'top.v', PROMPT_ERROR_MS);
      assert.doesNotMatch(frame.text, /loop/);
    }));

  describe('I-V19: an include loop that is never expanded runs', () => {
    const harmless = [
      ['behind include guards', GUARDED_CYCLE],
      ['in an inactive `ifdef branch', CYCLE_IN_INACTIVE_BRANCH],
      ['between headers no source includes', CYCLE_IN_UNUSED_HEADERS],
      ['inside an `ifdef a header opens and its includer closes', LOOP_IN_BLOCK_OPENED_BY_A_HEADER],
      ['guarded by a macro that expands to a `define', LOOP_GUARDED_THROUGH_A_MACRO],
    ] as const;
    for (const [label, files] of harmless) {
      test(label, () =>
        withSession(async (client) => {
          await startRun(client, [...files], 'top.v');
          await client.untilState((state) => state.ledr === LED_PATTERN);
        }));
    }
  });

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
