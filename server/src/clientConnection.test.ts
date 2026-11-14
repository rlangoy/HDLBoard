// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { closedSocketLogLine } from './clientConnection.js';

describe('the closed-WebSocket log line', () => {
  test('names the client address and why it was closed', () => {
    assert.equal(
      closedSocketLogLine('203.0.113.5', 'message rate limit'),
      'hdl-board: closed WebSocket from 203.0.113.5: message rate limit',
    );
  });
});
