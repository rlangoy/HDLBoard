// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A board's ports as a student reads them in headings, Help and the change dialog:
 * `LEDR[9:0]`, `btnC, btnU, btnL`, `HEXn[7:0]`, `seg[6:0], dp, an[3:0]`. Pure.
 */

import { SEGMENT_COUNT } from './boardLimits';
import type { PortGroup, SevenSegment } from './types';

const lastIndex = (count: number): number => count - 1;

/** `LEDR[9:0]`: a vector port with its range. */
export function vectorHeading(name: string, width: number): string {
  return `${name}[${lastIndex(width)}:0]`;
}

/** `KEY[1:0]` for a vector, `BTN0, BTN1, BTN2` for scalars. */
export function groupHeading(group: PortGroup): string {
  return group.kind === 'vector' ? vectorHeading(group.port, group.count) : group.ports.join(', ');
}

export function polarityText(activeLow: boolean): string {
  return activeLow ? 'active-low' : 'active-high';
}

/**
 * The display ports as one name: `HEXn_N` when they are one pattern with the display
 * number in it (as on every built-in board), else the compact `HEX0…HEX5`.
 */
export function sevenSegmentPattern(names: readonly string[]): string {
  return displayPattern(names) ?? `${names[0]}…${names[names.length - 1]}`;
}

/** `HEXn_N` for `HEX0_N` … `HEX5_N`: one prefix, the index 0, 1, … in order, one suffix. */
function displayPattern(names: readonly string[]): string | undefined {
  const first = names[0];
  const digitAt = first?.indexOf('0') ?? -1;
  if (first === undefined || digitAt < 0) return undefined;
  const prefix = first.slice(0, digitAt);
  const suffix = first.slice(digitAt + 1);
  const isPattern = names.every((name, index) => name === `${prefix}${index}${suffix}`);
  return isPattern ? `${prefix}n${suffix}` : undefined;
}

/** `seg[6:0]` for a vector, `CA…CG` for seven scalars. */
export function segmentsHeading(segments: PortGroup): string {
  if (segments.kind === 'vector') return vectorHeading(segments.port, SEGMENT_COUNT);
  return `${segments.ports[0]}…${segments.ports[segments.ports.length - 1]}`;
}

/** `HEXn[7:0]` for independent displays; `seg[6:0], dp, an[3:0]` for a multiplexed one. */
export function sevenSegmentHeading(displays: SevenSegment): string {
  if (displays.kind === 'independent') return vectorHeading(sevenSegmentPattern(displays.ports), displays.width);
  const point = displays.decimalPoint === undefined ? [] : [displays.decimalPoint];
  return [segmentsHeading(displays.segments), ...point, vectorHeading(displays.digitEnables, displays.digits)].join(', ');
}

/** `HEX0_N … HEX5_N`: the first and last of a run of display names. */
export function displayRange(names: readonly string[]): string {
  return `${names[0]} … ${names[names.length - 1]}`;
}
