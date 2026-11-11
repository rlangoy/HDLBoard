// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { IncomingMessage } from 'node:http';
import { UNKNOWN_ADDRESS, clientAddress } from './clientAddress.js';

const request = (forwardedFor: string | undefined, remoteAddress: string | undefined) =>
  ({ headers: { 'x-forwarded-for': forwardedFor }, socket: { remoteAddress } }) as unknown as IncomingMessage;

describe('clientAddress', () => {
  test("the first X-Forwarded-For entry, the student's own", () => {
    assert.equal(clientAddress(request('5.32.57.18, 172.68.192.164, 10.28.109.65', '::1')), '5.32.57.18');
  });

  test("the socket's peer without the header", () => {
    assert.equal(clientAddress(request(undefined, '192.168.1.20')), '192.168.1.20');
  });

  test("the socket's peer when the header is empty", () => {
    assert.equal(clientAddress(request(' ', '192.168.1.20')), '192.168.1.20');
  });

  test('unknown with neither', () => {
    assert.equal(clientAddress(request(undefined, undefined)), UNKNOWN_ADDRESS);
  });
});
