// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { countProcesses, waitForProcessCount } from './processCount.js';

describe('countProcesses', () => {
  test('sees this very process when asked for node', () => {
    assert.ok(countProcesses('node') >= 1);
  });

  test('counts zero for a program that is not running', () => {
    assert.equal(countProcesses('no-such-program-hdlboard'), 0);
  });
});

describe('waitForProcessCount', () => {
  test('resolves at once when the count already satisfies the limit', async () => {
    await waitForProcessCount('no-such-program-hdlboard', 0, 1_000);
  });

  test('rejects, naming the program, when the count stays too high', async () => {
    await assert.rejects(waitForProcessCount('node', 0, 200), /node/);
  });
});
