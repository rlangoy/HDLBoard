// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Batch plugins through the real backend and GHDL (docs/plugin_batch_implementation_plan.md
 * § 9): the plugin library is built only when a testbench declares `library hdlboard`,
 * the monitor's `@@HDLB` lines arrive as PLUGIN frames, a disabled plugin behaves as
 * if it were not installed, and an edited copy sent with the run replaces the shipped
 * file for that run only.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ghdlEngine } from '../engines/ghdlEngine.js';
import { setGhdlExe } from '../ghdl.js';
import { MAX_PLUGIN_LINES_PER_RUN } from '../pluginOutput.js';
import { parsePluginLine, type PluginLine } from '../pluginLine.js';
import { getPluginRoot, setPluginRoot } from '../pluginRoot.js';
import type { ServerFrame, VhdlFileInput } from '../protocol.js';
import { readFixture } from '../testSupport/fixture.js';
import { requireTool } from '../testSupport/requireTool.js';
import { makeTempDir } from '../testSupport/sessionDir.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { withSession } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const ghdl = requireTool('ghdl');
const RUN_TIMEOUT_MS = 60_000;

const fixtureFile = (name: string): VhdlFileInput => ({ name, content: readFixture('plugins', name) });

/** The `@@HDLB` lines a testbench is expected to print, as the PLUGIN frames they become. */
function expectedFrames(testbench: string): ServerFrame[] {
  return readFixture('plugins', `${testbench}.expected.txt`)
    .split('\n')
    .map(parsePluginLine)
    .filter((line): line is PluginLine => line !== undefined)
    .map((line) => ({ verb: 'PLUGIN', ...line }));
}

const pluginFrames = (frames: readonly ServerFrame[]) => frames.filter((frame) => frame.verb === 'PLUGIN');
const payloads = (frames: readonly ServerFrame[]) => frames.flatMap((frame) => (frame.verb === 'PLUGIN' ? [frame.payload] : []));
const kinds = (frames: readonly ServerFrame[]) => frames.flatMap((frame) => (frame.verb === 'PLUGIN' ? [frame.kind] : []));
const logTexts = (frames: readonly ServerFrame[]) => frames.flatMap((frame) => (frame.verb === 'LOG' ? [frame.text] : []));
const errorOf = (frame: ServerFrame | undefined) => (frame?.verb === 'ERROR' ? frame : undefined);
const isEnd = (frame: ServerFrame) => frame.verb === 'DONE' || frame.verb === 'ERROR';

interface TestRun {
  readonly files: VhdlFileInput[];
  readonly topFile: string;
  /** Sent as PLUGINS before the RUN; omitted, the backend's defaults apply. */
  readonly enabledIds?: string[];
}

/** Sends RUN (after PLUGINS, if given) and returns the frames up to and including DONE or ERROR. */
async function runToEnd(client: WsTestClient, { files, topFile, enabledIds }: TestRun): Promise<ServerFrame[]> {
  const from = client.frames.length;
  if (enabledIds !== undefined) client.sendFrame({ verb: 'PLUGINS', ids: enabledIds });
  client.run(files, topFile);
  await client.until(isEnd, RUN_TIMEOUT_MS);
  return client.frames.slice(from);
}

const lastFrame = (frames: readonly ServerFrame[]) => frames[frames.length - 1];

const UART_TX_FILES = [fixtureFile('uart_tx.vhd'), fixtureFile('uart_tx_tb.vhd')];

/** Prints a plugin line of its own, without the plugin library. */
const OWN_PRINT_TB = `use std.textio.all;
entity own_print_tb is end entity;
architecture sim of own_print_tb is
begin
  process
    variable l : line;
  begin
    write(l, string'("@@HDLB uart TX 0 41"));
    writeline(output, l);
    wait;
  end process;
end architecture;
`;

const BAD_NAME_TB = `library ieee;
use ieee.std_logic_1164.all;
library hdlboard;
entity bad_name_tb is end entity;
architecture sim of bad_name_tb is
  signal line_in : std_logic := '1';
begin
  mon: entity hdlboard.uart_monitor generic map (name => "my tab") port map (rx => line_in);
end architecture;
`;

