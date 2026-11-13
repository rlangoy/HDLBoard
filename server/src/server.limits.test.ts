// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The WebSocket abuse limits (wsLimits.ts) over real connections to the backend. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { WebSocket } from 'ws';
import type { BackendOptions } from './server.js';
import { startTestBackend } from './testSupport/testBackend.js';

const TIMEOUT = { timeout: 5000 };
/** RFC 6455's "Policy Violation", what a client over its message budget is closed with. */
const POLICY_VIOLATION = 1008;
/** What `ws` reports for a socket cut without a close frame. */
const ABNORMAL_CLOSURE = 1006;

interface Opener {
  /** Opens `/hdlsim`; `forwardedFor` is the X-Forwarded-For header, `origin` the page's. */
  (options?: { forwardedFor?: string; origin?: string }): Promise<WebSocket>;
}

/** Runs `check` against a backend started with `options`, then closes everything. */
async function withBackend(options: Omit<BackendOptions, 'port'>, check: (open: Opener) => Promise<void>): Promise<void> {
  const backend = await startTestBackend({ now: () => 1_000_000, ...options });
  const sockets: WebSocket[] = [];
  const open: Opener = ({ forwardedFor = '198.51.100.1', origin } = {}) =>
    new Promise((resolve, reject) => {
      const headers = { 'X-Forwarded-For': forwardedFor };
      const ws = new WebSocket(`ws://127.0.0.1:${backend.port}/hdlsim`, { headers, ...(origin ? { origin } : {}) });
      sockets.push(ws);
      ws.once('open', () => resolve(ws));
      ws.on('error', reject);
    });
  try {
    await check(open);
  } finally {
    for (const ws of sockets) ws.terminate();
    await backend.stop();
  }
}

const closeCode = (ws: WebSocket) => new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));

/** The next text frame that starts with `prefix`. */
const frameStarting = (ws: WebSocket, prefix: string) =>
  new Promise<string>((resolve) => {
    const onMessage = (data: unknown) => {
      const text = String(data);
      if (!text.startsWith(prefix)) return;
      ws.off('message', onMessage);
      resolve(text);
    };
    ws.on('message', onMessage);
  });

/** Whether `ws` still answers PING, as a connection that kept its place does. */
async function answers(ws: WebSocket): Promise<boolean> {
  const pong = frameStarting(ws, 'PONG');
  ws.send('PING');
  return (await pong) === 'PONG';
}

describe('upgrade limits', () => {
  test('an address over its budget gets HTTP 429', TIMEOUT, () =>
    withBackend({ wsLimits: { upgradesPerMinute: 1 } }, async (open) => {
      await open();
      await assert.rejects(open(), /429/);
    }));

  test('with no trusted proxy, a forged X-Forwarded-For buys no new budget', TIMEOUT, () =>
    withBackend({ wsLimits: { upgradesPerMinute: 1 } }, async (open) => {
      await open({ forwardedFor: '198.51.100.1' });
      await assert.rejects(open({ forwardedFor: '203.0.113.1' }), /429/);
    }));

  test('behind a trusted proxy, each student has a budget of their own', TIMEOUT, () =>
    withBackend({ trustedProxies: 1, wsLimits: { upgradesPerMinute: 1 } }, async (open) => {
      await open({ forwardedFor: '198.51.100.1' });
      const other = await open({ forwardedFor: '203.0.113.1' });
      assert.equal(other.readyState, WebSocket.OPEN);
    }));

  // Another site in one student's browser must not use up the budget of their whole school.
  test("another site's refused upgrades spend no budget", TIMEOUT, () =>
    withBackend({ wsLimits: { upgradesPerMinute: 1 } }, async (open) => {
      await open({ origin: 'https://evil.example' }).catch(() => undefined);
      const own = await open();
      assert.equal(own.readyState, WebSocket.OPEN);
    }));
});

describe('message limits', () => {
  test('a flood of frames is closed as a policy violation', TIMEOUT, () =>
    withBackend({ wsLimits: { messagesPerSecond: 1 } }, async (open) => {
      const ws = await open();
      const code = closeCode(ws);
      for (let i = 0; i < 3; i++) ws.send('PING');
      assert.equal(await code, POLICY_VIOLATION);
    }));

  test("one connection's flood leaves another usable", TIMEOUT, () =>
    withBackend({ wsLimits: { messagesPerSecond: 1 } }, async (open) => {
      const offender = await open();
      const healthy = await open();
      const offenderClosed = closeCode(offender);
      for (let i = 0; i < 3; i++) offender.send('PING');
      await offenderClosed;
      assert.equal(await answers(healthy), true);
    }));

  test('pings count against the same budget', TIMEOUT, () =>
    withBackend({ wsLimits: { messagesPerSecond: 1 } }, async (open) => {
      const ws = await open();
      const code = closeCode(ws);
      for (let i = 0; i < 3; i++) ws.ping('ping');
      assert.equal(await code, POLICY_VIOLATION);
    }));

  test('large frames hit the byte budget below the frame count', TIMEOUT, () =>
    withBackend({ wsLimits: { bytesPerSecond: 16 } }, async (open) => {
      const ws = await open();
      const code = closeCode(ws);
      ws.send('PING ' + 'x'.repeat(40));
      assert.equal(await code, POLICY_VIOLATION);
    }));
});

describe('work limits', () => {
  test('a RUN over the budget is refused with ERROR busy, which ends the run', TIMEOUT, () =>
    withBackend({ wsLimits: { workPerMinute: 1 } }, async (open) => {
      const ws = await open();
      ws.send('HELLO 6');
      ws.send('RESET');
      const busy = frameStarting(ws, 'ERROR busy');
      ws.send('RUN top.vhd\n@@FILE top.vhd@@\n');
      assert.match(await busy, /Too many runs/);
    }));

  test('a RESET over the budget is refused, and the connection stays', TIMEOUT, () =>
    withBackend({ wsLimits: { workPerMinute: 1 } }, async (open) => {
      const ws = await open();
      ws.send('RESET');
      const refused = frameStarting(ws, 'ERROR protocol');
      ws.send('RESET');
      await refused;
      assert.equal(await answers(ws), true);
    }));

  test('WAVE-GET costs no work: the page asks for each waveform it shows', TIMEOUT, () =>
    withBackend({ wsLimits: { workPerMinute: 1 } }, async (open) => {
      const ws = await open();
      for (let i = 0; i < 3; i++) ws.send('WAVE-GET 1');
      assert.equal(await answers(ws), true);
    }));
});

describe('output limits', () => {
  test('output over the cap cuts the socket', TIMEOUT, () =>
    withBackend({ wsLimits: { outgoingBytes: 64 } }, async (open) => {
      const ws = await open();
      const code = closeCode(ws);
      ws.send('x'.repeat(100));
      assert.equal(await code, ABNORMAL_CLOSURE);
    }));

  test('a socket cut for its output gives its place to the next student', TIMEOUT, () =>
    withBackend({ maxSessions: 1, replaceAfterMinutes: 0, wsLimits: { outgoingBytes: 64 } }, async (open) => {
      const offender = await open();
      const closed = closeCode(offender);
      offender.send('x'.repeat(100));
      await closed;
      assert.equal(await answers(await open()), true);
    }));
});
