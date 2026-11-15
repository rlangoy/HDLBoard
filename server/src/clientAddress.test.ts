// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { IncomingMessage } from 'node:http';
import { UNKNOWN_ADDRESS, clientAddress, loggedAddress } from './clientAddress.js';

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

describe('loggedAddress', () => {
  test('behind a proxy on the same machine, names the address the proxy was reached from', () => {
    assert.equal(loggedAddress(request('10.0.0.7, 203.0.113.9', '127.0.0.1')), '127.0.0.1 (forwarded for 203.0.113.9)');
  });

  test("skips the loopback hop a proxy in the same container adds: Render's `<student>, ::1`", () => {
    assert.equal(loggedAddress(request('51.174.146.223, ::1', '127.0.0.1')), '127.0.0.1 (forwarded for 51.174.146.223)');
  });

  test('a made-up entry the client sent sits left of the real one and is not shown', () => {
    assert.equal(loggedAddress(request('203.0.113.99,51.174.146.223, ::1', '127.0.0.1')), '127.0.0.1 (forwarded for 51.174.146.223)');
  });

  for (const hop of ['0:0:0:0:0:0:0:1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:0001', '127.0.0.2']) {
    test(`skips the loopback hop ${hop}`, () => {
      assert.equal(loggedAddress(request(`198.51.100.7, ${hop}`, '127.0.0.1')), '127.0.0.1 (forwarded for 198.51.100.7)');
    });
  }

  test('a mapped client address is not loopback', () => {
    assert.equal(loggedAddress(request('::ffff:198.51.100.7, ::1', '127.0.0.1')), '127.0.0.1 (forwarded for ::ffff:198.51.100.7)');
  });

  test('the address alone when every entry is this machine', () => {
    assert.equal(loggedAddress(request('::1, 127.0.0.1', '127.0.0.1')), '127.0.0.1');
  });

  test("with Render's two proxies trusted, the student, not an entry the client made up", () => {
    assert.equal(clientAddress(request('203.0.113.99,51.174.146.223, ::1', '127.0.0.1'), 2), '51.174.146.223');
  });

  test('the address alone without the header', () => {
    assert.equal(loggedAddress(request(undefined, '192.168.1.20')), '192.168.1.20');
  });

  test('a forwarded entry that is no address is left out, so the log cannot be written into', () => {
    assert.equal(loggedAddress(request('203.0.113.9\nhdl-board: fake','127.0.0.1')), '127.0.0.1');
  });

  test('with trusted proxies, the trusted address alone: it already is the forwarded one', () => {
    assert.equal(loggedAddress(request('10.0.0.7, 203.0.113.9', '172.18.0.3'), 1), '203.0.113.9');
  });
});
