// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Board file version 2: its rules, each with its exact warning, and the v1 upgrade (docs/board_io_v2_spec.md § 3.4, § 3.5). */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BOARD } from './boardCatalog';
import { testBoard } from './boards.testSupport';
import { parseBoardFile } from './parseBoards';

const USER = { fileName: 'boards/boards.json', origin: 'user' } as const;

const VALID_PORTS = {
  clock: 'CLK',
  switches: { port: 'SW', count: 10 },
  pushbuttons: { port: 'KEY', count: 4, activeLow: true },
  leds: { port: 'LEDR', count: 10 },
  sevenSegment: { kind: 'independent', ports: ['HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5'], width: 7 },
};

function lab(ports: Record<string, unknown> = {}, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'lab', name: 'Lab', ports: { ...VALID_PORTS, ...ports }, ...fields };
}

/** The one warning a single invalid v2 board gives. */
function warningFor(board: unknown): string {
  const parsed = parseBoardFile(JSON.stringify({ version: 2, boards: [board] }), USER);
  expect(parsed.boards).toEqual([]);
  expect(parsed.warnings).toHaveLength(1);
  return parsed.warnings[0];
}

const CROSS = { centre: 'BC', up: 'BU', left: 'BL', right: 'BR', down: 'BD' };
const link = (url: string, label = 'Board definitions') => ({ label, url });
const resources = (...links: unknown[]) => lab({}, { resources: links });

describe('parseBoardFile, version 2', () => {
  it.each([
    ['a cross without "down"', lab({ pushbuttons: { cross: { ...CROSS, down: undefined } } }), 'ports.pushbuttons.cross: "down" is missing'],
    ['a cross with an extra key', lab({ pushbuttons: { cross: { ...CROSS, middle: 'BM' } } }), 'ports.pushbuttons.cross.middle is not a position'],
    ['clockMHz 0.5', lab({ clockMHz: 0.5 }), 'ports.clockMHz: 0.5 is not valid; use a number from 1 to 1000 with at most 3 decimals'],
    ['clockMHz 1001', lab({ clockMHz: 1001 }), 'ports.clockMHz: 1001 is not valid'],
    ['clockMHz with 4 decimals', lab({ clockMHz: 74.2501 }), 'ports.clockMHz: 74.2501 is not valid'],
    ['19 switches', lab({ switches: { port: 'SW', count: 19 } }), 'ports.switches.count: 19 is above the limit of 18'],
    ['9 buttons in a list', lab({ pushbuttons: { ports: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] } }), 'ports.pushbuttons.ports: 9 names is above the limit of 8'],
    ['a name used in two roles', lab({ leds: { port: 'sw', count: 10 } }), 'ports.leds.port "sw" is the same name as ports.switches.port "SW" (names ignore case)'],
    [
      'the default 500 Hz clock name as the clock',
      lab({ clock: 'CLOCK_500Hz' }),
      'ports.clock500Hz: "CLOCK_500Hz" is also ports.clock; set clock500Hz to another name',
    ],
    ['two kinds of buttons at once', lab({ pushbuttons: { port: 'KEY', count: 4, cross: CROSS } }), 'needs exactly one of "port" (with "count"), "ports" or "cross"'],
    ['a display width of 9', lab({ sevenSegment: { ...VALID_PORTS.sevenSegment, width: 9 } }), 'ports.sevenSegment.width must be 7 or 8'],
    ['6 scalar segments', lab({ sevenSegment: { kind: 'multiplexed', segments: ['A', 'B', 'C', 'D', 'E', 'F'], digitEnables: 'AN', digits: 4 } }), 'ports.sevenSegment.segments: 6 names is below the minimum of 7'],
    ['an unknown key', lab({ switches: { port: 'SW', count: 10, polarity: 'low' } }), 'ports.switches.polarity is not a field'],
    ['a v1 role in a v2 file', lab({ clock50: 'CLOCK_50' }), 'ports.clock50 is not a role'],
    ['duplicate resource labels', resources(link('https://a.example/x'), link('https://a.example/y')), 'resources: the label "Board definitions" is used twice'],
    ['an http:// resource', resources(link('http://a.example/x')), 'resources[0].url "http://a.example/x" must be an https:// address'],
    ['a javascript: resource', resources(link('javascript:alert(1)')), 'must be an https:// address'],
    ['a data: resource', resources(link('data:text/html,x')), 'must be an https:// address'],
    ['a resource that is not a URL', resources(link('not a url')), 'must be an https:// address'],
    ['a resource URL with a space', resources(link('https://a.example/x y')), 'must be an https:// address'],
    ['a resource URL with a control character', resources(link('https://a.example/x\u0007')), 'must be an https:// address'],
    ['a resource URL of 513 characters', resources(link(`https://a.example/${'x'.repeat(513 - 18)}`)), 'resources[0].url is longer than 512 characters'],
    ['five resources', resources(...['a', 'b', 'c', 'd', 'e'].map((label) => link('https://a.example/', label))), 'resources must be an array of at most 4 links'],
  ])('skips a board with %s', (_case, board, expected) => {
    expect(warningFor(board)).toContain(expected);
  });

  it('reads a 512-character https URL and a 74.25 MHz clock', () => {
    const url = `https://a.example/${'x'.repeat(512 - 18)}`;
    const parsed = parseBoardFile(JSON.stringify({ version: 2, boards: [lab({ clockMHz: 74.25 }, { resources: [link(url)] })] }), USER);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.boards[0].resources).toEqual([link(url)]);
    expect(parsed.boards[0].ports.clock).toEqual({ port: 'CLK', mhz: 74.25 });
  });

  it('reads a cross in group order, whatever order the file writes its keys in', () => {
    const shuffled = { down: 'BD', right: 'BR', left: 'BL', up: 'BU', centre: 'BC' };
    const [board] = parseBoardFile(JSON.stringify({ version: 2, boards: [lab({ pushbuttons: { cross: shuffled, activeLow: false } })] }), USER).boards;
    expect(board.ports.pushbuttons).toEqual({ group: { kind: 'scalars', ports: ['BC', 'BU', 'BL', 'BR', 'BD'] }, activeLow: false, layout: 'cross' });
  });

  it('loads the Course board of docs/BOARDS.md', () => {
    expect(testBoard('course').ports.pushbuttons.group).toEqual({ kind: 'scalars', ports: ['BTN0', 'BTN1', 'BTN2'] });
  });
});

