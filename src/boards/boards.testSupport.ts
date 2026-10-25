// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Lookups for the board tests that fail loudly instead of asserting a value is there. */

import { languageOfName, type Language } from '../components/workbench/fileKinds';
import { parseBoardFile } from './parseBoards';
import type { BoardDefinition } from './types';

/** The HDL language of a built-in file; a name of no language is a bug in the test data. */
export function languageOf(fileName: string): Language {
  const language = languageOfName(fileName);
  if (language === undefined) throw new Error(`${fileName} is not an HDL file`);
  return language;
}

/** The one item of `items` that `matches`; none is a bug in the test data. */
export function theOne<T>(items: readonly T[], matches: (item: T) => boolean, what: string): T {
  const found = items.find(matches);
  if (found === undefined) throw new Error(`No ${what}`);
  return found;
}

/**
 * Boards that exist only in tests (docs/board_io_v2_spec.md § 12): a multiplexed display
 * with no decimal point, for the 7-bit path; a 74.25 MHz clock, for the picosecond half
 * period; and the Course board of docs/BOARDS.md, a v2 user board with scalar buttons.
 */
export const TEST_BOARD_FILE = {
  version: 2,
  boards: [
    {
      id: 'mux-no-point',
      name: 'Mux without point',
      ports: {
        clock: 'CLK',
        switches: { port: 'SW', count: 8 },
        pushbuttons: { port: 'BTN', count: 4, activeLow: false },
        leds: { port: 'LED', count: 8 },
        sevenSegment: { kind: 'multiplexed', segments: 'SEG', digitEnables: 'AN', digits: 4, activeLow: true, digitEnablesActiveLow: true },
      },
    },
    {
      id: 'video-clock',
      name: 'Video clock',
      ports: {
        clock: 'PIXEL_CLK',
        clockMHz: 74.25,
        switches: { port: 'SW', count: 10 },
        pushbuttons: { port: 'KEY', count: 4, activeLow: true },
        leds: { port: 'LEDR', count: 10 },
        sevenSegment: { kind: 'independent', ports: ['HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5'], width: 7, activeLow: true },
      },
    },
    {
      id: 'course',
      name: 'Course board',
      description: 'Our lab: three scalar buttons and SEG0 … SEG5.',
      ports: {
        clock: 'CLOCK_50',
        switches: { port: 'SW', count: 10 },
        pushbuttons: { ports: ['BTN0', 'BTN1', 'BTN2'], activeLow: true },
        leds: { port: 'LEDR', count: 10 },
        sevenSegment: { kind: 'independent', ports: ['SEG0', 'SEG1', 'SEG2', 'SEG3', 'SEG4', 'SEG5'], width: 7, activeLow: true },
      },
      labels: { pushbuttons: 'BTN', sevenSegment: 'SEG' },
    },
  ],
} as const;

/** A test-only board by id, parsed as a user board; a missing one is a bug in the test data. */
export function testBoard(id: string): BoardDefinition {
  const parsed = parseBoardFile(JSON.stringify(TEST_BOARD_FILE), { fileName: 'test-boards.json', origin: 'user' });
  if (parsed.warnings.length > 0) throw new Error(`Invalid test boards: ${parsed.warnings.join(' ')}`);
  return theOne(parsed.boards, (board) => board.id === id, `test board "${id}"`);
}
