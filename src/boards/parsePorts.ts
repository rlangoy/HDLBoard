// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `ports` of a version-2 board (docs/board_io_v2_spec.md § 3.2–3.4), read into the
 * normalized `BoardPorts`. This is the only frontend code that knows the file's
 * alternatives: a vector or scalar list or cross for the buttons, a vector or scalar
 * list for the segments, and the optional fields with their defaults.
 */

import { isObject } from '../project/jsonValue';
import {
  booleanAt,
  countAt,
  fail,
  nameAt,
  namesAt,
  objectAt,
  quoted,
} from './boardFileReader';
import {
  BUTTON_LIMIT,
  CLOCK_MHZ_DECIMALS,
  CLOCK_MHZ_LIMIT,
  DISPLAY_LIMIT,
  LED_LIMIT,
  SEGMENT_COUNT,
  SEGMENT_COUNT_WITH_POINT,
  SWITCH_LIMIT,
  type CountLimit,
} from './boardLimits';
import type {
  BoardPorts,
  ButtonGroup,
  IndependentDisplays,
  MultiplexedDisplays,
  PortGroup,
  ResetButton,
  SevenSegment,
  VectorPort,
} from './types';

/** The 500 Hz clock is simulator-provided, so a board file need not invent a name for it. */
export const DEFAULT_CLOCK_500HZ_NAME = 'CLOCK_500Hz';
/** A board that does not say otherwise runs at 50 MHz, as every version-1 board does. */
export const DEFAULT_CLOCK_MHZ = 50;

const PORT_ROLES = {
  required: ['clock', 'switches', 'pushbuttons', 'leds', 'sevenSegment'],
  optional: ['clockMHz', 'clock500Hz', 'resetButton'],
  noun: 'role',
} as const;

/** A cross's positions, in group order: centre is button 0. */
export const CROSS_POSITIONS = ['centre', 'up', 'left', 'right', 'down'] as const;
export type CrossPosition = (typeof CROSS_POSITIONS)[number];

const ACTIVE_LOW_BY_DEFAULT = true;
const SEGMENT_LIMIT: CountLimit = { min: SEGMENT_COUNT, max: SEGMENT_COUNT };

export function readPorts(value: unknown): BoardPorts {
  const ports = objectAt('ports', value, PORT_ROLES);
  const parsed: BoardPorts = {
    clock: { port: nameAt('ports.clock', ports.clock), mhz: readClockMHz(ports.clockMHz) },
    clock500Hz: ports.clock500Hz === undefined ? DEFAULT_CLOCK_500HZ_NAME : nameAt('ports.clock500Hz', ports.clock500Hz),
    switches: readVector('ports.switches', ports.switches, SWITCH_LIMIT),
    pushbuttons: readButtons(ports.pushbuttons),
    leds: readVector('ports.leds', ports.leds, LED_LIMIT),
    sevenSegment: readSevenSegment(ports.sevenSegment),
  };
  const withReset = ports.resetButton === undefined ? parsed : { ...parsed, resetButton: readResetButton(ports.resetButton) };
  checkNamesUnique(withReset);
  return withReset;
}

function readClockMHz(value: unknown): number {
  if (value === undefined) return DEFAULT_CLOCK_MHZ;
  if (!isClockMHz(value)) {
    fail(
      `ports.clockMHz: ${quoted(value)} is not valid; use a number from ${CLOCK_MHZ_LIMIT.min} to ${CLOCK_MHZ_LIMIT.max} ` +
        `with at most ${CLOCK_MHZ_DECIMALS} decimals`,
    );
  }
  return value;
}

function isClockMHz(value: unknown): value is number {
  if (typeof value !== 'number' || value < CLOCK_MHZ_LIMIT.min || value > CLOCK_MHZ_LIMIT.max) return false;
  return Number(value.toFixed(CLOCK_MHZ_DECIMALS)) === value;
}

function readVector(path: string, value: unknown, limit: CountLimit): VectorPort {
  const vector = objectAt(path, value, { required: ['port', 'count'] });
  return { port: nameAt(`${path}.port`, vector.port), count: countAt(`${path}.count`, vector.count, limit) };
}

