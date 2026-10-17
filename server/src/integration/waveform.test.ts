// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Waveform recording through the real backend, GHDL and Icarus Verilog
 * (docs/waveform_viewer_spec.md § 14, integration tests): `WAVE-READY` before the run's
 * end, the file on `WAVE-GET` and only then, the size guard, Stop, older runs, and a
 * Verilog testbench that dumps a waveform itself.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import type { ServerFrame, VhdlFileInput } from '../protocol.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { requireTool } from '../testSupport/requireTool.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { withSession } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const ghdl = requireTool('ghdl');
const icarus = icarusForTests();
const RUN_TIMEOUT_MS = 60_000;
/** Small, so a never-ending testbench reaches it in well under a second. */
const TEST_MAX_WAVE_BYTES = 200_000;
const STOP_AFTER_MS = 300;

const COUNTER_TB = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity counter_tb is end entity;
architecture sim of counter_tb is
  type state_t is (idle, counting, done);
  signal clk : std_logic := '0';
  signal count : unsigned(3 downto 0) := (others => '0');
  signal state : state_t := idle;
  signal running : boolean := true;
begin
  clk <= not clk after 5 ns when running;
  process (clk) begin
    if rising_edge(clk) then count <= count + 1; end if;
  end process;
  process begin
    wait for 20 ns;
    state <= counting;
    wait for 180 ns;
    report "at the end";
    state <= done;
    running <= false;
    wait;
  end process;
end architecture;
`;

const FOREVER_TB = `library ieee;
use ieee.std_logic_1164.all;
entity forever_tb is end entity;
architecture sim of forever_tb is
  signal clk : std_logic := '0';
begin
  clk <= not clk after 5 ns;
end architecture;
`;

/** Busy for many seconds of real time without simulated time moving: only Stop ends it, and its file stays small. */
const BUSY_TB = `entity busy_tb is end entity;
architecture sim of busy_tb is
  signal step : integer := 0;
begin
  process
    variable v : integer := 0;
  begin
    step <= 1;
    wait for 1 ns;
    for i in 1 to 2000000000 loop
      v := (v + i) mod 7;
    end loop;
    step <= v;
    wait;
  end process;
end architecture;
`;

const VERILOG_TB = `module counter_tb;
  reg clk = 0;
  reg [3:0] count = 0;
  always #5 clk = ~clk;
  always @(posedge clk) count <= count + 1;
  initial begin #200 $display("done"); $finish; end
