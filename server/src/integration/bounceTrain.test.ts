// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A bouncing button's timed `STIM` steps (protocol 4) in the real simulators: every
 * step reaches the design as its own edge, and each is held exactly its hold time in
 * simulated time — shorter than the testbench's 10 us poll, too.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { BackendOptions } from '../server.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { requireTool } from '../testSupport/requireTool.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession } from '../testSupport/withSession.js';

/** `STIM` order: SW9 … SW0, then KEY3 … KEY0 (active low: 1 is released). */
const SWITCHES = '0000000000';
const RELEASED = `${SWITCHES}1111`;
const KEY0_DOWN = `${SWITCHES}1110`;

/** A press of KEY0 that bounces twice, 20 us per step: three falling edges. */
const BOUNCING_PRESS = [
  { bits: KEY0_DOWN, holdNs: 20_000 },
  { bits: RELEASED, holdNs: 20_000 },
  { bits: KEY0_DOWN, holdNs: 20_000 },
  { bits: RELEASED, holdNs: 20_000 },
  { bits: KEY0_DOWN },
];

/** KEY0 down for 2 us twice: 4 us in all, 200 cycles of the 50 MHz CLOCK_50. */
const SHORT_PULSES = [
  { bits: KEY0_DOWN, holdNs: 2_000 },
  { bits: RELEASED, holdNs: 2_000 },
  { bits: KEY0_DOWN, holdNs: 2_000 },
  { bits: RELEASED },
];
const SHORT_PULSE_CYCLES = 200;
/** A clock edge on either side of each pulse may fall in or out. */
const CYCLE_TOLERANCE = 2;
/** Real time to let the run go on after the count is reached, so a late extra count would show. */
const SETTLE_MS = 500;

const ledrValue = (ledr: string): number => parseInt(ledr, 2);

interface Language {
  readonly name: string;
  readonly skip: string | false;
  readonly options: () => BackendOptions;
  /** Counts falling edges of KEY_N(0) on LEDR. */
  readonly edgeCounter: { readonly name: string; readonly content: string };
  /** Counts CLOCK_50 cycles with KEY_N(0) low on LEDR. */
  readonly lowCycles: { readonly name: string; readonly content: string };
}

const ghdl = requireTool('ghdl');
const icarus = icarusForTests();

const VHDL_PORTS = `    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );`;

const LANGUAGES: readonly Language[] = [
  {
    name: 'GHDL',
    skip: ghdl.skip,
    options: () => ({ ghdlExe: ghdl.exe ?? undefined }),
    edgeCounter: {
      name: 'edges.vhdl',
      content: `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity edges is
${VHDL_PORTS}
end entity;
architecture rtl of edges is
    signal count : unsigned(9 downto 0) := (others => '0');
begin
    process (KEY_N)
    begin
        if falling_edge(KEY_N(0)) then
            count <= count + 1;
        end if;
    end process;
    LEDR <= std_logic_vector(count);
end architecture;
`,
    },
    lowCycles: {
      name: 'low_cycles.vhdl',
      content: `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity low_cycles is
${VHDL_PORTS}
end entity;
architecture rtl of low_cycles is
    signal cycles : unsigned(9 downto 0) := (others => '0');
begin
    process (CLOCK_50)
    begin
        if rising_edge(CLOCK_50) and KEY_N(0) = '0' then
            cycles <= cycles + 1;
        end if;
    end process;
    LEDR <= std_logic_vector(cycles);
end architecture;
`,
    },
  },
  {
    name: 'Icarus',
    skip: icarus.skip,
    options: () => backendOptionsFor(icarus.tools),
    edgeCounter: {
      name: 'edges.v',
      content: `module edges (input wire CLOCK_50, input wire [3:0] KEY_N, output reg [9:0] LEDR = 0);
    always @(negedge KEY_N[0]) LEDR <= LEDR + 1;
endmodule
`,
    },
    lowCycles: {
      name: 'low_cycles.v',
      content: `module low_cycles (input wire CLOCK_50, input wire [3:0] KEY_N, output reg [9:0] LEDR = 0);
    always @(posedge CLOCK_50) if (!KEY_N[0]) LEDR <= LEDR + 1;
endmodule
`,
    },
  },
];

for (const language of LANGUAGES) {
  describe(`${language.name}: a bouncing button's timed STIM steps`, { skip: language.skip }, () => {
    let backend: TestBackend;
    before(async () => {
      backend = await startTestBackend(language.options());
    });
    after(() => backend.stop());

    test('each bounce reaches the design as its own falling edge', () =>
      withSession(backend.port, async (client) => {
        await startRun(client, [language.edgeCounter], language.edgeCounter.name);
        client.stim(RELEASED);
        client.stimSteps(BOUNCING_PRESS);
        await client.untilState((state) => ledrValue(state.ledr) === 3);
        client.stim(RELEASED);
        client.stim(KEY0_DOWN);
        await client.untilState((state) => ledrValue(state.ledr) === 4);
      }));

    test('each step is held exactly its hold time, even below the 10 us poll', () =>
      withSession(backend.port, async (client) => {
        await startRun(client, [language.lowCycles], language.lowCycles.name);
        client.stim(RELEASED);
        client.stimSteps(SHORT_PULSES);
        await client.untilState((state) => ledrValue(state.ledr) >= SHORT_PULSE_CYCLES - CYCLE_TOLERANCE);
        // Settled: no more cycles are counted once KEY0 is released.
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        const settled = ledrValue(client.latestBoardState()?.ledr ?? '');
        assert.ok(Math.abs(settled - SHORT_PULSE_CYCLES) <= CYCLE_TOLERANCE, `expected about ${SHORT_PULSE_CYCLES} low cycles, got ${settled}`);
      }));
  });
}