/** A vector row, a row of scalars, or a cross written with position keys. */
function readButtons(value: unknown): ButtonGroup {
  const path = 'ports.pushbuttons';
  const buttons = objectAt(path, value, { required: [], optional: ['port', 'count', 'ports', 'cross', 'activeLow'] });
  const activeLow = booleanAt(`${path}.activeLow`, buttons.activeLow, ACTIVE_LOW_BY_DEFAULT);
  const forms = ['port', 'ports', 'cross'].filter((form) => buttons[form] !== undefined);
  if (forms.length !== 1) fail(`${path} needs exactly one of "port" (with "count"), "ports" or "cross"`);
  if (buttons.cross !== undefined) return { group: readCross(`${path}.cross`, buttons.cross), activeLow, layout: 'cross' };
  if (buttons.ports !== undefined) {
    if (buttons.count !== undefined) fail(`${path}.count goes with "port" only; a list of "ports" is counted`);
    return { group: { kind: 'scalars', ports: namesAt(`${path}.ports`, buttons.ports, BUTTON_LIMIT) }, activeLow, layout: 'row' };
  }
  if (buttons.count === undefined) fail(`${path}.count is missing`);
  const group: PortGroup = { kind: 'vector', port: nameAt(`${path}.port`, buttons.port), count: countAt(`${path}.count`, buttons.count, BUTTON_LIMIT) };
  return { group, activeLow, layout: 'row' };
}

/** Five scalars in group order; a wrong order cannot be written (F3). */
function readCross(path: string, value: unknown): PortGroup {
  const cross = objectAt(path, value, { required: [], optional: CROSS_POSITIONS, noun: 'position' });
  const missing = CROSS_POSITIONS.find((position) => cross[position] === undefined);
  if (missing !== undefined) fail(`${path}: ${quoted(missing)} is missing`);
  return { kind: 'scalars', ports: CROSS_POSITIONS.map((position) => nameAt(`${path}.${position}`, cross[position])) };
}

function readResetButton(value: unknown): ResetButton {
  const path = 'ports.resetButton';
  const reset = objectAt(path, value, { required: ['port'], optional: ['activeLow'] });
  return { port: nameAt(`${path}.port`, reset.port), activeLow: booleanAt(`${path}.activeLow`, reset.activeLow, ACTIVE_LOW_BY_DEFAULT) };
}

function readSevenSegment(value: unknown): SevenSegment {
  const path = 'ports.sevenSegment';
  if (!isObject(value)) fail(`${path} must be an object`);
  if (value.kind === 'independent') return readIndependent(path, value);
  if (value.kind === 'multiplexed') return readMultiplexed(path, value);
  return fail(`${path}.kind must be "independent" or "multiplexed"`);
}

function readIndependent(path: string, value: unknown): IndependentDisplays {
  const displays = objectAt(path, value, { required: ['kind', 'ports', 'width'], optional: ['activeLow'] });
  if (displays.width !== SEGMENT_COUNT && displays.width !== SEGMENT_COUNT_WITH_POINT) {
    fail(`${path}.width must be ${SEGMENT_COUNT} or ${SEGMENT_COUNT_WITH_POINT} (${SEGMENT_COUNT_WITH_POINT} when bit 7 is the decimal point)`);
  }
  return {
    kind: 'independent',
    ports: namesAt(`${path}.ports`, displays.ports, DISPLAY_LIMIT),
    width: displays.width,
    activeLow: booleanAt(`${path}.activeLow`, displays.activeLow, ACTIVE_LOW_BY_DEFAULT),
  };
}

