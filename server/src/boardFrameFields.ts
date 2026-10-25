// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * `validateBoardIo` (docs/board_io_v2_spec.md § 6.1): a JSON `BOARD` body, read field by
 * field into a `BoardIo`. Every field must be there with the right type, nothing else may
 * be, every count must be within the limits, and every name must pass the identifier
 * rule. The first problem rejects the board; `boardFrame.ts` reports it.
 */

import { nameProblem } from './boardNames.js';
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
} from './engines/boardLimits.js';
import {
  boardBindings,
  type BoardIo,
  type ButtonGroup,
  type IndependentDisplays,
  type MultiplexedDisplays,
  type PortGroup,
  type ResetButton,
  type SevenSegment,
  type VectorPort,
} from './engines/boardPorts.js';

/** Why a `BOARD` body was refused; caught in `decodeBoardBody`. */
export class BoardRejection extends Error {}

const reject = (problem: string): never => {
  throw new BoardRejection(problem);
};

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The keys an object must have, and those it may have. */
interface Keys {
  readonly required: readonly string[];
  readonly optional?: readonly string[];
}

/** The object at `path`, with every `required` key, any `optional` one, and no other. */
function objectAt(path: string, value: unknown, { required, optional = [] }: Keys): Fields {
  if (!isFields(value)) return reject(`${path} must be an object`);
  const unknownKey = Object.keys(value).find((key) => !required.includes(key) && !optional.includes(key));
  if (unknownKey !== undefined) reject(`${path}.${unknownKey} is not a field`);
  const missing = required.find((key) => value[key] === undefined);
  if (missing !== undefined) reject(`${path}.${missing} is missing`);
  return value;
}

function nameAt(path: string, value: unknown): string {
  if (typeof value !== 'string') return reject(`${path} must be a name`);
  const problem = nameProblem(value);
  return problem === undefined ? value : reject(`${path}: ${problem}`);
}

function countAt(path: string, value: unknown, limit: CountLimit): number {
  const inRange = typeof value === 'number' && Number.isInteger(value) && value >= limit.min && value <= limit.max;
  return inRange ? value : reject(`${path} must be a whole number from ${limit.min} to ${limit.max}`);
}

function booleanAt(path: string, value: unknown): boolean {
  return typeof value === 'boolean' ? value : reject(`${path} must be true or false`);
}

function namesAt(path: string, value: unknown, limit: CountLimit): string[] {
  if (!Array.isArray(value)) return reject(`${path} must be an array of names`);
  countAt(`${path}.length`, value.length, limit);
  return value.map((name, index) => nameAt(`${path}[${index}]`, name));
}

function mhzAt(path: string, value: unknown): number {
  const inRange = typeof value === 'number' && value >= CLOCK_MHZ_LIMIT.min && value <= CLOCK_MHZ_LIMIT.max;
  const decimalsOk = inRange && Number(value.toFixed(CLOCK_MHZ_DECIMALS)) === value;
  return decimalsOk ? value : reject(`${path} must be a number from ${CLOCK_MHZ_LIMIT.min} to ${CLOCK_MHZ_LIMIT.max} with at most ${CLOCK_MHZ_DECIMALS} decimals`);
}

function vectorAt(path: string, value: unknown, limit: CountLimit): VectorPort {
  const vector = objectAt(path, value, { required: ['port', 'count'] });
  return { port: nameAt(`${path}.port`, vector.port), count: countAt(`${path}.count`, vector.count, limit) };
}

function groupAt(path: string, value: unknown, limit: CountLimit): PortGroup {
  const kind = isFields(value) ? value.kind : undefined;
  if (kind === 'vector') {
    const vector = objectAt(path, value, { required: ['kind', 'port', 'count'] });
    return { kind: 'vector', port: nameAt(`${path}.port`, vector.port), count: countAt(`${path}.count`, vector.count, limit) };
  }
  if (kind === 'scalars') return { kind: 'scalars', ports: namesAt(`${path}.ports`, objectAt(path, value, { required: ['kind', 'ports'] }).ports, limit) };
  return reject(`${path}.kind must be "vector" or "scalars"`);
}

