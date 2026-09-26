// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Output flood protection through the real backend (docs/Verilog_implementation_plan.md
 * § 5.5, case I-V21): a design that prints on every clock edge must not flood the
 * client, must not grow the backend, and must still stop promptly. The same limiter
 * protects both engines, so the VHDL equivalent — a `report` in a clocked process — is
 * checked once as well.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { LOG_LINES_PER_SECOND } from '../outputLimiter.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { requireTool } from '../testSupport/requireTool.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const ghdl = requireTool('ghdl');
const icarus = icarusForTests();

const FLOOD_DURATION_MS = 3_000;
const PROMPT_STOP_MS = 2_000;
const MS_PER_SECOND = 1_000;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_MEMORY_GROWTH_MB = 200;
const SUMMARY_LINE = /more lines? not shown/;

const VERILOG_FLOOD = `module flood(input CLOCK_50, output [9:0] LEDR);
  assign LEDR = 10'd0;
  always @(posedge CLOCK_50) $display("tick");
endmodule
`;
const VHDL_FLOOD = `library ieee;
use ieee.std_logic_1164.all;
entity flood is
  port (CLOCK_50 : in std_logic; LEDR : out std_logic_vector(9 downto 0));
end entity;
architecture rtl of flood is
begin
  LEDR <= (others => '0');
  process (CLOCK_50) begin
    if rising_edge(CLOCK_50) then report "tick"; end if;
  end process;
end architecture;
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const logLines = (client: WsTestClient): string[] =>
  client.frames.flatMap((frame) => (frame.verb === 'LOG' ? [frame.text] : []));

describe('I-V21: a flood of output lines', () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined, ...backendOptionsFor(icarus.tools) });
  });

  after(() => backend.stop());

  async function floodFor(client: WsTestClient, name: string, content: string): Promise<number> {
    await startRun(client, [{ name, content }], name);
    const startedAt = Date.now();
    await sleep(FLOOD_DURATION_MS);
    const elapsedMs = Date.now() - startedAt;
    client.stop();
    const stoppedAt = Date.now();
    await client.until((frame) => frame.verb === 'DONE', PROMPT_STOP_MS);
    assert.ok(Date.now() - stoppedAt < PROMPT_STOP_MS);
    return elapsedMs;
  }

  function assertLimited(client: WsTestClient, elapsedMs: number): void {
    const windows = Math.ceil(elapsedMs / MS_PER_SECOND) + 1;
    const lines = logLines(client);
    const summaries = lines.filter((line) => SUMMARY_LINE.test(line));
    assert.ok(summaries.length > 0, 'expected a summary of the dropped lines');
    assert.ok(lines.length <= windows * LOG_LINES_PER_SECOND + summaries.length + 2, `${lines.length} lines reached the client`);
  }

  const runFlood = (name: string, content: string) => async () => {
    const rssBefore = process.memoryUsage().rss;
    await withSessionOn(backend.port, async (client) => {
      assertLimited(client, await floodFor(client, name, content));
    });
    const growthMb = (process.memoryUsage().rss - rssBefore) / BYTES_PER_MEGABYTE;
    assert.ok(growthMb < MAX_MEMORY_GROWTH_MB, `the process grew by ${growthMb.toFixed(0)} MB`);
  };

  test('Verilog: $display on every clock edge reaches the client at a bounded rate', { skip: icarus.skip }, runFlood('flood.v', VERILOG_FLOOD));

  test('VHDL: a report in a clocked process is bounded the same way', { skip: ghdl.skip }, runFlood('flood.vhdl', VHDL_FLOOD));
});
