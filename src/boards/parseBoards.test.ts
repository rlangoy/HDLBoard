// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import builtinBoardFile from './builtinBoards.json';
import { BUILT_IN_BOARDS, loadUserBoards, mergeCatalog, findBoard, type FetchedText } from './boardCatalog';
import { DEFAULT_LABELS, parseBoardFile } from './parseBoards';
import shippedUserFile from '../../public/boards/boards.json?raw';
import shippedSchema from '../../public/boards/board.schema.json?raw';

const USER = { fileName: 'boards/boards.json', origin: 'user' } as const;

const VALID_PORTS = {
  clock50: 'CLK',
  switches: 'SWITCH',
  pushbuttons: 'BUTTON',
  leds: 'LED',
  sevenSegment: ['SEG0', 'SEG1', 'SEG2', 'SEG3', 'SEG4', 'SEG5'],
};

function boardJson(overrides: Record<string, unknown> = {}, ports: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'course', name: 'Course board', ports: { ...VALID_PORTS, ...ports }, ...overrides };
}

function parseOne(board: unknown) {
  return parseBoardFile(JSON.stringify({ version: 1, boards: [board] }), USER);
}

/** The one warning a single invalid board gives. */
function problemOf(board: unknown): string {
  const parsed = parseOne(board);
  expect(parsed.boards).toEqual([]);
  expect(parsed.warnings).toHaveLength(1);
  return parsed.warnings[0];
}