/** A student entity called uart_monitor, analysed into work. */
const OWN_MONITOR = `entity uart_monitor is end entity;
architecture a of uart_monitor is begin end architecture;
`;

/** Uses both the student's uart_monitor and the plugin's; sends one 0x00 byte. */
const SAME_NAME_TB = `library ieee;
use ieee.std_logic_1164.all;
library hdlboard;
entity same_name_tb is end entity;
architecture sim of same_name_tb is
  signal line_in : std_logic := '1';
begin
  mine: entity work.uart_monitor;
  mon: entity hdlboard.uart_monitor generic map (name => "RX") port map (rx => line_in);
  process begin
    wait for 1 us;
    line_in <= '0';
    wait for 9 * 8680 ns;
    line_in <= '1';
    wait for 20 us;
    std.env.finish;
  end process;
end architecture;
`;

/** Prints plugin lines as fast as GHDL can, far past every plugin budget. */
const FLOOD_TB = `library hdlboard;
use hdlboard.hdlb_pkg.all;
entity flood_tb is end entity;
architecture sim of flood_tb is
begin
  process begin
    for i in 1 to 150000 loop
      hdlb_emit("uart", "TX", "48");
      wait for 1 ns;
    end loop;
    std.env.finish;
  end process;
end architecture;
`;

const shippedMonitor = () => readFileSync(join(getPluginRoot(), 'uart_monitor.vhd'), 'utf8');

