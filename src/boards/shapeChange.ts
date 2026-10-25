// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How two boards differ in shape (docs/board_io_v2_spec.md § 4.1, § 5.3): what a
 * student must change by hand when moving a design from one to the other. Names are
 * not shape — they are renamed (`roleRenames`). The clock frequency is not shape
 * either, but it is a hand edit, so it is listed first.
 *
 * The `same…Shape` predicates are shared with `roleRenames`: a role is renamed exactly
 * when it is not listed here (§ 9), so nothing is half-done.
 */

import { DEFAULT_BOARD } from './boardCatalog';
import { groupHeading, polarityText, sevenSegmentHeading, vectorHeading } from './boardPortText';
import { groupWidth } from './boardShape';
import { SEGMENT_COUNT_WITH_POINT } from './boardLimits';
import type { BoardPorts, ButtonGroup, IndependentDisplays, MultiplexedDisplays, ResetButton, SevenSegment, VectorPort } from './types';

export type ShapeDifference =
  | { readonly role: 'clock'; readonly fromMHz: number; readonly toMHz: number }
  | { readonly role: 'switches' | 'leds'; readonly from: VectorPort; readonly to: VectorPort }
  | { readonly role: 'pushbuttons'; readonly from: ButtonGroup; readonly to: ButtonGroup }
  | { readonly role: 'resetButton'; readonly from?: ResetButton; readonly to?: ResetButton }
  | { readonly role: 'sevenSegment'; readonly from: SevenSegment; readonly to: SevenSegment };

/** The shape of the Default board: what the built-in examples are written for. */
export const DEFAULT_SHAPE: BoardPorts = DEFAULT_BOARD.ports;

export function sameButtonShape(a: ButtonGroup, b: ButtonGroup): boolean {
  return a.layout === b.layout && a.group.kind === b.group.kind && groupWidth(a.group) === groupWidth(b.group) && a.activeLow === b.activeLow;
}

export function sameResetShape(a: ResetButton | undefined, b: ResetButton | undefined): boolean {
  return a?.activeLow === b?.activeLow;
}

export function sameSevenSegmentShape(a: SevenSegment, b: SevenSegment): boolean {
  if (a.kind === 'independent' && b.kind === 'independent') return sameIndependentShape(a, b);
  if (a.kind === 'multiplexed' && b.kind === 'multiplexed') return sameMultiplexedShape(a, b);
  return false;
}

function sameIndependentShape(a: IndependentDisplays, b: IndependentDisplays): boolean {
  return a.ports.length === b.ports.length && a.width === b.width && a.activeLow === b.activeLow;
}

function sameMultiplexedShape(a: MultiplexedDisplays, b: MultiplexedDisplays): boolean {
  const samePoint = (a.decimalPoint === undefined) === (b.decimalPoint === undefined);
  return sameMultiplexing(a, b) && a.segments.kind === b.segments.kind && samePoint;
}

/** Two multiplexed displays whose digit enables mean the same: same digits, same polarities. */
export function sameMultiplexing(a: SevenSegment, b: SevenSegment): boolean {
  return (
    a.kind === 'multiplexed' &&
    b.kind === 'multiplexed' &&
    a.digits === b.digits &&
    a.activeLow === b.activeLow &&
    a.digitEnablesActiveLow === b.digitEnablesActiveLow
  );
}

/** What changes by hand from `from` to `to`, in role order; empty when shapes and frequency match. */
export function describeShapeChange(from: BoardPorts, to: BoardPorts): ShapeDifference[] {
  const differences: ShapeDifference[] = [];
  if (from.clock.mhz !== to.clock.mhz) differences.push({ role: 'clock', fromMHz: from.clock.mhz, toMHz: to.clock.mhz });
  if (from.switches.count !== to.switches.count) differences.push({ role: 'switches', from: from.switches, to: to.switches });
  if (!sameButtonShape(from.pushbuttons, to.pushbuttons)) differences.push({ role: 'pushbuttons', from: from.pushbuttons, to: to.pushbuttons });
  if (!sameResetShape(from.resetButton, to.resetButton)) differences.push({ role: 'resetButton', from: from.resetButton, to: to.resetButton });
  if (from.leds.count !== to.leds.count) differences.push({ role: 'leds', from: from.leds, to: to.leds });
  if (!sameSevenSegmentShape(from.sevenSegment, to.sevenSegment)) {
    differences.push({ role: 'sevenSegment', from: from.sevenSegment, to: to.sevenSegment });
  }
  return differences;
}

/** The board has the Default shape: the built-in examples run on it. Names and frequency do not count. */
export function isDefaultShape(ports: BoardPorts): boolean {
  return describeShapeChange(DEFAULT_SHAPE, ports).every((difference) => difference.role === 'clock');
}

// --- The sentences -------------------------------------------------------------------

/** `Switches: 10 → 16 (sw[15:0]).` */
export function formatShapeDifference(difference: ShapeDifference): string {
  switch (difference.role) {
    case 'clock':
      return `Clock frequency: ${difference.fromMHz} MHz → ${difference.toMHz} MHz (divider and counter constants change).`;
    case 'switches':
      return `Switches: ${difference.from.count} → ${difference.to.count} (${vectorHeading(difference.to.port, difference.to.count)}).`;
    case 'leds':
      return `LEDs: ${difference.from.count} → ${difference.to.count} (${vectorHeading(difference.to.port, difference.to.count)}).`;
    case 'pushbuttons':
      return `Pushbuttons: ${buttonsText(difference.from)} → ${buttonsText(difference.to)}.`;
    case 'resetButton':
      return `Reset button: ${resetText(difference.from)} → ${resetText(difference.to)}.`;
    case 'sevenSegment': {
      const { from, to } = difference;
      const showPolarity = from.activeLow !== to.activeLow;
      return `7-segment: ${displaysText(from, showPolarity)} → ${displaysText(to, showPolarity)} (${sevenSegmentHeading(to)}).`;
    }
  }
}

/** `4 active-low (KEY_N[3:0])`, `5 active-high in a cross (btnC, btnU, btnL, btnR, btnD)`. */
function buttonsText(buttons: ButtonGroup): string {
  const cross = buttons.layout === 'cross' ? ' in a cross' : '';
  return `${groupWidth(buttons.group)} ${polarityText(buttons.activeLow)}${cross} (${groupHeading(buttons.group)})`;
}

function resetText(reset: ResetButton | undefined): string {
  return reset === undefined ? 'none' : `${reset.port}, ${polarityText(reset.activeLow)}`;
}

/**
 * `6 separate displays with decimal point`, `a 4-digit multiplexed display`. A
 * multiplexed display's point is named in the heading that follows (`seg[6:0], dp, an[3:0]`).
 */
function displaysText(displays: SevenSegment, showPolarity: boolean): string {
  const polarity = showPolarity ? `, ${polarityText(displays.activeLow)}` : '';
  if (displays.kind === 'multiplexed') return `a ${displays.digits}-digit multiplexed display${polarity}`;
  const point = displays.width === SEGMENT_COUNT_WITH_POINT ? ' with decimal point' : '';
  return `${displays.ports.length} separate displays${point}${polarity}`;
}
