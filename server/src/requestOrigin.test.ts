// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, test } from 'node:test';
import { isLoopbackHost, isSameHost, socketRequestAllowed } from './requestOrigin.js';

const request = (headers: { host?: string; origin?: string }): IncomingMessage => ({ headers }) as IncomingMessage;

describe('who may open a session', () => {
  test("the page's own host, on any port", () => {
    assert.equal(isSameHost('http://localhost:5173', 'localhost:9010'), true);
    assert.equal(isSameHost('https://hdlboard.example', 'hdlboard.example:9010'), true);
  });

  test('not another site, nor an origin that is no URL', () => {
    assert.equal(isSameHost('https://evil.example', '127.0.0.1:9010'), false);
    assert.equal(isSameHost('null', '127.0.0.1:9010'), false);
  });

  test('a client that is no browser sends no Origin, and may', () => {
    assert.equal(socketRequestAllowed(request({ host: '127.0.0.1:9010' }), { loopbackOnly: true }), true);
  });

  test('in desktop mode only on a loopback Host: a site pointing its name at 127.0.0.1 is refused', () => {
    assert.equal(socketRequestAllowed(request({ host: 'evil.example:9010', origin: 'http://evil.example' }), { loopbackOnly: true }), false);
    assert.equal(socketRequestAllowed(request({ host: 'evil.example:9010', origin: 'http://evil.example' }), { loopbackOnly: false }), true);
    for (const host of ['127.0.0.1:9010', 'localhost:9010', '[::1]:9010']) assert.equal(isLoopbackHost(host), true, host);
  });
});
