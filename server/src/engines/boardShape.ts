// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a board's shape decides on the backend (docs/board_io_v2_spec.md D5, § 6.2):
 * the bit layout of `STIM` and `STATE`. `stimFields` and `stateFields` are THE layout;
 * the session's length check and both testbench generators read them. The backend's
 * copy of the frontend's src/boards/boardShape.ts — both test the same lengths.
 */

import { SEGMENT_COUNT, SEGMENT_COUNT_WITH_POINT } from './boardLimits.js';
import type { BoardIo, PortGroup } from './boardPorts.js';

export function groupWidth(group: PortGroup): number {
  return group.kind === 'vector' ? group.count : group.ports.length;
}

export function buttonCount(board: BoardIo): number {
  return groupWidth(board.pushbuttons.group);
}

export function displayCount(board: BoardIo): number {
  const displays = board.sevenSegment;
  return displays.kind === 'independent' ? displays.ports.length : displays.digits;
}

export function hasDecimalPoint(board: BoardIo): boolean {
  const displays = board.sevenSegment;
  return displays.kind === 'independent' ? displays.width === SEGMENT_COUNT_WITH_POINT : displays.decimalPoint !== undefined;
}

/** Bits per display word: 8 with a decimal point (bit 7), else 7. */
export function displayWordWidth(board: BoardIo): number {
  return hasDecimalPoint(board) ? SEGMENT_COUNT_WITH_POINT : SEGMENT_COUNT;
}

/** One field of `STIM`: what it sets, the testbench signal, and how many bits. */
export interface StimField {
  readonly role: 'switches' | 'buttons' | 'reset';
  readonly signal: string;
  readonly width: number;
}

/** `STIM`: switches, buttons, then the reset button when there is one; each field bit N−1 first. */
export function stimFields(board: BoardIo): StimField[] {
  const fields: StimField[] = [
    { role: 'switches', signal: 'sw_sig', width: board.switches.count },
    { role: 'buttons', signal: 'key_sig', width: buttonCount(board) },
  ];
  return board.resetButton === undefined ? fields : [...fields, { role: 'reset', signal: 'rstbtn_sig', width: 1 }];
}

/** One field of `STATE`: the LEDs, or display `index`. */
export type StateField =
  | { readonly role: 'leds'; readonly width: number }
  | { readonly role: 'display'; readonly index: number; readonly width: number };

/** `STATE`: the LEDs, then display 0 … D−1; each field bit W−1 first. */
export function stateFields(board: BoardIo): StateField[] {
  const width = displayWordWidth(board);
  const displays = Array.from({ length: displayCount(board) }, (_, index): StateField => ({ role: 'display', index, width }));
  return [{ role: 'leds', width: board.leds.count }, ...displays];
}

const totalWidth = (fields: readonly { width: number }[]): number => fields.reduce((sum, field) => sum + field.width, 0);

export const stimLength = (board: BoardIo): number => totalWidth(stimFields(board));
export const stateLength = (board: BoardIo): number => totalWidth(stateFields(board));

/** `switches 16 + buttons 5`: what a `STIM` of this board is made of, for the length error. */
export function describeStimFields(board: BoardIo): string {
  return stimFields(board)
    .map((field) => `${field.role} ${field.width}`)
    .join(' + ');
}
