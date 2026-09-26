// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createOutputLimiter, LOG_LINES_PER_SECOND } from './outputLimiter.js';

const LIMIT = LOG_LINES_PER_SECOND;

function limiterWithClock() {
  const clock = { ms: 0 };
  return { clock, limiter: createOutputLimiter(() => clock.ms) };
}

const offer = (limiter: ReturnType<typeof createOutputLimiter>, count: number): string[] =>
  Array.from({ length: count }, (_, index) => limiter.accept(`line ${index}`)).flat();

describe('createOutputLimiter', () => {
  test('L-1: forwards every line while the window is under budget', () => {
    const { limiter } = limiterWithClock();
    assert.equal(offer(limiter, 10).length, 10);
  });

  test('L-2: forwards the budget, drops the rest, and summarises them when the window ends', () => {
    const { clock, limiter } = limiterWithClock();
    assert.equal(offer(limiter, 1000).length, LIMIT);
    clock.ms = 1000;
    assert.deepEqual(limiter.flush(), [`… ${1000 - LIMIT} more lines not shown (output limit: ${LIMIT} lines/s)`]);
  });

  test('L-3: a new window after a flood starts with a full budget and nothing carried over', () => {
    const { clock, limiter } = limiterWithClock();
    offer(limiter, 1000);
    clock.ms = 1000;
    const afterFlood = limiter.accept('next');
    assert.equal(afterFlood.length, 2);
    assert.equal(afterFlood[1], 'next');
    assert.equal(offer(limiter, LIMIT - 1).length, LIMIT - 1);
  });

  test('L-4: no line dropped means no summary', () => {
    const { clock, limiter } = limiterWithClock();
    offer(limiter, LIMIT);
    clock.ms = 5000;
    assert.deepEqual(limiter.flush(), []);
  });

  test('says nothing before the window has ended', () => {
    const { clock, limiter } = limiterWithClock();
    offer(limiter, LIMIT + 5);
    clock.ms = 999;
    assert.deepEqual(limiter.flush(), []);
  });

  test('finish reports the dropped lines of a window that has not ended', () => {
    const { limiter } = limiterWithClock();
    offer(limiter, LIMIT + 1);
    assert.deepEqual(limiter.finish(), [`… 1 more line not shown (output limit: ${LIMIT} lines/s)`]);
    assert.deepEqual(limiter.finish(), []);
  });
});