describe('parseBoardFile', () => {
  it('parses both built-in boards', () => {
    expect(BUILT_IN_BOARDS.map((board) => board.id)).toEqual(['default', 'de1-soc']);
    const de1 = BUILT_IN_BOARDS[1];
    expect(de1.ports.pushbuttons).toBe('KEY');
    expect(de1.ports.sevenSegment).toEqual(['HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5']);
  });

  it('fills in the 500 Hz clock and the labels when they are left out', () => {
    const { boards } = parseOne(boardJson());
    expect(boards[0].ports.clock500Hz).toBe('CLOCK_500Hz');
    expect(boards[0].labels).toEqual(DEFAULT_LABELS);
    expect(boards[0].origin).toBe('user');
  });

  it('keeps a 500 Hz clock name and labels the file gives', () => {
    const { boards } = parseOne(boardJson({ labels: { pushbuttons: 'BTN' } }, { clock500Hz: 'SLOW_CLK' }));
    expect(boards[0].ports.clock500Hz).toBe('SLOW_CLK');
    expect(boards[0].labels.pushbuttons).toBe('BTN');
    expect(boards[0].labels.switches).toBe('SW');
  });

  it('names the file, the board and the JSON path in a warning', () => {
    expect(problemOf(boardJson({ id: 'de10' }, { sevenSegment: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'] }))).toBe(
      'boards/boards.json: boards[0] "de10" was skipped: ports.sevenSegment needs exactly 6 names (found 8).',
    );
  });

  it.each([
    ['a bad id', boardJson({ id: 'DE10_Lite' }), '"id" "DE10_Lite" must be lower-case'],
    ['a missing name', boardJson({ name: '' }), '"name" must be a non-empty string'],
    ['a missing role', { id: 'x', name: 'X', ports: { ...VALID_PORTS, leds: undefined } }, 'ports.leds is missing'],
    ['an unknown role', boardJson({}, { buttons: 'B' }), 'ports.buttons is not a role'],
    ['an unknown field', boardJson({ lables: {} }), '"lables" is not a board field'],
    ['5 display names', boardJson({}, { sevenSegment: ['A', 'B', 'C', 'D', 'E'] }), 'needs exactly 6 names (found 5)'],
    ['7 display names', boardJson({}, { sevenSegment: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }), 'needs exactly 6 names (found 7)'],
    ['a double underscore', boardJson({}, { pushbuttons: 'KEY__N' }), 'ports.pushbuttons "KEY__N" is not a plain identifier'],
    ['a trailing underscore', boardJson({}, { pushbuttons: 'KEY_' }), 'ports.pushbuttons "KEY_" is not a plain identifier'],
    ['a leading digit', boardJson({}, { pushbuttons: '1KEY' }), 'ports.pushbuttons "1KEY" is not a plain identifier'],
    ['a VHDL reserved word', boardJson({}, { leds: 'signal' }), 'ports.leds "signal" is a VHDL reserved word'],
    ['a Verilog reserved word', boardJson({}, { leds: 'wire' }), 'ports.leds "wire" is a Verilog reserved word'],
    ['the legacy reset', boardJson({}, { leds: 'rst' }), 'ports.leds "rst" is reserved'],
    ['a display name in error', boardJson({}, { sevenSegment: ['A0', 'A1', 'A 2', 'A3', 'A4', 'A5'] }), 'ports.sevenSegment[2] "A 2"'],
    ['Key and KEY in one board', boardJson({}, { switches: 'Key', pushbuttons: 'KEY' }), 'is the same name as ports.switches "Key" (names ignore case)'],
    ['a 9-character label', boardJson({ labels: { leds: 'LONGLABEL' } }), 'labels.leds "LONGLABEL" is longer than 8 characters'],
    ['an unknown label', boardJson({ labels: { clock50: 'CLK' } }), 'labels.clock50 is not a labelled role'],
  ])('skips a board with %s', (_case, board, expected) => {
    expect(problemOf(board)).toContain(expected);
  });

  it('skips a later board whose id or name is taken, ignoring case for names', () => {
    const parsed = parseBoardFile(
      JSON.stringify({
        version: 1,
        boards: [boardJson(), boardJson({ name: 'Other' }), boardJson({ id: 'other', name: 'COURSE BOARD' })],
      }),
      USER,
    );
    expect(parsed.boards.map((board) => board.id)).toEqual(['course']);
    expect(parsed.warnings[0]).toContain('boards[1] "course" was skipped: the id "course" is already used.');
    expect(parsed.warnings[1]).toContain('the name "COURSE BOARD" is already used.');
  });

  it('loads the other boards when one is invalid', () => {
    const parsed = parseBoardFile(JSON.stringify({ version: 1, boards: [boardJson({ id: 'bad!' }), boardJson()] }), USER);
    expect(parsed.boards.map((board) => board.id)).toEqual(['course']);
    expect(parsed.warnings).toHaveLength(1);
  });

  it.each([
    ['not JSON', '{ "version": 1,', 'boards/boards.json is not valid JSON'],
    ['not an object', '[]', 'the top level must be a JSON object'],
    ['another version', '{ "version": 2, "boards": [] }', 'is not a version-1 board file ("version" is 2)'],
    ['no boards array', '{ "version": 1 }', '"boards" must be an array'],
  ])('rejects a whole file that is %s, with one warning', (_case, text, expected) => {
    const parsed = parseBoardFile(text, USER);
    expect(parsed.boards).toEqual([]);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain(expected);
  });

  it('ships a user board file that parses with no warnings', () => {
    expect(parseBoardFile(shippedUserFile, USER)).toEqual({ boards: [], warnings: [] });
  });

  it('agrees with the schema shipped for editors about the built-in boards', () => {
    const schema = JSON.parse(shippedSchema);
    const boardSchema = schema.$defs.board;
    for (const board of builtinBoardFile.boards) {
      for (const field of boardSchema.required) expect(board).toHaveProperty(field);
      for (const field of Object.keys(board)) expect(Object.keys(boardSchema.properties)).toContain(field);
      for (const role of schema.$defs.ports.required) expect(board.ports).toHaveProperty(role);
      expect(board.id).toMatch(new RegExp(boardSchema.properties.id.pattern));
    }
  });
});

describe('the catalog', () => {
  const user = (boards: unknown[]): string => JSON.stringify({ version: 1, boards });
  const respond = (fetched: FetchedText) => () => Promise.resolve(fetched);

  it('keeps the built-ins first and skips a user board that takes a built-in id', () => {
    const parsed = parseBoardFile(user([boardJson({ id: 'default', name: 'Mine' }), boardJson()]), USER);
    const catalog = mergeCatalog(BUILT_IN_BOARDS, parsed);
    expect(catalog.boards.map((board) => board.id)).toEqual(['default', 'de1-soc', 'course']);
    expect(catalog.warnings).toEqual(['boards/boards.json: board "default" was skipped: the id "default" is already used by a built-in board.']);
  });

  it('finds an installed board, and falls back to Default for one that is not', () => {
    const catalog = mergeCatalog(BUILT_IN_BOARDS, { boards: [], warnings: [] });
    expect(findBoard(catalog, 'de1-soc')).toMatchObject({ installed: true, board: { name: 'DE1-SoC' } });
    expect(findBoard(catalog, 'de10-lite')).toMatchObject({ installed: false, board: { id: 'default' } });
  });

  it('treats a missing user file as no boards and no warning', async () => {
    expect(await loadUserBoards(respond({ kind: 'missing' }))).toEqual({ boards: [], warnings: [] });
  });

  it.each([
    ['an HTTP error', { kind: 'failed', reason: 'HTTP 500' } as FetchedText, 'could not be loaded: HTTP 500.'],
    ['an empty body', { kind: 'text', text: '  ' } as FetchedText, 'could not be loaded: the file is empty.'],
    ['text that is not JSON', { kind: 'text', text: '<html>' } as FetchedText, 'is not valid JSON'],
  ])('gives one warning for %s', async (_case, fetched, expected) => {
    const parsed = await loadUserBoards(respond(fetched));
    expect(parsed.boards).toEqual([]);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain(expected);
  });

  it('gives one warning when the fetch itself fails, and never throws', async () => {
    const parsed = await loadUserBoards(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(parsed.warnings).toEqual(['boards/boards.json could not be loaded: Failed to fetch.']);
  });

  it('loads the boards of a valid user file', async () => {
    const parsed = await loadUserBoards(respond({ kind: 'text', text: user([boardJson()]) }));
    expect(parsed.boards.map((board) => board.id)).toEqual(['course']);
  });
});
