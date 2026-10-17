// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Plain-language explanations: what a `std_logic` value means and its most likely cause
 * in a beginner's design (FR-23, S5), and why a signal is listed without a trace
 * (FR-11). The viewer explains values, never designs (§ 9.3). Pure.
 */

import type { UnavailableReason } from './model';

const VALUE_HELP: Readonly<Record<string, string>> = {
  U: 'U – not initialised: this signal has never been given a value. Give it a reset value or an initial value.',
  X: 'X – unknown: two drivers fight over this signal, or it was computed from a value that is not known yet (often a U).',
  Z: 'Z – high impedance: nothing drives this signal. Check that it is assigned, or connected to a port that drives it.',
  W: 'W – weak unknown: two weak drivers (L and H) disagree.',
  L: 'L – weak 0: a pull-down; reads as 0.',
  H: 'H – weak 1: a pull-up; reads as 1.',
  '-': "- – don't care: the design says the value does not matter here.",
};

/** The explanation for a value that is a single special letter, or the first special letter of a vector. */
export function valueHelp(value: string): string | undefined {
  if (VALUE_HELP[value] !== undefined) return VALUE_HELP[value];
  for (const letter of ['U', 'X', 'Z', 'W']) {
    if (value.length > 1 && value.includes(letter)) return `Some bits are ${letter}. ${VALUE_HELP[letter]}`;
  }
  return undefined;
}

const UNAVAILABLE_HELP: Readonly<Record<UnavailableReason, string>> = {
  'vcd-type': 'This signal is an enumeration, a record or a character, which this waveform format cannot record.',
  memory: 'Memories are not recorded. Show one word by copying it to a wire in your testbench.',
};

export function unavailableHelp(reason: UnavailableReason): string {
  return UNAVAILABLE_HELP[reason];
}
