// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { startTestBackend, type TestBackend } from './testBackend.js';
import { WsTestClient } from './WsTestClient.js';

const SHORT_TIMEOUT_MS = 150;

describe('the test backend and its client', () => {
  let backend: TestBackend;
  const clients: WsTestClient[] = [];

  async function newClient(): Promise<WsTestClient> {
    const client = await WsTestClient.connect(backend.port);
    clients.push(client);
    return client;
  }

  before(async () => {
    backend = await startTestBackend();
  });

  after(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await backend.stop();
  });

  test('answers HELLO with WELCOME', async () => {
    const client = await newClient();
    await client.hello();
    assert.ok(client.frames.some((frame) => frame.verb === 'WELCOME'));
  });

  test('answers PING with PONG', async () => {
    const client = await newClient();
    client.send('PING');
    assert.equal((await client.until((frame) => frame.verb === 'PONG')).verb, 'PONG');
  });

  test('reports a protocol error when RUN arrives before HELLO', async () => {
    const client = await newClient();
    client.run([{ name: 'a.v', content: '' }], 'a.v');
    const frame = await client.until((f) => f.verb === 'ERROR');
    assert.equal(frame.verb === 'ERROR' && frame.stage, 'protocol');
  });

  test('fails with the frames it did see when the awaited frame never comes', async () => {
    const client = await newClient();
    await client.hello();
    await assert.rejects(client.until((frame) => frame.verb === 'READY', SHORT_TIMEOUT_MS), /WELCOME/);
  });

  test('does not return the same frame twice to consecutive waits', async () => {
    const client = await newClient();
    await client.hello();
    client.send('PING');
    await client.until((frame) => frame.verb === 'PONG');
    await assert.rejects(client.until((frame) => frame.verb === 'PONG', SHORT_TIMEOUT_MS));
  });
});
