// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { closedSocketLogLine, crashLogLine } from './clientConnection.js';

describe('the crash log line', () => {
  test('is an ERROR naming the simulator, how it crashed and whose run it was', () => {
    assert.equal(
      crashLogLine('198.51.100.7', 'GHDL crashed on SIGSEGV: Segmentation fault'),
      'hdl-board: ERROR crash: GHDL crashed on SIGSEGV: Segmentation fault, run by 198.51.100.7',
    );
  });
});

describe('the closed-WebSocket log line', () => {
  test('names the client address and why it was closed', () => {
    assert.equal(
      closedSocketLogLine('203.0.113.5', 'message rate limit'),
      'hdl-board: closed WebSocket from 203.0.113.5: message rate limit',
    );
  });
});
