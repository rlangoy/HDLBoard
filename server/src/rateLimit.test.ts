// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { TokenBucket, UpgradeLimiter } from './rateLimit.js';

/** A clock tests move by hand, in ms. */
function manualClock() {
  const clock = { at: 0, now: () => clock.at };
  return clock;
}

describe('TokenBucket', () => {
  test('gives up to its capacity at once', () => {
    const bucket = TokenBucket.perSecond(2, 4, () => 0);
    assert.equal(bucket.take(4), true);
  });

  test('refuses once it is empty', () => {
    const bucket = TokenBucket.perSecond(2, 4, () => 0);
    bucket.take(4);
    assert.equal(bucket.take(), false);
  });

  test('refills at its rate', () => {
    const clock = manualClock();
    const bucket = TokenBucket.perSecond(2, 4, clock.now);
    bucket.take(4);
    clock.at = 500;
    assert.equal(bucket.take(), true);
  });

  test('refills no further than its capacity', () => {
    const clock = manualClock();
    const bucket = TokenBucket.perSecond(2, 4, clock.now);
    bucket.take(4);
    clock.at = 100_000;
    assert.equal(bucket.take(5), false);
  });

  test('a per-minute rate refills a token a minute', () => {
    const clock = manualClock();
    const bucket = TokenBucket.perMinute(1, 1, clock.now);
    bucket.take();
    clock.at = 60_000;
    assert.equal(bucket.take(), true);
  });

  test('a clock going back mints no tokens', () => {
    const clock = manualClock();
    clock.at = 1000;
    const bucket = TokenBucket.perSecond(1, 1, clock.now);
    bucket.take();
    clock.at = 0;
    bucket.take();
    clock.at = 1000;
    assert.equal(bucket.take(), false);
  });
});

describe('UpgradeLimiter', () => {
  test('allows an address its budget', () => {
    const limiter = new UpgradeLimiter({ perMinute: 2, now: () => 0 });
    limiter.take('a');
    assert.equal(limiter.take('a'), true);
  });

  test('refuses an address over its budget', () => {
    const limiter = new UpgradeLimiter({ perMinute: 2, now: () => 0 });
    limiter.take('a');
    limiter.take('a');
    assert.equal(limiter.take('a'), false);
  });

  test("one address's budget is not another's", () => {
    const limiter = new UpgradeLimiter({ perMinute: 1, now: () => 0 });
    limiter.take('a');
    assert.equal(limiter.take('b'), true);
  });

  test('a new address is allowed when the table is full', () => {
    const limiter = new UpgradeLimiter({ perMinute: 1, maxAddresses: 2, now: () => 0 });
    limiter.take('a');
    limiter.take('b');
    assert.equal(limiter.take('c'), true);
  });

  test('a full table forgets the address seen longest ago, which starts again with a full budget', () => {
    const limiter = new UpgradeLimiter({ perMinute: 1, maxAddresses: 2, now: () => 0 });
    limiter.take('a');
    limiter.take('b');
    limiter.take('c');
    assert.equal(limiter.take('a'), true);
  });

  test('an address seen again is remembered over one seen less recently', () => {
    const limiter = new UpgradeLimiter({ perMinute: 1, maxAddresses: 2, now: () => 0 });
    limiter.take('a');
    limiter.take('b');
    limiter.take('a');
    limiter.take('c');
    assert.equal(limiter.take('a'), false);
  });
});
