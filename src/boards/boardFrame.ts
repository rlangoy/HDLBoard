// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `BOARD` frame (docs/board_io_v2_spec.md § 6.1), sent before every `RUN`: the
 * board's normalized ports as one line of versioned JSON, minus the button layout,
 * which only the Board pane needs. Every object is built in one fixed key order, so the
 * text is stable and the backend tests can share it as fixtures.
 *
 * `encodeV1BoardFrame` is the 1.6 encoder, kept for a backend older than protocol 3
 * (§ 6.3): it can carry only a board of the Default shape.
 *
 * Keep in step with `decodeBoardBody` in server/src/boardFrame.ts — the two packages
 * share no code, so both test the same literal frame texts.
 */

import { groupNames } from './boardShape';
import { DEFAULT_SHAPE, isDefaultShape } from './shapeChange';
import type { BoardPorts, PortGroup, SevenSegment } from './types';

export const BOARD_VERB = 'BOARD';
export const BOARD_FRAME_VERSION = 2;

function groupJson(group: PortGroup): object {
  return group.kind === 'vector' ? { kind: 'vector', port: group.port, count: group.count } : { kind: 'scalars', ports: group.ports };
}

function sevenSegmentJson(displays: SevenSegment): object {
  if (displays.kind === 'independent') {
    return { kind: 'independent', ports: displays.ports, width: displays.width, activeLow: displays.activeLow };
  }
  return {
    kind: 'multiplexed',
    segments: groupJson(displays.segments),
    ...(displays.decimalPoint === undefined ? {} : { decimalPoint: displays.decimalPoint }),
    digitEnables: displays.digitEnables,
    digits: displays.digits,
    activeLow: displays.activeLow,
    digitEnablesActiveLow: displays.digitEnablesActiveLow,
  };
}

/** The frame body: `{"version":2,"clock":{…},…}` on one line. */
export function encodeBoardBody(ports: BoardPorts): string {
  const { clock, switches, pushbuttons, resetButton, leds } = ports;
  return JSON.stringify({
    version: BOARD_FRAME_VERSION,
    clock: { port: clock.port, mhz: clock.mhz },
    clock500Hz: ports.clock500Hz,
    switches: { port: switches.port, count: switches.count },
    pushbuttons: { group: groupJson(pushbuttons.group), activeLow: pushbuttons.activeLow },
    ...(resetButton === undefined ? {} : { resetButton: { port: resetButton.port, activeLow: resetButton.activeLow } }),
    leds: { port: leds.port, count: leds.count },
    sevenSegment: sevenSegmentJson(ports.sevenSegment),
  });
}

export function encodeBoardFrame(ports: BoardPorts): string {
  return `${BOARD_VERB}\n${encodeBoardBody(ports)}`;
}

/**
 * Whether the 1.6 frame can carry this board: the Default shape at the Default clock.
 * Version 1 has no frequency, so an older backend would run any other clock at 50 MHz.
 */
export function fitsV1BoardFrame(ports: BoardPorts): boolean {
  return isDefaultShape(ports) && ports.sevenSegment.kind === 'independent' && ports.clock.mhz === DEFAULT_SHAPE.clock.mhz;
}

/**
 * The 1.6 frame, one line per role, for a backend that speaks protocol 2. Only a board
 * that `fitsV1BoardFrame` can be sent in it; asking for another is a bug in the caller.
 */
export function encodeV1BoardFrame(ports: BoardPorts): string {
  if (!fitsV1BoardFrame(ports) || ports.sevenSegment.kind !== 'independent') {
    throw new Error('A version-1 BOARD frame carries only a board of the Default shape at 50 MHz');
  }
  const lines = [
    `clock50 ${ports.clock.port}`,
    `clock500Hz ${ports.clock500Hz}`,
    `switches ${ports.switches.port}`,
    `pushbuttons ${groupNames(ports.pushbuttons.group).join(' ')}`,
    `leds ${ports.leds.port}`,
    `sevenSegment ${ports.sevenSegment.ports.join(' ')}`,
  ];
  return [BOARD_VERB, ...lines].join('\n');
}
