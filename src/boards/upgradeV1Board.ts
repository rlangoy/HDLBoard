// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A version-1 board, rewritten as the version-2 board it always meant
 * (docs/board_io_v2_spec.md § 3.5). Version 1 fixed the shape — 10 switches, 4
 * active-low keys, 10 LEDs, six 7-bit active-low displays, 50 MHz — and named the
 * ports only. The v1 rules are checked here, with v1 paths, so a v1 author reads
 * about the file they wrote; the v2 checks then run on the result.
 */

import { isObject } from '../project/jsonValue';
import { checkBoard, fail, nameAt, objectAt, quoted, valid, type Checked } from './boardFileReader';

/** The shape every version-1 board had. */
const V1_SHAPE = { switches: 10, pushbuttons: 4, leds: 10, displays: 6, segments: 7, mhz: 50 } as const;

const V1_ROLES = {
  required: ['clock50', 'switches', 'pushbuttons', 'leds', 'sevenSegment'],
  optional: ['clock500Hz'],
  noun: 'role',
} as const;

/**
 * The v2 form of a v1 board entry. Only `ports` changes; an entry without an object
 * there is left for the board checks, which report it as they would for v2.
 */
export function upgradeV1Board(raw: unknown): Checked<unknown> {
  if (!isObject(raw) || !isObject(raw.ports)) return valid(raw);
  const ports = raw.ports;
  return checkBoard(() => ({ ...raw, ports: upgradePorts(objectAt('ports', ports, V1_ROLES)) }));
}

function upgradePorts(ports: Record<string, unknown>): Record<string, unknown> {
  const upgraded = {
    clock: nameAt('ports.clock50', ports.clock50),
    clockMHz: V1_SHAPE.mhz,
    switches: { port: nameAt('ports.switches', ports.switches), count: V1_SHAPE.switches },
    pushbuttons: { port: nameAt('ports.pushbuttons', ports.pushbuttons), count: V1_SHAPE.pushbuttons, activeLow: true },
    leds: { port: nameAt('ports.leds', ports.leds), count: V1_SHAPE.leds },
    sevenSegment: { kind: 'independent', ports: displayNames(ports.sevenSegment), width: V1_SHAPE.segments, activeLow: true },
  };
  return ports.clock500Hz === undefined ? upgraded : { ...upgraded, clock500Hz: nameAt('ports.clock500Hz', ports.clock500Hz) };
}

function displayNames(names: unknown): string[] {
  if (!Array.isArray(names)) fail(`ports.sevenSegment must be an array of ${V1_SHAPE.displays} names`, 'ports.sevenSegment');
  if (names.length !== V1_SHAPE.displays) fail(`ports.sevenSegment needs exactly ${V1_SHAPE.displays} names (found ${names.length})`, 'ports.sevenSegment');
  return names.map((name, index) => {
    if (typeof name !== 'string') fail(`ports.sevenSegment[${index}] must be a string, not ${quoted(name)}`, `ports.sevenSegment[${index}]`);
    return nameAt(`ports.sevenSegment[${index}]`, name);
  });
}
