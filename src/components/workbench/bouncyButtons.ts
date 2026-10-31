// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Board pane's "Bouncy" pushbuttons: a press or release becomes the timed `STIM`
 * steps of its contact bounce (Pushbuttons/bounce.ts), which the backend applies
 * exactly that far apart in simulated time (protocol 4). Pure.
 */

import { encodeStim, type BoardInputs } from '../../boards/boardShape';
import type { BoardPorts } from '../../boards/types';
import type { Bit } from '../board';
import { bounceTrain, DEFAULT_BOUNCE, seededRandom, type RandomInteger } from '../Pushbuttons/bounce';
import { releasedLevel } from '../Pushbuttons/levels';

/** One input state to send, and how long it holds before the next (none: the last). */
export interface TimedStim {
  readonly bits: string;
  readonly holdNs?: number;
}

const NS_PER_US = 1000;
/** The seeds of button 0, 1, …: fixed, so the same presses bounce the same way in every run. */
const FIRST_SEED = 12345;
const SEED_STEP = 7919;

/** One random generator per button, kept from press to press, and started afresh for each run. */
export interface ButtonRandoms {
  forButton(index: number): RandomInteger;
  /** A new run: every button starts from its seed again. */
  reset(): void;
}

export function createButtonRandoms(): ButtonRandoms {
  const generators = new Map<number, RandomInteger>();
  return {
    forButton(index) {
      const existing = generators.get(index);
      if (existing) return existing;
      const created = seededRandom(FIRST_SEED + index * SEED_STEP);
      generators.set(index, created);
      return created;
    },
    reset: () => generators.clear(),
  };
}

function withButton(inputs: BoardInputs, index: number, level: Bit): BoardInputs {
  const buttons = [...inputs.buttons];
  buttons[index] = level;
  return { ...inputs, buttons };
}

function changedButtons(before: BoardInputs, after: BoardInputs): number[] {
  return after.buttons.flatMap((level, index) => (level === before.buttons[index] ? [] : [index]));
}

/**
 * The steps that take the board from `before` to `after`: each button that changed
 * bounces on its way to its new level, one after the other; anything else changes
 * at once. Without a changed button, `after` alone.
 */
export function bouncingStims(
  ports: BoardPorts,
  change: { readonly before: BoardInputs; readonly after: BoardInputs },
  randoms: ButtonRandoms,
): TimedStim[] {
  const { before, after } = change;
  const rest = releasedLevel(ports.pushbuttons.activeLow);
  let inputs: BoardInputs = { ...after, buttons: [...before.buttons] };
  const steps: TimedStim[] = [];
  for (const index of changedButtons(before, after)) {
    const target = after.buttons[index];
    const profile = target === rest ? DEFAULT_BOUNCE.release : DEFAULT_BOUNCE.press;
    const events = bounceTrain(target, profile, randoms.forButton(index));
    events.forEach((event, k) => {
      inputs = withButton(inputs, index, event.level);
      const next = events[k + 1];
      steps.push(next ? { bits: encodeStim(ports, inputs), holdNs: (next.atUs - event.atUs) * NS_PER_US } : { bits: encodeStim(ports, inputs) });
    });
  }
  return steps.length > 0 ? steps : [{ bits: encodeStim(ports, after) }];
}