describe('batch plugins', { skip: ghdl.skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined });
  });

  after(() => backend.stop());

  test('the UART example gives its four PLUGIN frames, and a second run only its own', async () => {
    await withSession(backend.port, async (client) => {
      for (let run = 0; run < 2; run++) {
        const frames = await runToEnd(client, { files: UART_TX_FILES, topFile: 'uart_tx_tb.vhd' });
        assert.equal(frames[0]?.verb, 'READY');
        assert.deepEqual(pluginFrames(frames), expectedFrames('uart_tx_tb'));
        assert.deepEqual(lastFrame(frames), { verb: 'DONE', reason: 'completed' });
      }
    });
  });

  for (const testbench of ['uart_monitor_fe_tb', 'uart_monitor_edge_tb']) {
    test(`${testbench} gives the expected PLUGIN frames`, async () => {
      await withSession(backend.port, async (client) => {
        const frames = await runToEnd(client, { files: [fixtureFile(`${testbench}.vhd`)], topFile: `${testbench}.vhd` });
        assert.deepEqual(pluginFrames(frames), expectedFrames(testbench));
      });
    });
  }

  test('a disabled plugin is not found, and the hint says how to enable it', async () => {
    await withSession(backend.port, async (client) => {
      const error = errorOf(lastFrame(await runToEnd(client, { files: UART_TX_FILES, topFile: 'uart_tx_tb.vhd', enabledIds: [] })));
      assert.match(error?.text ?? '', /not found in library "hdlboard"[\s\S]*The plugin "RS232 \(UART\)" is disabled/);
    });
  });

  test("a student's own @@HDLB print of a disabled plugin's kind stays in the console", async () => {
    await withSession(backend.port, async (client) => {
      const frames = await runToEnd(client, { files: [{ name: 'own_print_tb.vhd', content: OWN_PRINT_TB }], topFile: 'own_print_tb.vhd', enabledIds: [] });
      assert.deepEqual(pluginFrames(frames), []);
      assert.ok(logTexts(frames).includes('@@HDLB uart TX 0 41'));
    });
  });

  test('a plugin with an invalid name stops the run with the assertion message', async () => {
    await withSession(backend.port, async (client) => {
      const frames = await runToEnd(client, { files: [{ name: 'bad_name_tb.vhd', content: BAD_NAME_TB }], topFile: 'bad_name_tb.vhd' });
      // GHDL prints the assertion on stdout, so it reaches the console as LOG before the ERROR.
      assert.equal(lastFrame(frames)?.verb, 'ERROR');
      assert.ok(logTexts(frames).some((text) => /generic name must match .*"my tab"/.test(text)));
    });
  });

  test('a student entity called uart_monitor does not clash with the plugin', async () => {
    await withSession(backend.port, async (client) => {
      const files = [
        { name: 'own_monitor.vhd', content: OWN_MONITOR },
        { name: 'same_name_tb.vhd', content: SAME_NAME_TB },
      ];
      const frames = await runToEnd(client, { files, topFile: 'same_name_tb.vhd' });
      assert.deepEqual(lastFrame(frames), { verb: 'DONE', reason: 'completed' });
      assert.deepEqual(payloads(frames), ['00']);
    });
  });

  test('an edited monitor is analysed instead of the shipped one, which stays unchanged', async () => {
    const shipped = shippedMonitor();
    const edited = shipped.replace(/hdlb_emit\("uart"/g, 'hdlb_emit("myuart"');
    await withSession(backend.port, async (client) => {
      const files = [...UART_TX_FILES, { name: 'hdlboard/uart_monitor.vhd', content: edited }];
      const frames = await runToEnd(client, { files, topFile: 'uart_tx_tb.vhd' });
      assert.equal(logTexts(frames)[0], 'Plugins: using edited files: uart_monitor.vhd');
      assert.deepEqual(kinds(frames), ['myuart', 'myuart', 'myuart', 'myuart']);
    });
    assert.equal(shippedMonitor(), shipped);
  });

  test('an unchanged copy sent with the run gives no notice', async () => {
    await withSession(backend.port, async (client) => {
      const files = [...UART_TX_FILES, { name: 'hdlboard/uart_monitor.vhd', content: shippedMonitor() }];
      const frames = await runToEnd(client, { files, topFile: 'uart_tx_tb.vhd' });
      assert.equal(logTexts(frames).some((text) => text.startsWith('Plugins:')), false);
      assert.deepEqual(pluginFrames(frames), expectedFrames('uart_tx_tb'));
    });
  });

  test('a syntax error in an edited plugin file is a plugin error naming the file', async () => {
    await withSession(backend.port, async (client) => {
      const files = [...UART_TX_FILES, { name: 'hdlboard/uart_monitor.vhd', content: 'entity uart_monitor is\n' }];
      const error = errorOf(lastFrame(await runToEnd(client, { files, topFile: 'uart_tx_tb.vhd' })));
      assert.equal(error?.stage, 'plugin');
      assert.match(error?.text ?? '', /hdlboard\/uart_monitor\.vhd/);
    });
  });

  test('a flood of plugin lines is cut at the budget and summarised', async () => {
    await withSession(backend.port, async (client) => {
      const frames = await runToEnd(client, { files: [{ name: 'flood_tb.vhd', content: FLOOD_TB }], topFile: 'flood_tb.vhd' });
      const sent = pluginFrames(frames).length;
      assert.ok(sent > 0 && sent <= MAX_PLUGIN_LINES_PER_RUN, `${sent} PLUGIN frames`);
      assert.ok(logTexts(frames).some((text) => /plugin lines? not shown \(plugin limit/.test(text)));
    });
  });
});

describe('the plugin library build', { skip: ghdl.skip }, () => {
  before(() => {
    if (ghdl.exe) setGhdlExe(ghdl.exe);
  });

  test('is skipped when no file declares library hdlboard', async (t) => {
    const dir = makeTempDir('hdlboard-plugins-');
    t.after(() => dir.cleanup());
    const files = [{ name: 'own_print_tb.vhd', content: OWN_PRINT_TB }];
    const result = await ghdlEngine.prepare({ dir: dir.path, files, topFile: 'own_print_tb.vhd' });
    assert.equal(result.ok, true);
    assert.equal(existsSync(join(dir.path, 'hdlboard-obj08.cf')), false);
  });

  test('a missing plugin root is an internal error that names the path', async (t) => {
    const dir = makeTempDir('hdlboard-plugins-');
    const root = getPluginRoot();
    t.after(() => {
      setPluginRoot(root);
      dir.cleanup();
    });
    setPluginRoot(join(dir.path, 'no-such-plugin-root'));
    const result = await ghdlEngine.prepare({ dir: dir.path, files: UART_TX_FILES, topFile: 'uart_tx_tb.vhd' });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.stage, 'internal');
    assert.match(!result.ok ? result.text : '', /plugin root not found: .*no-such-plugin-root/);
  });
});
