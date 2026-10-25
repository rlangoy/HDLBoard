// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a board's shape decides (docs/board_io_v2_spec.md § 4.1): how many parts, and
 * the bit layout of `STIM` and `STATE` (D5). `stimFields` and `stateFields` are THE
 * layout; every length, encoder and decoder here reads them. Pure, and the board is
 * always a parameter.
 *
 * Wire bits are pin levels (D4). Polarity only decides the rest level of an input and
 * which level of an output is "on".
 */

import { bitsToString, fillBits, zeroBits, type Bit, type BitVector } from '../components/board/bits';
import { SEGMENT_COUNT, SEGMENT_COUNT_WITH_POINT } from './boardLimits';
import type { BoardPorts, PortGroup } from './types';

export function groupWidth(group: PortGroup): number {
  return group.kind === 'vector' ? group.count : group.ports.length;
}

/** The names of a group: the vector, or every scalar in group order. */
export function groupNames(group: PortGroup): readonly string[] {
  return group.kind === 'vector' ? [group.port] : group.ports;
}

export function buttonCount(ports: BoardPorts): number {
  return groupWidth(ports.pushbuttons.group);
}

export function displayCount(ports: BoardPorts): number {
  const displays = ports.sevenSegment;
  return displays.kind === 'independent' ? displays.ports.length : displays.digits;
}

export function hasDecimalPoint(ports: BoardPorts): boolean {
  const displays = ports.sevenSegment;
  return displays.kind === 'independent' ? displays.width === SEGMENT_COUNT_WITH_POINT : displays.decimalPoint !== undefined;
}

/** Bits per display word: 8 with a decimal point (bit 7), else 7. */
export function displayWordWidth(ports: BoardPorts): number {
  return hasDecimalPoint(ports) ? SEGMENT_COUNT_WITH_POINT : SEGMENT_COUNT;
}

// --- The bit layout (D5) --------------------------------------------------------

export type StimRole = 'switches' | 'buttons' | 'reset';

export interface StimField {
  readonly role: StimRole;
  readonly width: number;
}

export type StateField =
  | { readonly role: 'leds'; readonly width: number }
  | { readonly role: 'display'; readonly index: number; readonly width: number };

/** `STIM`: switches, buttons, then the reset button when there is one; each field bit N−1 first. */
export function stimFields(ports: BoardPorts): StimField[] {
  const fields: StimField[] = [
    { role: 'switches', width: ports.switches.count },
    { role: 'buttons', width: buttonCount(ports) },
  ];
  return ports.resetButton === undefined ? fields : [...fields, { role: 'reset', width: 1 }];
}

/** `STATE`: the LEDs, then display 0 … D−1; each field bit W−1 first. */
export function stateFields(ports: BoardPorts): StateField[] {
  const width = displayWordWidth(ports);
  const displays = Array.from({ length: displayCount(ports) }, (_, index): StateField => ({ role: 'display', index, width }));
  return [{ role: 'leds', width: ports.leds.count }, ...displays];
}

const totalWidth = (fields: readonly { width: number }[]): number => fields.reduce((sum, field) => sum + field.width, 0);

export const stimLength = (ports: BoardPorts): number => totalWidth(stimFields(ports));
export const stateLength = (ports: BoardPorts): number => totalWidth(stateFields(ports));

// --- Inputs ------------------------------------------------------------------------

/** What the student sets on the board, as pin levels, LSB first. `reset` is empty without a reset button. */
export type BoardInputs = Readonly<Record<StimRole, BitVector>>;

const restLevel = (activeLow: boolean): Bit => (activeLow ? 1 : 0);

/** Every switch down, every button and the reset button released. */
export function restInputs(ports: BoardPorts): BoardInputs {
  const reset = ports.resetButton;
  return {
    switches: zeroBits(ports.switches.count),
    buttons: fillBits(buttonCount(ports), restLevel(ports.pushbuttons.activeLow)),
    reset: reset === undefined ? [] : [restLevel(reset.activeLow)],
  };
}

/** Whether inputs set on `a` mean the same on `b`: the same fields and the same polarities. */
export function sameInputShape(a: BoardPorts, b: BoardPorts): boolean {
  const sameFields = JSON.stringify(stimFields(a)) === JSON.stringify(stimFields(b));
  return sameFields && a.pushbuttons.activeLow === b.pushbuttons.activeLow && a.resetButton?.activeLow === b.resetButton?.activeLow;
}

/** The `STIM` payload: each field MSB first, in layout order. */
export function encodeStim(ports: BoardPorts, inputs: BoardInputs): string {
  return stimFields(ports)
    .map((field) => bitsToString(Array.from({ length: field.width }, (_, bit) => inputs[field.role][bit] ?? 0)))
    .join('');
}

// --- Outputs -----------------------------------------------------------------------

/** What the design drives, as pin levels, LSB first; a display word has bit 7 for the point when there is one. */
export interface BoardOutputs {
  readonly leds: BitVector;
  readonly displays: readonly BitVector[];
}

/** LEDs are dark, and segments off, at these levels; an undefined bit (`X`) reads as off. */
export function outputsOff(ports: BoardPorts): BoardOutputs {
  const segmentOff = restLevel(ports.sevenSegment.activeLow);
  return {
    leds: zeroBits(ports.leds.count),
    displays: Array.from({ length: displayCount(ports) }, () => fillBits(displayWordWidth(ports), segmentOff)),
  };
}

/** `"10X"` (MSB first) → `[0, 0, 1]` (LSB first), with `X` read as `off`. */
function fieldBits(text: string, off: Bit): BitVector {
  return [...text].reverse().map((char) => (char === '1' ? 1 : char === '0' ? 0 : off));
}

/** The `STATE` payload, or undefined when its length is not this board's. */
export function decodeState(ports: BoardPorts, bits: string): BoardOutputs | undefined {
  if (bits.length !== stateLength(ports)) return undefined;
  const segmentOff = restLevel(ports.sevenSegment.activeLow);
  const displays: BitVector[] = [];
  let leds: BitVector = [];
  let at = 0;
  for (const field of stateFields(ports)) {
    const text = bits.slice(at, at + field.width);
    at += field.width;
    if (field.role === 'leds') leds = fieldBits(text, 0);
    else displays.push(fieldBits(text, segmentOff));
  }
  return { leds, displays };
}

// --- Names -------------------------------------------------------------------------

/** Every port name of the board, in role order, scalars expanded. */
export function portList(ports: BoardPorts): string[] {
  return [
    ports.clock.port,
    ports.clock500Hz,
    ports.switches.port,
    ...groupNames(ports.pushbuttons.group),
    ...(ports.resetButton === undefined ? [] : [ports.resetButton.port]),
    ports.leds.port,
    ...sevenSegmentNames(ports),
  ];
}

/** The display ports: one per display, or the segments, decimal point and digit enables. */
export function sevenSegmentNames(ports: BoardPorts): string[] {
  const displays = ports.sevenSegment;
  if (displays.kind === 'independent') return [...displays.ports];
  return [...groupNames(displays.segments), ...(displays.decimalPoint === undefined ? [] : [displays.decimalPoint]), displays.digitEnables];
}
