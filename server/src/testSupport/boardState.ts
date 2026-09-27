// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Comparing a `STATE` frame's board bits with what a scenario expects.
 *
 * Undefined bits (`X`) are read exactly as the frontend reads them
 * (`ghdlClient.ts`'s `parseState`): an undefined LED is off (0) and an undefined
 * segment is off (1, active low). That is what makes a VHDL design that leaves its
 * `HEX` outputs undriven compare equal to its Verilog twin, which blanks them
 * (docs/Verilog_implementation_plan.md § 7.6).
 */

import { STATE_LENGTH } from '../protocol.js';
import { BLANK_DISPLAYS, HEX_BITS, LED_BITS, type ExpectedBoard } from './scenarios.js';

export interface BoardState {
  /** LEDR9..LEDR0, only `0`/`1`. */
  readonly ledr: string;
  /** HEX0..HEX5, seven bits each, only `0`/`1`. */
  readonly hex: string;
}

const UNDEFINED_BIT = /x/gi;
const LED_OFF = '0';
const SEGMENT_OFF = '1';
const BLANK_HEX = SEGMENT_OFF.repeat(HEX_BITS);

export function normalizeState(bits: string): BoardState {
  if (bits.length !== STATE_LENGTH) {
    throw new Error(`a board state is ${STATE_LENGTH} bits, got ${bits.length}`);
  }
  return {
    ledr: bits.slice(0, LED_BITS).replace(UNDEFINED_BIT, LED_OFF),
    hex: bits.slice(LED_BITS).replace(UNDEFINED_BIT, SEGMENT_OFF),
  };
}

/** True when every field the expectation states equals the state's. */
export function matchesExpectation(state: BoardState, expected: ExpectedBoard): boolean {
  const ledrMatches = expected.ledr === undefined || expected.ledr === state.ledr;
  const expectedHex = expected.hex === BLANK_DISPLAYS ? BLANK_HEX : expected.hex;
  const hexMatches = expectedHex === undefined || expectedHex === state.hex;
  return ledrMatches && hexMatches;
}
