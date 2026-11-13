// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { IncomingMessage } from 'node:http';
import { UNKNOWN_ADDRESS, clientAddress } from './clientAddress.js';

const request = (forwardedFor: string | undefined, remoteAddress: string | undefined) =>
  ({ headers: { 'x-forwarded-for': forwardedFor }, socket: { remoteAddress } }) as unknown as IncomingMessage;

describe('clientAddress', () => {
  test('ignores X-Forwarded-For when no proxy is trusted: a client could claim any address', () => {
    assert.equal(clientAddress(request('5.32.57.18', '192.168.1.20')), '192.168.1.20');
  });

  test('the entry the one trusted proxy added, whatever the client sent before it', () => {
    assert.equal(clientAddress(request('10.0.0.7, 203.0.113.9', '172.18.0.3'), 1), '203.0.113.9');
  });

  test('the entry the outermost of three trusted proxies added', () => {
    const header = '10.0.0.7, 5.32.57.18, 172.68.192.164, 10.28.109.65';
    assert.equal(clientAddress(request(header, '10.28.0.1'), 3), '5.32.57.18');
  });

  test('the first entry when there are fewer than the trusted proxies', () => {
    assert.equal(clientAddress(request('5.32.57.18', '10.28.0.1'), 3), '5.32.57.18');
  });

  test("the socket's peer when the trusted entry is no address", () => {
    assert.equal(clientAddress(request('victim-ip', '172.18.0.3'), 1), '172.18.0.3');
  });

  test("the socket's peer without the header", () => {
    assert.equal(clientAddress(request(undefined, '192.168.1.20'), 1), '192.168.1.20');
  });

  test("the socket's peer when the header is empty", () => {
    assert.equal(clientAddress(request(' ', '192.168.1.20'), 1), '192.168.1.20');
  });

  test('unknown with neither', () => {
    assert.equal(clientAddress(request(undefined, undefined), 1), UNKNOWN_ADDRESS);
  });
});