describe('the version-1 upgrade', () => {
  const v1Default = {
    id: 'old-default',
    name: 'Old default',
    ports: {
      clock50: 'CLOCK_50',
      switches: 'SW',
      pushbuttons: 'KEY_N',
      leds: 'LEDR',
      sevenSegment: ['HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'],
    },
  };

  it('gives a v1 board the same ports as the v2 Default board', () => {
    const parsed = parseBoardFile(JSON.stringify({ version: 1, boards: [v1Default] }), USER);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.boards[0].ports).toEqual(DEFAULT_BOARD.ports);
  });

  it('loads the valid board of a v1 file and warns once about the invalid one', () => {
    const invalid = { ...v1Default, id: 'broken', name: 'Broken', ports: { ...v1Default.ports, pushbuttons: 'KEY__N' } };
    const parsed = parseBoardFile(JSON.stringify({ version: 1, boards: [v1Default, invalid] }), USER);
    expect(parsed.boards.map((board) => board.id)).toEqual(['old-default']);
    expect(parsed.warnings).toEqual([
      'boards/boards.json: boards[1] "broken" was skipped: ports.pushbuttons "KEY__N" is not a plain identifier (a letter, then letters, digits and single underscores).',
    ]);
  });

  it('keeps the v1 rules: resources are a v2 field', () => {
    const parsed = parseBoardFile(JSON.stringify({ version: 1, boards: [{ ...v1Default, resources: [] }] }), USER);
    expect(parsed.warnings[0]).toContain('"resources" is not a board field');
  });
});
