// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_FRAME_HEADER_BYTES } from './frameLimits.js';
import { SocketOutput } from './socketOutput.js';

const OPEN = 1;

/** A SocketOutput over a fake socket whose writes complete only when a test says so. */
function fixture(outgoingBytes = 100, sendTimeoutMs = 1000) {
  const callbacks: ((error?: Error) => void)[] = [];
  const sent: (string | Buffer)[] = [];
  const pongs: Buffer[] = [];
  const failures: string[] = [];
  const socket = {
    readyState: OPEN,
    bufferedAmount: 0,
    send(data: string | Buffer, _options: { binary: boolean }, callback: (error?: Error) => void) {
      sent.push(data);
      callbacks.push(callback);
    },
    pong(data: Buffer) {
      pongs.push(data);
    },
  };
  const output = new SocketOutput({
    socket,
    limits: { outgoingBytes, sendTimeoutMs },
    onFailure: (reason) => failures.push(reason),
  });
  const completeNextWrite = (error?: Error) => callbacks.shift()?.(error);
  return { output, socket, sent, pongs, failures, completeNextWrite };
}

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SocketOutput', () => {
  test('sends a text frame', () => {
    const f = fixture();
    f.output.send('ok');
    assert.deepEqual(f.sent, ['ok']);
  });

  test('counts what is queued, the UTF-8 bytes and the frame header against the cap', () => {
    const f = fixture(MAX_FRAME_HEADER_BYTES + 6);
    f.socket.bufferedAmount = 5;
    f.output.send('é');
    assert.deepEqual(f.failures, ['outgoing buffer limit']);
  });

  test('sends nothing over the cap', () => {
    const f = fixture(MAX_FRAME_HEADER_BYTES + 6);
    f.socket.bufferedAmount = 5;
    f.output.send('é');
    assert.equal(f.sent.length, 0);
  });

  test('a binary send waits for its write', async () => {
    const f = fixture();
    let written = false;
    void f.output.sendBinary(Buffer.from('wave')).then(() => (written = true));
    await waitMs(1);
    assert.equal(written, false);
  });

  test('a binary send resolves once written', async () => {
    const f = fixture();
    const pending = f.output.sendBinary(Buffer.from('wave'));
    f.completeNextWrite();
    await pending;
    assert.equal(f.failures.length, 0);
  });

  test('a stalled write fails the output once', async () => {
    const f = fixture(100, 10);
    f.output.send('ok');
    await waitMs(30);
    assert.deepEqual(f.failures, ['send stalled']);
  });

  test('after a failure, nothing more is sent', async () => {
    const f = fixture(100, 10);
    f.output.send('ok');
    await waitMs(30);
    f.output.send('ignored');
    assert.equal(f.sent.length, 1);
  });

  test('a failed write fails the output', () => {
    const f = fixture();
    f.output.send('ok');
    f.completeNextWrite(new Error('connection lost'));
    assert.deepEqual(f.failures, ['send failed']);
  });

  test('disposing stops the stall timer', async () => {
    const f = fixture(100, 10);
    f.output.send('ok');
    f.output.dispose();
    await waitMs(30);
    assert.equal(f.failures.length, 0);
  });

  test('disposing releases a binary send still waiting for its write', async () => {
    const f = fixture();
    const pending = f.output.sendBinary(Buffer.from('wave'));
    f.output.dispose();
    await pending;
    assert.equal(f.failures.length, 0);
  });

  test("answers a ping's data", () => {
    const f = fixture();
    f.output.pong(Buffer.from('ping'));
    assert.deepEqual(f.pongs, [Buffer.from('ping')]);
  });

  test('a pong over the cap fails the output', () => {
    const f = fixture(MAX_FRAME_HEADER_BYTES + 3);
    f.output.pong(Buffer.from('ping'));
    assert.deepEqual(f.failures, ['outgoing buffer limit']);
  });
});
