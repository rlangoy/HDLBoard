// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The synthesis check on the real GHDL (docs/impl_sim_only_warnings.md § 7): what
 * `ghdl --synth` says about the designs the page classifies by,
 * read the way the session runs them — from the run's compile, in a folder of their own.
 */

import assert from 'node:assert/strict';
import { before, describe, test, type TestContext } from 'node:test';
import { DEFAULT_BOARD_IO } from '../engines/boardPorts.js';
import { ghdlEngine, ghdlSynthCommand } from '../engines/ghdlEngine.js';
import { setGhdlExe } from '../ghdl.js';
import type { VhdlFileInput } from '../protocol.js';
import { runSynthCheck, SynthSlots, type SynthReport } from '../synthCheck.js';
import { readFixture } from '../testSupport/fixture.js';
import { requireTool } from '../testSupport/requireTool.js';
import { makeTempDir } from '../testSupport/sessionDir.js';

const ghdl = requireTool('ghdl');
let nextId = 1;

interface Check {
  /** The run's files; the first is its top file. */
  readonly files: readonly VhdlFileInput[];
  /** The unit checked: the run's top, or a testbench's DUT. */
  readonly top: string;
  /** The files the page names for the check; all of them when absent. */
  readonly checked?: readonly string[];
}

/** Compiles the run as the session does, then checks `top` as the session would. */
async function checkWithGhdl(t: TestContext, { files, top, checked }: Check): Promise<SynthReport> {
  const dir = makeTempDir('hdlboard-synth-');
  t.after(() => dir.cleanup());
  const prepared = await ghdlEngine.prepare({ board: DEFAULT_BOARD_IO, dir: dir.path, files, topFile: files[0]?.name });
  assert.ok(prepared.ok, prepared.ok ? '' : prepared.text);
  assert.ok(prepared.plan.synth);
  const names = checked ?? files.map((file) => file.name);
  const command = ghdlSynthCommand(prepared.plan.synth, { top, files: names });
  const report = await runSynthCheck(
    {
      dir: dir.path,
      id: nextId++,
      command,
      files: files.filter((file) => names.includes(file.name)),
      timeoutMs: 20_000,
      signal: new AbortController().signal,
    },
    new SynthSlots(1),
  );
  assert.ok(report);
  return report;
}

const vhdl = (name: string, body: string): VhdlFileInput => ({
  name,
  content: `library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n\n${body}`,
});

const BOARD_ENTITY = `entity DE1_SoC is
  port (CLOCK_50 : in std_logic; SW : in std_logic_vector(9 downto 0); LEDR : out std_logic_vector(9 downto 0));
end entity;
`;

const BLINK_WAIT = vhdl('DE1_SoC.vhdl', `${BOARD_ENTITY}
architecture rtl of DE1_SoC is
begin
  process
  begin
    LEDR(0) <= '1';
    wait for 500 ms;
    LEDR(0) <= '0';
    wait for 500 ms;
  end process;
  LEDR(9 downto 1) <= (others => '0');
end architecture;
`);

const COMBINATIONAL_LATCH = vhdl('DE1_SoC.vhdl', `${BOARD_ENTITY}
architecture rtl of DE1_SoC is
  signal q : std_logic;
begin
  process (SW)
  begin
    if SW(1) = '1' then
      q <= SW(0);
    end if;
  end process;
  LEDR <= (9 downto 1 => '0') & q;
end architecture;
`);

/** The same latch, kept in a bit of an output port: GHDL builds a loop and says nothing. */
const PORT_BIT_LATCH = vhdl('DE1_SoC.vhdl', `${BOARD_ENTITY}
architecture rtl of DE1_SoC is
begin
  process (SW)
  begin
    if SW(1) = '1' then
      LEDR(0) <= SW(0);
    end if;
  end process;
  LEDR(9 downto 1) <= (others => '0');
end architecture;
`);

const TWO_DRIVERS = vhdl('DE1_SoC.vhdl', `${BOARD_ENTITY}
architecture rtl of DE1_SoC is
begin
  LEDR <= SW;
  LEDR(0) <= SW(1);
end architecture;
`);

const TEXTIO = {
  name: 'DE1_SoC.vhdl',
  content: `library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

${BOARD_ENTITY}
architecture rtl of DE1_SoC is
begin
  process (CLOCK_50)
    variable l : line;
  begin
    if rising_edge(CLOCK_50) then
      write(l, string'("tick"));
      writeline(output, l);
    end if;
  end process;
  LEDR <= SW;
end architecture;
`,
};

const GUARDED_WAIT = vhdl('DE1_SoC.vhdl', `${BOARD_ENTITY}
architecture rtl of DE1_SoC is
begin
  LEDR <= SW;
  -- synthesis translate_off
  process
  begin
    report "started";
    wait;
  end process;
  -- synthesis translate_on
end architecture;
`);

