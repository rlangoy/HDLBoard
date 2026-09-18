// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Bit, BitVector } from '../board';

/**
 * One display's segment word: 7 bits, LSB first, so `segments[n]` drives
 * segment *n* exactly as `HEX0[n]` does on the board.
 *
 * Segment numbering is the board's own (see
 * `DesignResources/7SegmentDisplay_maping.png`), not the a–g letters:
 *
 * ```
 *        0            bit 0  top          (a)
 *      ┌───┐          bit 1  top right    (b)
 *     5│   │1         bit 2  bottom right (c)
 *      ├─6─┤          bit 3  bottom       (d)
 *     4│   │2         bit 4  bottom left  (e)
 *      └───┘ ● DP     bit 5  top left     (f)
 *        3            bit 6  middle       (g)
 * ```
 *
 * The board has no decimal-point bit — `HEX0 … HEX5` are 7 bits each
 * (`DesignResources/7SegmentDisplay_pin_assignment.png`), so the dot is
 * moulded into the package and never lights.
 */
export type SegmentVector = BitVector;

export const SEGMENT_COUNT = 7;

/**
 * The decoder table from the course's VHDL, transcribed exactly.
 *
 * Each string is written MSB first — `"gfedcba"`, segment 6 leftmost —
 * so it can be compared line by line against the `case` in the VHDL.
 * **Active low: a `0` lights the segment.**
 */
export const SEGMENT_PATTERNS = [
  '1000000', // 0
  '1111001', // 1
  '0100100', // 2
  '0110000', // 3
  '0011001', // 4
  '0010010', // 5
  '0000010', // 6
  '1111000', // 7
  '0000000', // 8
  '0011000', // 9
  '0001000', // A
  '0000011', // B
  '1000110', // C
  '0100001', // D
  '0000110', // E
  '0001110', // F
] as const;

/** `when others => "1111111"` — every segment dark. */
export const BLANK_PATTERN = '1111111';

/** `"1000000"` (MSB first) → `[0,0,0,0,0,0,1]` (LSB first). */
export const patternToSegments = (pattern: string): SegmentVector =>
  [...pattern].reverse().map((c) => (c === '1' ? 1 : 0) as Bit);

/** `"1000000"` — segment word as the VHDL writes it, MSB first. */
export const segmentsToPattern = (segments: SegmentVector): string =>
  Array.from(
    { length: SEGMENT_COUNT },
    (_, i) => segments[SEGMENT_COUNT - 1 - i] ?? 1,
  ).join('');

/** All segments dark. */
export const blankSegments = (): SegmentVector =>
  patternToSegments(BLANK_PATTERN);

/**
 * The course's `hex7seg` function: a 4-bit value in, a segment word out.
 * Anything outside 0–15 blanks the display, like the VHDL's `others`.
 */
export const nibbleToSegments = (nibble: number): SegmentVector =>
  patternToSegments(
    Number.isInteger(nibble) && nibble >= 0 && nibble <= 15
      ? SEGMENT_PATTERNS[nibble]
      : BLANK_PATTERN,
  );

/** Every digit of a number, LSB display first, blanked past `count`. */
export const numberToDisplays = (
  value: number,
  count: number,
): SegmentVector[] =>
  Array.from({ length: count }, (_, i) => nibbleToSegments((value >> (i * 4)) & 0xf));

/** `[0,0,0,0,0,0,1]` → `"40"` — the segment word as two hex digits. */
export const segmentsToHexByte = (segments: SegmentVector): string =>
  parseInt(segmentsToPattern(segments), 2)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0');
