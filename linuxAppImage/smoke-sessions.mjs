// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Part of smoke-test.sh: starts one VHDL and one Verilog board run on a
 * running HDLBoard app and holds both sessions open, so the app has a live
 * `ghdl` and a live `vvp` child when the test stops it.
 *
 *   node smoke-sessions.mjs <port> <ready-file>
 *
 * Writes <ready-file> once both runs report READY, then keeps the sessions
 * open until smoke-test.sh ends this process. Uses the backend's own test
 * client from server/dist (built by build.sh).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [port, readyFile] = [Number(process.argv[2]), process.argv[3]];
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const { WsTestClient } = await import(pathToFileURL(join(repo, 'server/dist/testSupport/WsTestClient.js')).href);
const { startRun } = await import(pathToFileURL(join(repo, 'server/dist/testSupport/withSession.js')).href);

const designs = [
  { name: 'blinkTest.vhdl', fixture: 'tests/fixtures/vhdl/blinkTest.vhdl' },
  { name: 'blinkTest.v', fixture: 'tests/fixtures/verilog/blinkTest.v' },
];

const clients = [];
for (const design of designs) {
  const client = await WsTestClient.connect(port);
  await client.hello();
  await startRun(client, [{ name: design.name, content: readFileSync(join(repo, design.fixture), 'utf8') }], design.name);
  console.log(`  ${design.name}: READY`);
  clients.push(client);
}
writeFileSync(readyFile, 'ready\n');

// Closing a session would stop its run; smoke-test.sh ends this process instead.
setInterval(() => clients.length, 60_000);