const LEGACY_COUNTER = {
  name: 'DE1_SoC.vhdl',
  content: `library ieee;
use ieee.std_logic_1164.all;
use ieee.std_logic_unsigned.all;

${BOARD_ENTITY}
architecture rtl of DE1_SoC is
  signal count : std_logic_vector(9 downto 0) := (others => '0');
begin
  count <= count + 1 when rising_edge(CLOCK_50);
  LEDR <= count;
end architecture;
`,
};

/** A latch in a design under test, and a testbench full of simulation-only code. */
const LATCH_DUT = vhdl('gate.vhd', `entity gate is
  port (en, d : in std_logic; q : out std_logic);
end entity;

architecture rtl of gate is
begin
  process (en, d)
  begin
    if en = '1' then
      q <= d;
    end if;
  end process;
end architecture;
`);

const GATE_TB = vhdl('gate_tb.vhd', `entity gate_tb is
end entity;

architecture sim of gate_tb is
  signal en, d, q : std_logic := '0';
begin
  dut : entity work.gate port map (en => en, d => d, q => q);
  process
  begin
    en <= '1';
    wait for 10 ns;
    d <= '1';
    wait;
  end process;
end architecture;
`);

/** The top, sent first, instantiates a unit from a file sent after it. */
const TOP_FIRST = vhdl('DE1_SoC.vhdl', `${BOARD_ENTITY}
architecture rtl of DE1_SoC is
begin
  inv : entity work.inverter port map (a => SW, y => LEDR);
end architecture;
`);
const INVERTER = vhdl('inverter.vhd', `entity inverter is
  port (a : in std_logic_vector(9 downto 0); y : out std_logic_vector(9 downto 0));
end entity;

architecture rtl of inverter is
begin
  y <= not a;
end architecture;
`);

const exitOf = (report: SynthReport) => (report.outcome.kind === 'exit' ? report.outcome.code : report.outcome.kind);

describe('ghdl --synth beside a run', { skip: ghdl.skip }, () => {
  before(() => {
    if (ghdl.exe) setGhdlExe(ghdl.exe);
  });
  const check = checkWithGhdl;

  test('rejects the wait for of the blink process', async (t) => {
    const report = await check(t, { files: [BLINK_WAIT], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 1);
    assert.match(report.text, /DE1_SoC\.vhdl:\d+:\d+:error: .*(not allowed|wait)/);
  });

  test('names a latch, on its line', async (t) => {
    const report = await check(t, { files: [COMBINATIONAL_LATCH], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 1);
    assert.match(report.text, /DE1_SoC\.vhdl:\d+:\d+:error: latch infered for net/);
  });

  test('misses a latch kept in a bit of an output port: a pass is no proof', async (t) => {
    const report = await check(t, { files: [PORT_BIT_LATCH], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 0, report.text);
  });

  test('names two drivers of one signal', async (t) => {
    const report = await check(t, { files: [TWO_DRIVERS], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 1);
    assert.match(report.text, /multiple assignments for/);
  });

  test('rejects a textio line variable', async (t) => {
    const report = await check(t, { files: [TEXTIO], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 1);
    assert.match(report.text, /access type/);
  });

  test('passes the two-clock counter, which Quartus rejects: a pass is not RTL', async (t) => {
    const report = await check(t, { files: [{ name: 'keyCounterTwoClocks.vhdl', content: readFixture('vhdl', 'keyCounterTwoClocks.vhdl') }], top: 'keyCounterTwoClocks' });
    assert.equal(exitOf(report), 0);
    assert.doesNotMatch(report.text, /pragma/);
  });

  test('honours translate_off', async (t) => {
    const report = await check(t, { files: [GUARDED_WAIT], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 0, report.text);
  });

  test('synthesizes a std_logic_unsigned design with the run\'s own -fsynopsys', async (t) => {
    const report = await check(t, { files: [LEGACY_COUNTER], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 0, report.text);
  });

  test('reads the files in the order they analysed, not the order they were sent', async (t) => {
    const report = await check(t, { files: [TOP_FIRST, INVERTER], top: 'DE1_SoC' });
    assert.equal(exitOf(report), 0, report.text);
  });

  test('a testbench run checks its DUT alone: one latch, nothing about the testbench', async (t) => {
    const report = await check(t, { files: [GATE_TB, LATCH_DUT], top: 'gate', checked: ['gate.vhd'] });
    assert.equal(exitOf(report), 1);
    const errors = report.text.split('\n').filter((line) => line.includes(':error:'));
    assert.equal(errors.length, 1, report.text);
    assert.match(errors[0] ?? '', /^gate\.vhd:\d+:\d+:error: latch infered/);
  });

  test('says it cannot find a top that is not there', async (t) => {
    const report = await check(t, { files: [INVERTER], top: 'nosuchunit' });
    assert.equal(exitOf(report), 1);
    assert.match(report.text, /cannot find entity or configuration nosuchunit/);
  });
});