function buttonsAt(value: unknown): ButtonGroup {
  const buttons = objectAt('pushbuttons', value, { required: ['group', 'activeLow'] });
  return { group: groupAt('pushbuttons.group', buttons.group, BUTTON_LIMIT), activeLow: booleanAt('pushbuttons.activeLow', buttons.activeLow) };
}

function resetAt(value: unknown): ResetButton {
  const reset = objectAt('resetButton', value, { required: ['port', 'activeLow'] });
  return { port: nameAt('resetButton.port', reset.port), activeLow: booleanAt('resetButton.activeLow', reset.activeLow) };
}

function independentAt(value: unknown): IndependentDisplays {
  const displays = objectAt('sevenSegment', value, { required: ['kind', 'ports', 'width', 'activeLow'] });
  const width = displays.width === SEGMENT_COUNT || displays.width === SEGMENT_COUNT_WITH_POINT ? displays.width : reject('sevenSegment.width must be 7 or 8');
  return {
    kind: 'independent',
    ports: namesAt('sevenSegment.ports', displays.ports, DISPLAY_LIMIT),
    width,
    activeLow: booleanAt('sevenSegment.activeLow', displays.activeLow),
  };
}

const SEGMENT_LIMIT: CountLimit = { min: SEGMENT_COUNT, max: SEGMENT_COUNT };

function multiplexedAt(value: unknown): MultiplexedDisplays {
  const displays = objectAt('sevenSegment', value, { required: ['kind', 'segments', 'digitEnables', 'digits', 'activeLow', 'digitEnablesActiveLow'], optional: ['decimalPoint'] });
  const multiplexed: MultiplexedDisplays = {
    kind: 'multiplexed',
    segments: groupAt('sevenSegment.segments', displays.segments, SEGMENT_LIMIT),
    digitEnables: nameAt('sevenSegment.digitEnables', displays.digitEnables),
    digits: countAt('sevenSegment.digits', displays.digits, DISPLAY_LIMIT),
    activeLow: booleanAt('sevenSegment.activeLow', displays.activeLow),
    digitEnablesActiveLow: booleanAt('sevenSegment.digitEnablesActiveLow', displays.digitEnablesActiveLow),
  };
  return displays.decimalPoint === undefined ? multiplexed : { ...multiplexed, decimalPoint: nameAt('sevenSegment.decimalPoint', displays.decimalPoint) };
}

function sevenSegmentAt(value: unknown): SevenSegment {
  const kind = isFields(value) ? value.kind : undefined;
  if (kind === 'independent') return independentAt(value);
  if (kind === 'multiplexed') return multiplexedAt(value);
  return reject('sevenSegment.kind must be "independent" or "multiplexed"');
}

const BOARD_FIELDS = ['version', 'clock', 'clock500Hz', 'switches', 'pushbuttons', 'leds', 'sevenSegment'];

/** The board a JSON body describes, every field checked; `version` must be `expectedVersion`. */
export function readBoardIo(value: unknown, expectedVersion: number): BoardIo {
  if (isFields(value) && value.version !== expectedVersion) reject(`version must be ${expectedVersion}, got ${JSON.stringify(value.version)}`);
  const body = objectAt('board', value, { required: BOARD_FIELDS, optional: ['resetButton'] });
  const clock = objectAt('clock', body.clock, { required: ['port', 'mhz'] });
  const board: BoardIo = {
    clock: { port: nameAt('clock.port', clock.port), mhz: mhzAt('clock.mhz', clock.mhz) },
    clock500Hz: nameAt('clock500Hz', body.clock500Hz),
    switches: vectorAt('switches', body.switches, SWITCH_LIMIT),
    pushbuttons: buttonsAt(body.pushbuttons),
    leds: vectorAt('leds', body.leds, LED_LIMIT),
    sevenSegment: sevenSegmentAt(body.sevenSegment),
  };
  return body.resetButton === undefined ? board : { ...board, resetButton: resetAt(body.resetButton) };
}

/** One board serves both languages, and VHDL ignores case: `Key` and `KEY` would be one port. */
export function checkNamesUnique(board: BoardIo): void {
  const bindings = boardBindings(board);
  const duplicate = bindings.find((binding, index) => bindings.findIndex((other) => other.key === binding.key) !== index);
  if (duplicate !== undefined) reject(`${JSON.stringify(duplicate.name)} is used twice (names ignore case)`);
}
