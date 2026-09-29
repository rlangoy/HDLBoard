// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Tier 2 of the installation check (docs/Verilog_implementation_plan.md § 7.8): runs
 * every scenario in tests/fixtures/scenarios.json, in each language it has a fixture
 * for, against a running backend over its WebSocket, and prints a pass/fail table.
 * Works against a dev backend, a Linux server, or the installed app while HDLBoard is
 * running:
 *
 *     node tools/verify-backend.mjs ws://127.0.0.1:9010/hdlsim
 *
 * Standalone on purpose (no build step), so its board-matching rule mirrors
 * server/src/testSupport/boardState.ts and must be kept in step with it.
 *
 * Exit code 0 when every scenario passes, 1 otherwise. Needs Node and, for the
 * WebSocket client, `npm install` to have been run in server/.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = createRequire(join(root, 'server', 'package.json'))('ws');

const url = process.argv[2] ?? 'ws://127.0.0.1:9010/hdlsim';
const PROTOCOL_VERSION = '1';
const STEP_TIMEOUT_MS = 8000;
const BATCH_TIMEOUT_MS = 20000;
const BLANK_HEX = '1'.repeat(42);

const scenarios = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'scenarios.json'), 'utf8'));
const readFixture = (language, name) =>
  readFileSync(join(root, 'tests', 'fixtures', language, name), 'utf8').replace(/\r\n/g, '\n');

/** One connection: frames in, a cursor over them, and waiting helpers. */
class Client {
  constructor(socket) {
    this.socket = socket;
    this.frames = [];
    this.cursor = 0;
    this.wake = null;
    socket.on('message', (data) => {
      this.frames.push(data.toString());
      this.wake?.();
    });
  }

  static async connect() {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const client = new Client(socket);
    socket.send(`HELLO ${PROTOCOL_VERSION}`);
    return client;
  }

  async until(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.frames.length) {
        const frame = this.frames[this.cursor++];
        if (predicate(frame)) return frame;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out; last frames: ${JSON.stringify(this.frames.slice(-3))}`);
      await new Promise((resolve) => {
        this.wake = resolve;
        setTimeout(resolve, remaining);
      });
    }
  }

  latestState() {
    for (let index = this.frames.length - 1; index >= 0; index -= 1) {
      if (this.frames[index].startsWith('STATE ')) return this.frames[index].slice('STATE '.length).trim();
    }
    return undefined;
  }

  logText() {
    return this.frames.filter((f) => f.startsWith('LOG')).map((f) => f.slice(f.indexOf('\n') + 1)).join('\n');
  }

  close() {
    this.socket.close();
  }
}

function matches(bits, expected) {
  const ledr = bits.slice(0, 10).replace(/X/gi, '0');
  const hex = bits.slice(10).replace(/X/gi, '1');
  const expectedHex = expected.hex === 'blank' ? BLANK_HEX : expected.hex;
  return (expected.ledr === undefined || expected.ledr === ledr) && (expectedHex === undefined || expectedHex === hex);
}

async function playStep(client, step) {
  const startedAt = Date.now();
  if (step.sw !== undefined && step.key !== undefined) client.socket.send(`STIM ${step.sw}${step.key}`);
  const timeout = step.withinMs ? step.withinMs[1] : STEP_TIMEOUT_MS;
  for (;;) {
    const state = client.latestState();
    if (state && matches(state, step.expect)) break;
    if (Date.now() - startedAt > timeout) throw new Error(`step "${step.name}": board never reached ${JSON.stringify(step.expect)}`);
    await client.until((frame) => frame.startsWith('STATE '), timeout).catch(() => undefined);
  }
  const elapsed = Date.now() - startedAt;
  if (step.withinMs && elapsed < step.withinMs[0]) throw new Error(`step "${step.name}": appeared after ${elapsed} ms, before ${step.withinMs[0]} ms`);
}

async function runFixture(fixture, language) {
  const name = fixture.files[language];
  const files = [...(fixture.companions?.[language] ?? []), name].map((file) => ({ name: file, content: readFixture(language, file) }));
  const body = files.map((f) => `@@FILE ${f.name}@@\n${f.content}`).join('\n');
  const client = await Client.connect();
  try {
    client.socket.send(`RUN ${name}\n${body}`);
    if (fixture.mode === 'batch') {
      await client.until((frame) => frame.startsWith('DONE completed') || frame.startsWith('ERROR'), BATCH_TIMEOUT_MS);
      for (const line of fixture.expectOutput ?? []) {
        if (!client.logText().includes(line)) throw new Error(`missing output line "${line}"`);
      }
      return;
    }
    await client.until((frame) => frame === 'READY' || frame.startsWith('ERROR'), STEP_TIMEOUT_MS)
      .then((frame) => { if (frame.startsWith('ERROR')) throw new Error(frame.replace('\n', ': ')); });
    for (const step of fixture.steps ?? []) await playStep(client, step);
  } finally {
    client.close();
  }
}

const results = [];
for (const fixture of scenarios.fixtures) {
  for (const language of Object.keys(fixture.files)) {
    let outcome = 'PASS';
    try {
      await runFixture(fixture, language);
    } catch (error) {
      outcome = `FAIL  ${error instanceof Error ? error.message : error}`;
    }
    results.push({ id: fixture.id, language, outcome });
    console.log(`${fixture.id.padEnd(14)} ${language.padEnd(8)} ${outcome}`);
  }
}

const failed = results.filter((r) => r.outcome !== 'PASS').length;
console.log(`\n${results.length - failed}/${results.length} passed against ${url}`);
process.exit(failed === 0 ? 0 : 1);
