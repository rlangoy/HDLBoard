// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { builtInBoard } from '../../boards/boardCatalog';
import { encodeStim, restInputs, type BoardInputs } from '../../boards/boardShape';
import type { RandomInteger } from '../Pushbuttons/bounce';
import { bouncingStims, createButtonRandoms, type ButtonRandoms } from './bouncyButtons';

const { ports } = builtInBoard('de1-soc');
const RELEASED = restInputs(ports);
const withKey = (inputs: BoardInputs, index: number, level: 0 | 1): BoardInputs => {
  const buttons = [...inputs.buttons];
  buttons[index] = level;
  return { ...inputs, buttons };
};
const KEY0_PRESSED = withKey(RELEASED, 0, 0);
const stim = (inputs: BoardInputs) => encodeStim(ports, inputs);

/** Every button draws these numbers in turn: the pair count, then each interval. */
function scriptedRandoms(...values: number[]): ButtonRandoms {
  let next = 0;
  const random: RandomInteger = () => values[next++];
  return { forButton: () => random, reset: () => {} };
}

describe('bouncingStims', () => {
  test('a press of KEY0 that bounces twice: five steps, each held its interval in ns, the last for good', () => {
    const steps = bouncingStims(ports, { before: RELEASED, after: KEY0_PRESSED }, scriptedRandoms(2, 200, 80, 120, 40));
    expect(steps).toEqual([
      { bits: stim(KEY0_PRESSED), holdNs: 200_000 },
      { bits: stim(RELEASED), holdNs: 80_000 },
      { bits: stim(KEY0_PRESSED), holdNs: 120_000 },
      { bits: stim(RELEASED), holdNs: 40_000 },
      { bits: stim(KEY0_PRESSED) },
    ]);
  });

  test('a release bounces too, and ends released', () => {
    const steps = bouncingStims(ports, { before: KEY0_PRESSED, after: RELEASED }, scriptedRandoms(1, 100, 60));
    expect(steps.map((step) => step.bits)).toEqual([stim(RELEASED), stim(KEY0_PRESSED), stim(RELEASED)]);
  });

  test('a clean operation is one step, as without bounce', () => {
    expect(bouncingStims(ports, { before: RELEASED, after: KEY0_PRESSED }, scriptedRandoms(0))).toEqual([{ bits: stim(KEY0_PRESSED) }]);
  });

  test('a switch flip never bounces', () => {
    const after = { ...RELEASED, switches: RELEASED.switches.map(() => 1 as const) };
    expect(bouncingStims(ports, { before: RELEASED, after }, scriptedRandoms(4))).toEqual([{ bits: stim(after) }]);
  });

  test('only the button that changed bounces; a held one stays down throughout', () => {
    const key1Held = withKey(RELEASED, 1, 0);
    const steps = bouncingStims(ports, { before: key1Held, after: withKey(key1Held, 0, 0) }, scriptedRandoms(1, 50, 50));
    expect(steps.map((step) => step.bits)).toEqual([stim(withKey(key1Held, 0, 0)), stim(key1Held), stim(withKey(key1Held, 0, 0))]);
  });

  test('a new run repeats the same bounces for the same presses', () => {
    const randoms = createButtonRandoms();
    const presses = () => Array.from({ length: 5 }, () => bouncingStims(ports, { before: RELEASED, after: KEY0_PRESSED }, randoms));
    const firstRun = presses();
    randoms.reset();
    expect(presses()).toEqual(firstRun);
  });

  test('each button has its own generator, kept from press to press', () => {
    const randoms = createButtonRandoms();
    expect(randoms.forButton(0)).toBe(randoms.forButton(0));
    expect(randoms.forButton(0)).not.toBe(randoms.forButton(1));
  });

  test('most presses bounce: a falling-edge counter would often count more than one', () => {
    const randoms = createButtonRandoms();
    const fallingEdges = Array.from({ length: 200 }, () => bouncingStims(ports, { before: RELEASED, after: KEY0_PRESSED }, randoms))
      .map((steps) => steps.filter((step) => step.bits === stim(KEY0_PRESSED)).length);
    const bounced = fallingEdges.filter((edges) => edges > 1).length;
    expect(bounced / fallingEdges.length).toBeGreaterThan(0.7);
  });
});
