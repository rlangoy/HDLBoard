// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The bounce model's acceptance checks (button physics spec § 8). */

import { describe, expect, test } from 'vitest';
import { bounceTrain, DEFAULT_BOUNCE, seededRandom, settleTimeUs, type BounceProfile, type RandomInteger } from './bounce';

const { press } = DEFAULT_BOUNCE;

/** A "random" source that gives these numbers in turn: the pair count, then each interval. */
function scripted(...values: number[]): RandomInteger {
  let next = 0;
  return () => values[next++];
}

const offsets = (events: readonly { atUs: number }[]) => events.map((event) => event.atUs);
const levels = (events: readonly { level: number }[]) => events.map((event) => event.level);

describe('bounceTrain', () => {
  test('zero bounce pairs: the target level at once, and nothing after', () => {
    expect(bounceTrain(0, press, scripted(0))).toEqual([{ atUs: 0, level: 0 }]);
  });

  test('two bounce pairs: five events, ending at the target', () => {
    const events = bounceTrain(0, press, scripted(2, 100, 100, 100, 100));
    expect(levels(events)).toEqual([0, 1, 0, 1, 0]);
  });

  test('intervals of 200, 80, 120 and 40 us give the spec example press', () => {
    const events = bounceTrain(0, press, scripted(2, 200, 80, 120, 40));
    expect(offsets(events)).toEqual([0, 200, 280, 400, 440]);
    expect(settleTimeUs(events)).toBe(440);
  });

  test('an active-low release starts and ends high', () => {
    const events = bounceTrain(1, DEFAULT_BOUNCE.release, scripted(1, 100, 60));
    expect(events).toEqual([
      { atUs: 0, level: 1 },
      { atUs: 100, level: 0 },
      { atUs: 160, level: 1 },
    ]);
  });

  test('with real randomness: offsets always rise, within the profile, and the train ends at the target', () => {
    const random = seededRandom(1);
    for (let operation = 0; operation < 500; operation++) {
      const events = bounceTrain(0, press, random);
      const gaps = events.slice(1).map((event, i) => event.atUs - events[i].atUs);
      expect(gaps.every((gap) => gap >= press.minIntervalUs && gap <= press.maxIntervalUs)).toBe(true);
      expect((events.length - 1) / 2).toBeLessThanOrEqual(press.maxBouncePairs);
      expect(events[events.length - 1].level).toBe(0);
      expect(settleTimeUs(events)).toBeLessThanOrEqual(2 * press.maxBouncePairs * press.maxIntervalUs);
    }
  });

  test('every pair count from 0 to 4 happens, each about one time in five', () => {
    const random = seededRandom(7);
    const counts = [0, 0, 0, 0, 0];
    const operations = 5000;
    for (let i = 0; i < operations; i++) counts[(bounceTrain(0, press, random).length - 1) / 2]++;
    for (const count of counts) expect(count / operations).toBeGreaterThan(0.17);
  });

  test('a profile can be clean: no pairs, never a bounce', () => {
    const clean: BounceProfile = { ...press, minBouncePairs: 0, maxBouncePairs: 0 };
    expect(bounceTrain(1, clean, seededRandom(3))).toEqual([{ atUs: 0, level: 1 }]);
  });
});

describe('seededRandom', () => {
  test('the same seed gives the same numbers: a run can be repeated', () => {
    const a = seededRandom(12345);
    const b = seededRandom(12345);
    const draw = (random: RandomInteger) => Array.from({ length: 20 }, () => random(20, 500));
    expect(draw(a)).toEqual(draw(b));
  });

  test('another seed gives other numbers', () => {
    expect(seededRandom(1)(0, 1_000_000)).not.toBe(seededRandom(2)(0, 1_000_000));
  });

  test('stays within its bounds, both included', () => {
    const random = seededRandom(99);
    const seen = new Set(Array.from({ length: 2000 }, () => random(0, 4)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
