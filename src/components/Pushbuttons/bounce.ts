// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Contact bounce of a mechanical pushbutton, as a train of logic levels.
 *
 * When a button is pressed or released its contacts spring apart and back a few
 * times before they settle, so the input crosses the logic threshold several times
 * (Ganssle, "A Guide to Debouncing"). This is a simplified teaching model, not
 * measurements of one switch: each operation first takes the target level, then
 * bounces away from it and back a random number of times, each interval drawn
 * uniformly; the level then holds until the next operation. Pure.
 */

import type { Bit } from '../board';

/** How one kind of operation (press or release) bounces. Whole microseconds. */
export interface BounceProfile {
  readonly minBouncePairs: number;
  readonly maxBouncePairs: number;
  readonly minIntervalUs: number;
  readonly maxIntervalUs: number;
}

export interface BounceSettings {
  readonly press: BounceProfile;
  readonly release: BounceProfile;
}

/**
 * Synthetic defaults: 0–4 bounces (a clean operation one time in five), each
 * interval 20–500 µs, so an operation settles within 4 ms, 1.04 ms on average.
 * Long enough for a design clocked at 50 MHz to see every bounce; short enough
 * that one sampled every few milliseconds, as a debouncer does, sees none.
 */
const TYPICAL: BounceProfile = { minBouncePairs: 0, maxBouncePairs: 4, minIntervalUs: 20, maxIntervalUs: 500 };
export const DEFAULT_BOUNCE: BounceSettings = { press: TYPICAL, release: TYPICAL };

/** One level change of the train, `atUs` after the operation began. */
export interface BounceEvent {
  readonly atUs: number;
  readonly level: Bit;
}

/** A uniformly distributed integer from `min` to `max`, both included. */
export type RandomInteger = (min: number, max: number) => number;

/** 2^32: turns a 32-bit unsigned state into a number from 0 up to 1. */
const UINT32 = 0x1_0000_0000;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX_A = 61;

/**
 * A seeded generator, Mulberry32: the same seed gives the same numbers in every
 * browser, so a run can be repeated. Keep one per button and advance it; a fresh
 * one per press would repeat the same bounce every time.
 */
export function seededRandom(seed: number): RandomInteger {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> SHIFT_A), t | 1);
    t ^= t + Math.imul(t ^ (t >>> SHIFT_B), t | MIX_A);
    return ((t ^ (t >>> SHIFT_C)) >>> 0) / UINT32;
  };
  return (min, max) => min + Math.floor(next() * (max - min + 1));
}

const opposite = (level: Bit): Bit => (level === 1 ? 0 : 1);

/**
 * The train of one operation: the target level at once, then each bounce away and
 * back after a random interval. The last event is the target level, where the input
 * then stays: there is no automatic return.
 */
export function bounceTrain(target: Bit, profile: BounceProfile, random: RandomInteger): BounceEvent[] {
  const events: BounceEvent[] = [{ atUs: 0, level: target }];
  const pairs = random(profile.minBouncePairs, profile.maxBouncePairs);
  let atUs = 0;
  for (let pair = 0; pair < pairs; pair++) {
    for (const level of [opposite(target), target]) {
      atUs += random(profile.minIntervalUs, profile.maxIntervalUs);
      events.push({ atUs, level });
    }
  }
  return events;
}

/** How long after the operation began the input settles: its last event. */
export function settleTimeUs(events: readonly BounceEvent[]): number {
  return events[events.length - 1]?.atUs ?? 0;
}
