// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Help's board signals, in the active board's names (docs/board_io_config_spec.md § 6.8).
 * The meanings keep their wording on every board: polarity is fixed per role, and a
 * name never changes it.
 */

import { LED_COUNT, PUSHBUTTON_COUNT, SWITCH_COUNT, portList, sevenSegmentHeading, vectorHeading } from '../../boards/boardPorts';
import type { BoardDefinition } from '../../boards/types';

export interface SignalRow {
  port: string;
  dir: 'in' | 'out';
  panel: string;
  meaning: string;
}

/** The top-level ports, in the order the starter file declares them. */
export function signalRows(board: BoardDefinition): SignalRow[] {
  const { ports } = board;
  const displays = ports.sevenSegment;
  return [
    { port: ports.clock50, dir: 'in', panel: 'Runs by itself', meaning: "The board's 50 MHz clock. There is no widget for it." },
    {
      port: ports.clock500Hz,
      dir: 'in',
      panel: 'Runs by itself',
      meaning: 'Simulator only: a ready-divided 500 Hz clock, handy for counters and blinking LEDs. Not a pin on the real board.',
    },
    { port: vectorHeading(ports.switches, SWITCH_COUNT), dir: 'in', panel: 'Switches', meaning: "Ten slide switches. Up reads '1', down reads '0'." },
    {
      port: vectorHeading(ports.pushbuttons, PUSHBUTTON_COUNT),
      dir: 'in',
      panel: 'Pushbuttons',
      meaning: "Four pushbuttons, active low: released reads '1', pressed reads '0'.",
    },
    { port: vectorHeading(ports.leds, LED_COUNT), dir: 'out', panel: 'LEDs', meaning: "Ten red LEDs. Drive a bit to '1' to light its LED." },
    {
      port: sevenSegmentHeading(displays),
      dir: 'out',
      panel: '7-Segment Displays',
      meaning: `Six displays, ${displays[0]} to ${displays[displays.length - 1]}, seven bits each, active low: a '0' lights a segment.`,
    },
  ];
}

/** Whether the board marks its active-low ports with `_N`, so Help explains the suffix. */
export function usesActiveLowSuffix(board: BoardDefinition): boolean {
  return portList(board.ports).some((name) => /_n$/i.test(name));
}