function readMultiplexed(path: string, value: unknown): MultiplexedDisplays {
  const displays = objectAt(path, value, {
    required: ['kind', 'segments', 'digitEnables', 'digits'],
    optional: ['decimalPoint', 'activeLow', 'digitEnablesActiveLow'],
  });
  const multiplexed: MultiplexedDisplays = {
    kind: 'multiplexed',
    segments: readSegments(`${path}.segments`, displays.segments),
    digitEnables: nameAt(`${path}.digitEnables`, displays.digitEnables),
    digits: countAt(`${path}.digits`, displays.digits, DISPLAY_LIMIT),
    activeLow: booleanAt(`${path}.activeLow`, displays.activeLow, ACTIVE_LOW_BY_DEFAULT),
    digitEnablesActiveLow: booleanAt(`${path}.digitEnablesActiveLow`, displays.digitEnablesActiveLow, ACTIVE_LOW_BY_DEFAULT),
  };
  if (displays.decimalPoint === undefined) return multiplexed;
  return { ...multiplexed, decimalPoint: nameAt(`${path}.decimalPoint`, displays.decimalPoint) };
}

/** A 7-bit vector name, or seven scalar names in the order a … g. */
function readSegments(path: string, value: unknown): PortGroup {
  if (typeof value === 'string') return { kind: 'vector', port: nameAt(path, value), count: SEGMENT_COUNT };
  if (!Array.isArray(value)) fail(`${path} must be a port name or an array of ${SEGMENT_COUNT} names (a … g)`);
  return { kind: 'scalars', ports: namesAt(path, value, SEGMENT_LIMIT) };
}

// --- Names unique ignoring case ------------------------------------------------

interface NamedPort {
  readonly path: string;
  readonly name: string;
}

/** A vector at `path`, or scalars at `path[0]`, `path[1]`, …. */
function groupNames(path: string, group: PortGroup): NamedPort[] {
  if (group.kind === 'vector') return [{ path, name: group.port }];
  return group.ports.map((name, index) => ({ path: `${path}[${index}]`, name }));
}

function buttonNames({ group, layout }: ButtonGroup): NamedPort[] {
  const path = 'ports.pushbuttons';
  if (group.kind === 'vector') return [{ path: `${path}.port`, name: group.port }];
  if (layout === 'cross') return group.ports.map((name, index) => ({ path: `${path}.cross.${CROSS_POSITIONS[index]}`, name }));
  return groupNames(`${path}.ports`, group);
}

function sevenSegmentNames(displays: SevenSegment): NamedPort[] {
  const path = 'ports.sevenSegment';
  if (displays.kind === 'independent') return displays.ports.map((name, index) => ({ path: `${path}.ports[${index}]`, name }));
  return [
    ...groupNames(`${path}.segments`, displays.segments),
    ...(displays.decimalPoint === undefined ? [] : [{ path: `${path}.decimalPoint`, name: displays.decimalPoint }]),
    { path: `${path}.digitEnables`, name: displays.digitEnables },
  ];
}

/** Every name with its JSON path; the 500 Hz clock last, so a collision names it. */
function namedPorts(ports: BoardPorts): NamedPort[] {
  return [
    { path: 'ports.clock', name: ports.clock.port },
    { path: 'ports.switches.port', name: ports.switches.port },
    ...buttonNames(ports.pushbuttons),
    ...(ports.resetButton === undefined ? [] : [{ path: 'ports.resetButton.port', name: ports.resetButton.port }]),
    { path: 'ports.leds.port', name: ports.leds.port },
    ...sevenSegmentNames(ports.sevenSegment),
    { path: 'ports.clock500Hz', name: ports.clock500Hz },
  ];
}

/** VHDL sees `Key` and `KEY` as one port, so a board's names must differ ignoring case (ASCII, § 3.4). */
function checkNamesUnique(ports: BoardPorts): void {
  const seen = new Map<string, NamedPort>();
  for (const port of namedPorts(ports)) {
    const earlier = seen.get(port.name.toLowerCase());
    if (earlier !== undefined) fail(duplicateMessage(port, earlier));
    seen.set(port.name.toLowerCase(), port);
  }
}

function duplicateMessage(port: NamedPort, earlier: NamedPort): string {
  if (port.path === 'ports.clock500Hz') {
    return `ports.clock500Hz: ${quoted(port.name)} is also ${earlier.path}; set clock500Hz to another name`;
  }
  return `${port.path} ${quoted(port.name)} is the same name as ${earlier.path} ${quoted(earlier.name)} (names ignore case)`;
}
