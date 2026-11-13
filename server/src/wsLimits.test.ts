// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_BINARY_FRAME_BYTES, MAX_CLIENT_FRAME_BYTES } from './frameLimits.js';
import { MessageBudget, readWsLimits } from './wsLimits.js';

const DEFAULTS = readWsLimits({}, {});

describe('readWsLimits', () => {
  test('reads a limit from its HDL_WS_* setting', () => {
    assert.equal(readWsLimits({}, { HDL_WS_MESSAGES_PER_SECOND: '300' }).messagesPerSecond, 300);
  });

  test('an override from code wins over the setting', () => {
    assert.equal(readWsLimits({ messagesPerSecond: 5 }, { HDL_WS_MESSAGES_PER_SECOND: '300' }).messagesPerSecond, 5);
  });

  for (const raw of ['0', '-1', 'Infinity', '1e3', 'oops']) {
    test(`a setting of ${raw} cannot turn a limit off: the default`, (t) => {
      t.mock.method(console, 'warn', () => {});
      assert.equal(readWsLimits({}, { HDL_WS_MESSAGES_PER_SECOND: raw }).messagesPerSecond, 200);
    });
  }

  test('an output cap smaller than one waveform frame falls back to the default', (t) => {
    t.mock.method(console, 'warn', () => {});
    const tooSmall = String(MAX_BINARY_FRAME_BYTES);
    assert.equal(readWsLimits({}, { HDL_WS_OUTGOING_BYTES: tooSmall }).outgoingBytes, DEFAULTS.outgoingBytes);
  });

  test('a byte rate below one largest RUN a second falls back to the default', (t) => {
    t.mock.method(console, 'warn', () => {});
    const tooSmall = String(MAX_CLIENT_FRAME_BYTES - 1);
    assert.equal(readWsLimits({}, { HDL_WS_BYTES_PER_SECOND: tooSmall }).bytesPerSecond, DEFAULTS.bytesPerSecond);
  });
});

describe('MessageBudget', () => {
  test('takes two RUNs of the largest size at once', () => {
    const budget = new MessageBudget(DEFAULTS, () => 0);
    budget.takeMessage(MAX_CLIENT_FRAME_BYTES);
    assert.equal(budget.takeMessage(MAX_CLIENT_FRAME_BYTES), true);
  });

  test('refuses a byte more after them', () => {
    const budget = new MessageBudget(DEFAULTS, () => 0);
    budget.takeMessage(MAX_CLIENT_FRAME_BYTES);
    budget.takeMessage(MAX_CLIENT_FRAME_BYTES);
    assert.equal(budget.takeMessage(1), false);
  });

  test('counts frames apart from bytes: two seconds of them at once', () => {
    const budget = new MessageBudget({ ...DEFAULTS, messagesPerSecond: 1 }, () => 0);
    budget.takeMessage(1);
    budget.takeMessage(1);
    assert.equal(budget.takeMessage(1), false);
  });

  test('takes five RUN or RESET requests at once', () => {
    const budget = new MessageBudget(DEFAULTS, () => 0);
    for (let i = 0; i < 4; i++) budget.takeWork();
    assert.equal(budget.takeWork(), true);
  });

  test('refuses a sixth', () => {
    const budget = new MessageBudget(DEFAULTS, () => 0);
    for (let i = 0; i < 5; i++) budget.takeWork();
    assert.equal(budget.takeWork(), false);
  });

  test('takes five waveform downloads at once', () => {
    const budget = new MessageBudget(DEFAULTS, () => 0);
    for (let i = 0; i < 4; i++) budget.takeDownload();
    assert.equal(budget.takeDownload(), true);
  });

  test('refuses a sixth download', () => {
    const budget = new MessageBudget(DEFAULTS, () => 0);
    for (let i = 0; i < 5; i++) budget.takeDownload();
    assert.equal(budget.takeDownload(), false);
  });

  test('downloads do not spend the RUN and RESET budget', () => {
    const budget = new MessageBudget(DEFAULTS, () => 0);
    for (let i = 0; i < 5; i++) budget.takeDownload();
    assert.equal(budget.takeWork(), true);
  });

  test('takes no more at once than the work limit, when that is below five', () => {
    const budget = new MessageBudget({ ...DEFAULTS, workPerMinute: 2 }, () => 0);
    budget.takeWork();
    budget.takeWork();
    assert.equal(budget.takeWork(), false);
  });
});