endmodule
`;

const OWN_DUMP_TB = VERILOG_TB.replace('initial begin #200', 'initial begin $dumpvars(0, counter_tb); #200');

const vhdl = (name: string, content: string): VhdlFileInput[] => [{ name, content }];
const isEnd = (frame: ServerFrame) => frame.verb === 'DONE' || frame.verb === 'ERROR';
const verbs = (frames: readonly ServerFrame[]) => frames.map((frame) => frame.verb);
const waveVerbs = (frames: readonly ServerFrame[]) => verbs(frames).filter((verb) => verb.startsWith('WAVE'));
const logs = (frames: readonly ServerFrame[]) => frames.flatMap((frame) => (frame.verb === 'LOG' ? [frame.text] : []));

interface WaveRun {
  readonly files: VhdlFileInput[];
  readonly topFile: string;
  /** Sent as WAVE on/off before the RUN. */
  readonly wave: boolean;
}

async function runToEnd(client: WsTestClient, { files, topFile, wave }: WaveRun): Promise<ServerFrame[]> {
  const from = client.frames.length;
  client.sendFrame({ verb: 'WAVE', on: wave });
  client.run(files, topFile);
  await client.until(isEnd, RUN_TIMEOUT_MS);
  return client.frames.slice(from);
}

function waveReady(frames: readonly ServerFrame[]) {
  const ready = frames.find((frame) => frame.verb === 'WAVE-READY');
  assert.ok(ready?.verb === 'WAVE-READY', `no WAVE-READY in ${verbs(frames).join(', ')}`);
  return ready;
}

/** Sends WAVE-GET and returns the uncompressed file, or the WAVE-NONE it got. */
async function fetchWave(client: WsTestClient, run: number): Promise<Buffer | 'none'> {
  const fromBinary = client.binary.length;
  client.sendFrame({ verb: 'WAVE-GET', run });
  const end = await client.until((frame) => (frame.verb === 'WAVE-END' || frame.verb === 'WAVE-NONE') && frame.run === run, RUN_TIMEOUT_MS);
  if (end.verb === 'WAVE-NONE') return 'none';
  return gunzipSync(Buffer.concat(client.binary.slice(fromBinary)));
}

describe('waveforms of VHDL testbench runs', { skip: ghdl.skip }, () => {
  let backend: TestBackend;
  const savedLimit = process.env.HDL_MAX_WAVE_BYTES;
  before(async () => {
    process.env.HDL_MAX_WAVE_BYTES = String(TEST_MAX_WAVE_BYTES);
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined });
  });
  after(async () => {
    await backend.stop();
    if (savedLimit === undefined) delete process.env.HDL_MAX_WAVE_BYTES;
    else process.env.HDL_MAX_WAVE_BYTES = savedLimit;
  });

  test('GHW: WAVE-READY before DONE completed, the file only on WAVE-GET', async () => {
    await withSession(backend.port, async (client) => {
      const frames = await runToEnd(client, { files: vhdl('counter_tb.vhd', COUNTER_TB), topFile: 'counter_tb.vhd', wave: true });
      const ready = waveReady(frames);
      assert.deepEqual(verbs(frames).slice(-2), ['WAVE-READY', 'DONE']);
      assert.deepEqual(frames[frames.length - 1], { verb: 'DONE', reason: 'completed' });
      assert.equal(ready.format, 'ghw');
      assert.equal(ready.status, 'complete');
      assert.equal(client.binary.length, 0, 'nothing is sent before WAVE-GET (W5)');
      const file = await fetchWave(client, ready.run);
      assert.ok(file !== 'none');
      assert.equal(file.length, ready.bytes);
      assert.equal(file.subarray(0, 9).toString('latin1'), 'GHDLwave\n');
    });
  });

  test('recording off: no WAVE frames at all', async () => {
    await withSession(backend.port, async (client) => {
      const frames = await runToEnd(client, { files: vhdl('counter_tb.vhd', COUNTER_TB), topFile: 'counter_tb.vhd', wave: false });
      assert.deepEqual(waveVerbs(frames), []);
      assert.deepEqual(frames[frames.length - 1], { verb: 'DONE', reason: 'completed' });
    });
  });

  test('a never-ending testbench is stopped at the size limit, with the reason, and its waveform kept', async () => {
    await withSession(backend.port, async (client) => {
      const started = Date.now();
      const frames = await runToEnd(client, { files: vhdl('forever_tb.vhd', FOREVER_TB), topFile: 'forever_tb.vhd', wave: true });
      assert.ok(Date.now() - started < 20_000);
      const ready = waveReady(frames);
      assert.equal(ready.status, 'size-limit');
      assert.ok(ready.bytes > TEST_MAX_WAVE_BYTES);
      assert.ok(logs(frames).some((text) => /too large/.test(text) && /std\.env\.stop/.test(text)));
      assert.deepEqual(frames[frames.length - 1], { verb: 'DONE', reason: 'stopped' });
      const file = await fetchWave(client, ready.run);
      assert.ok(file !== 'none' && file.subarray(0, 9).toString('latin1') === 'GHDLwave\n');
    });
  });

  test('Stop during a run gives a stopped waveform; an older run gets WAVE-NONE', async () => {
    await withSession(backend.port, async (client) => {
      const first = await runToEnd(client, { files: vhdl('counter_tb.vhd', COUNTER_TB), topFile: 'counter_tb.vhd', wave: true });
      const firstRun = waveReady(first).run;

      const from = client.frames.length;
      client.sendFrame({ verb: 'WAVE', on: true });
      client.run(vhdl('busy_tb.vhd', BUSY_TB), 'busy_tb.vhd');
      await client.until((frame) => frame.verb === 'READY', RUN_TIMEOUT_MS);
      // Long enough for GHDL to have started and created its file, as a student's Stop is.
      await new Promise((resolve) => setTimeout(resolve, STOP_AFTER_MS));
      client.stop();
      await client.until(isEnd, RUN_TIMEOUT_MS);
      const second = client.frames.slice(from);
      const ready = waveReady(second);
      assert.equal(ready.status, 'stopped');
      assert.ok(ready.run > firstRun);
      assert.equal(await fetchWave(client, firstRun), 'none');
    });
  });
});

describe('waveforms of Verilog testbench runs', { skip: icarus.skip }, () => {
  let backend: TestBackend;
  before(async () => {
    backend = await startTestBackend(backendOptionsFor(icarus.tools));
  });
  after(() => backend.stop());

  test('VCD through the helper module; Icarus’s notice about it is not shown', async () => {
    await withSession(backend.port, async (client) => {
      const frames = await runToEnd(client, { files: vhdl('counter_tb.v', VERILOG_TB), topFile: 'counter_tb.v', wave: true });
      const ready = waveReady(frames);
      assert.equal(ready.format, 'vcd');
      assert.equal(ready.status, 'complete');
      assert.ok(!logs(frames).some((text) => text.includes('VCD info')), logs(frames).join('\n'));
      assert.ok(logs(frames).includes('done'));
      const file = await fetchWave(client, ready.run);
      assert.ok(file !== 'none');
      const text = file.toString('utf8');
      assert.match(text, /\$scope module counter_tb \$end/);
      assert.match(text, /\$var reg 4 \S+ count \[3:0\] \$end/);
    });
  });

  test('a testbench with its own $dumpvars: no helper, a note, and its own dump.vcd is offered', async () => {
    await withSession(backend.port, async (client) => {
      const frames = await runToEnd(client, { files: vhdl('counter_tb.v', OWN_DUMP_TB), topFile: 'counter_tb.v', wave: true });
      assert.ok(logs(frames).some((text) => /its own waveform/.test(text)));
      const ready = waveReady(frames);
      const file = await fetchWave(client, ready.run);
      assert.ok(file !== 'none' && /\$var reg 4 \S+ count/.test(file.toString('utf8')));
    });
  });
});
