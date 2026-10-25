// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Help's board signals, generated from the active board (docs/board_io_v2_spec.md
 * § 5.7): one row per port, with its direction, width, polarity and, for a multiplexed
 * display, how the simulator shows it.
 */

import { DISPLAY_PERSIST_MS, SEGMENT_COUNT, SEGMENT_COUNT_WITH_POINT } from '../../boards/boardLimits';
import { groupHeading, sevenSegmentHeading, vectorHeading } from '../../boards/boardPortText';
import { groupWidth, portList } from '../../boards/boardShape';
import { DEFAULT_CLOCK_MHZ } from '../../boards/parsePorts';
import type { BoardDefinition, BoardPorts, ButtonGroup, MultiplexedDisplays, ResetButton } from '../../boards/types';

export interface SignalRow {
  port: string;
  dir: 'in' | 'out';
  panel: string;
  meaning: string;
}

const NUMBER_WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
];
/** `Ten` up to the largest board, digits beyond. */
const counted = (count: number): string => NUMBER_WORDS[count] ?? String(count);
const lowerCounted = (count: number): string => counted(count).toLowerCase();

/** `active low: released reads '1', pressed reads '0'`. */
function inputPolarity(activeLow: boolean): string {
  return activeLow ? "active low: released reads '1', pressed reads '0'" : "active high: released reads '0', pressed reads '1'";
}

/** `active low: a '0' lights a segment`. */
function segmentPolarity(activeLow: boolean): string {
  return activeLow ? "active low: a '0' lights a segment" : "active high: a '1' lights a segment";
}

/** The top-level ports, in the order the starter file declares them. */
export function signalRows(board: BoardDefinition): SignalRow[] {
  const { ports } = board;
  return [
    ...clockRows(ports),
    {
      port: vectorHeading(ports.switches.port, ports.switches.count),
      dir: 'in',
      panel: 'Switches',
      meaning: `${counted(ports.switches.count)} slide switches. Up reads '1', down reads '0'.`,
    },
    buttonRow(ports.pushbuttons),
    ...(ports.resetButton === undefined ? [] : [resetRow(ports.resetButton)]),
    {
      port: vectorHeading(ports.leds.port, ports.leds.count),
      dir: 'out',
      panel: 'LEDs',
      meaning: `${counted(ports.leds.count)} LEDs. Drive a bit to '1' to light its LED.`,
    },
    ...displayRows(ports),
  ];
}

function clockRows(ports: BoardPorts): SignalRow[] {
  const faster = ports.clock.mhz > DEFAULT_CLOCK_MHZ ? ` A faster clock simulates more slowly than a ${DEFAULT_CLOCK_MHZ} MHz one.` : '';
  return [
    { port: ports.clock.port, dir: 'in', panel: 'Runs by itself', meaning: `The board's ${ports.clock.mhz} MHz clock. There is no widget for it.${faster}` },
    {
      port: ports.clock500Hz,
      dir: 'in',
      panel: 'Runs by itself',
      meaning: 'Simulator only: a ready-divided 500 Hz clock, handy for counters and blinking LEDs. Not a pin on the real board.',
    },
  ];
}

function buttonRow(buttons: ButtonGroup): SignalRow {
  const cross = buttons.layout === 'cross' ? ' in a cross (centre, up, left, right, down)' : '';
  return {
    port: groupHeading(buttons.group),
    dir: 'in',
    panel: 'Pushbuttons',
    meaning: `${counted(groupWidth(buttons.group))} pushbuttons${cross}, ${inputPolarity(buttons.activeLow)}.`,
  };
}

function resetRow(reset: ResetButton): SignalRow {
  return { port: reset.port, dir: 'in', panel: 'Pushbuttons', meaning: `The reset button, ${inputPolarity(reset.activeLow)}.` };
}

function displayRows(ports: BoardPorts): SignalRow[] {
  const displays = ports.sevenSegment;
  if (displays.kind === 'multiplexed') return multiplexedRows(displays);
  const first = displays.ports[0];
  const last = displays.ports[displays.ports.length - 1];
  const bits = displays.width === SEGMENT_COUNT_WITH_POINT ? 'eight bits each (bit 7 is the decimal point)' : 'seven bits each';
  return [
    {
      port: sevenSegmentHeading(displays),
      dir: 'out',
      panel: '7-Segment Displays',
      meaning: `${counted(displays.ports.length)} displays, ${first} to ${last}, ${bits}, ${segmentPolarity(displays.activeLow)}.`,
    },
  ];
}

function multiplexedRows(displays: MultiplexedDisplays): SignalRow[] {
  const panel = '7-Segment Display';
  const segments = displays.segments;
  const segmentPort = segments.kind === 'vector' ? vectorHeading(segments.port, SEGMENT_COUNT) : groupHeading(segments);
  const enables = displays.digitEnablesActiveLow ? "a '0' enables a digit" : "a '1' enables a digit";
  return [
    { port: segmentPort, dir: 'out', panel, meaning: `Segments a to g, shared by every digit, ${segmentPolarity(displays.activeLow)}.` },
    ...(displays.decimalPoint === undefined
      ? []
      : [{ port: displays.decimalPoint, dir: 'out' as const, panel, meaning: `The decimal point, shared by every digit, ${displays.activeLow ? 'active low' : 'active high'}.` }]),
    {
      port: vectorHeading(displays.digitEnables, displays.digits),
      dir: 'out',
      panel,
      meaning:
        `One enable per digit, ${lowerCounted(displays.digits)} digits, bit 0 the rightmost; ${enables}. ` +
        `A digit shows the segments driven while it is enabled, and goes dark when it is not refreshed for ${DISPLAY_PERSIST_MS} ms.`,
    },
  ];
}

/** Whether the board marks its active-low ports with `_N`, so Help explains the suffix. */
export function usesActiveLowSuffix(board: BoardDefinition): boolean {
  return portList(board.ports).some((name) => /_n$/i.test(name));
}
