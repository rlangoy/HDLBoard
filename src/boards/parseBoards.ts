// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reads a board file (docs/board_io_v2_spec.md § 3): the built-in one and the user's
 * `boards/boards.json` alike. Never throws. A file of version 1 or 2 is read; any
 * other gives one warning and no boards. A board that breaks a rule is skipped with a
 * warning that names it and its first problem, and the other boards still load.
 * Version-1 boards are upgraded on the way in (`upgradeV1Board`), so every board comes
 * out as the same normalized `BoardDefinition`.
 */

import { isObject } from '../project/jsonValue';
import { checkBoard, fail, invalid, quoted, valid, type Checked } from './boardFileReader';
import { labelProblem } from './boardNames';
import { readPorts } from './parsePorts';
import { readResources } from './parseResources';
import { LABELLED_ROLES, type BoardDefinition, type BoardLabels, type LabelledRole, type ParsedBoards } from './types';
import { upgradeV1Board } from './upgradeV1Board';

/** The version HDLBoard writes; version 1 is still read. */
export const BOARD_FILE_VERSION = 2;
const READABLE_VERSIONS: readonly number[] = [1, BOARD_FILE_VERSION];

export const DEFAULT_LABELS: BoardLabels = { switches: 'SW', pushbuttons: 'KEY', leds: 'LEDR', sevenSegment: 'HEX' };

const BOARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 32;
const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 140;
const V1_BOARD_FIELDS: readonly string[] = ['id', 'name', 'description', 'ports', 'labels'];
const V2_BOARD_FIELDS: readonly string[] = [...V1_BOARD_FIELDS, 'resources'];

/** Where a board file comes from: its name in warnings, and the origin of its boards. */
export interface BoardFileSource {
  readonly fileName: string;
  readonly origin: BoardDefinition['origin'];
}

interface BoardFile {
  readonly version: number;
  readonly boards: readonly unknown[];
}

/** What every board of one file shares: the file's version, and where its boards come from. */
interface BoardContext {
  readonly version: number;
  readonly origin: BoardDefinition['origin'];
}

export function parseBoardFile(text: string, source: BoardFileSource): ParsedBoards {
  const file = parseFileShape(text);
  if (!file.ok) return { boards: [], warnings: [`${source.fileName} ${file.problem}.`] };

  const boards: BoardDefinition[] = [];
  const warnings: string[] = [];
  file.value.boards.forEach((raw, index) => {
    const board = parseNewBoard(raw, { version: file.value.version, origin: source.origin }, boards);
    if (board.ok) boards.push(board.value);
    else warnings.push(skippedWarning({ fileName: source.fileName, index, raw }, board.problem));
  });
  return { boards, warnings };
}

/** A board of the file, unless it breaks a rule or takes the id or name of one before it. */
function parseNewBoard(raw: unknown, context: BoardContext, earlier: readonly BoardDefinition[]): Checked<BoardDefinition> {
  const board = checkBoard(() => readBoard(raw, context));
  if (!board.ok) return board;
  const clash = clashWithEarlier(board.value, earlier);
  return clash === undefined ? board : invalid(clash);
}

/** Where in a board file an entry is: the file, its index in `boards`, and the entry itself. */
export interface BoardEntry {
  readonly fileName: string;
  readonly index: number;
  readonly raw: unknown;
}

/** `boards/boards.json: boards[2] "lab" was skipped: ports.switches.count: 20 is above the limit of 18.` */
export function skippedWarning({ fileName, index, raw }: BoardEntry, problem: string): string {
  const id = isObject(raw) && typeof raw.id === 'string' ? ` ${quoted(raw.id)}` : '';
  return `${fileName}: boards[${index}]${id} was skipped: ${problem}.`;
}

/** The version and `boards` array of a board file. */
function parseFileShape(text: string): Checked<BoardFile> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return invalid(`is not valid JSON (${(error as Error).message})`);
  }
  if (!isObject(json)) return invalid('is not a board file: the top level must be a JSON object');
  if (typeof json.version !== 'number' || !READABLE_VERSIONS.includes(json.version)) {
    return invalid(`is not a board file of version ${READABLE_VERSIONS.join(' or ')} ("version" is ${quoted(json.version) ?? 'missing'})`);
  }
  if (!Array.isArray(json.boards)) return invalid('is not a board file: "boards" must be an array');
  return valid({ version: json.version, boards: json.boards });
}

/** The board an entry of the file defines, with its defaults filled in. */
function readBoard(entry: unknown, { version, origin }: BoardContext): BoardDefinition {
  if (!isObject(entry)) fail('it is not an object');
  const fields = version === 1 ? V1_BOARD_FIELDS : V2_BOARD_FIELDS;
  const unknownKey = Object.keys(entry).find((key) => !fields.includes(key));
  if (unknownKey !== undefined) fail(`${quoted(unknownKey)} is not a board field (the fields are ${fields.join(', ')})`);
  const raw = version === 1 ? upgraded(entry) : entry;
  return {
    id: readId(raw.id),
    name: readName(raw.name),
    description: readDescription(raw.description),
    ports: readPorts(raw.ports),
    labels: readLabels(raw.labels),
    resources: readResources(raw.resources),
    origin,
  };
}

function upgraded(entry: Record<string, unknown>): Record<string, unknown> {
  const result = upgradeV1Board(entry);
  if (!result.ok) fail(result.problem);
  return result.value as Record<string, unknown>;
}

function readId(value: unknown): string {
  if (typeof value !== 'string') fail('"id" must be a string');
  if (value.length > MAX_ID_LENGTH) fail(`"id" is longer than ${MAX_ID_LENGTH} characters`);
  if (!BOARD_ID.test(value)) fail(`"id" ${quoted(value)} must be lower-case letters and digits, joined by single hyphens`);
  return value;
}

function readName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') fail('"name" must be a non-empty string');
  if (value.length > MAX_NAME_LENGTH) fail(`"name" is longer than ${MAX_NAME_LENGTH} characters`);
  return value;
}

function readDescription(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') fail('"description" must be a string');
  if (value.length > MAX_DESCRIPTION_LENGTH) fail(`"description" is longer than ${MAX_DESCRIPTION_LENGTH} characters`);
  return value;
}

function readLabels(value: unknown): BoardLabels {
  if (value === undefined) return DEFAULT_LABELS;
  if (!isObject(value)) fail('"labels" must be an object');
  const unknownRole = Object.keys(value).find((key) => !(LABELLED_ROLES as readonly string[]).includes(key));
  if (unknownRole !== undefined) fail(`labels.${unknownRole} is not a labelled role (the labelled roles are ${LABELLED_ROLES.join(', ')})`);
  const labels: Record<LabelledRole, string> = { ...DEFAULT_LABELS };
  for (const role of LABELLED_ROLES) {
    const label = value[role];
    if (label === undefined) continue;
    if (typeof label !== 'string') fail(`labels.${role} must be a string`);
    const problem = labelProblem(label);
    if (problem !== undefined) fail(`labels.${role} ${quoted(label)} ${problem}`);
    labels[role] = label;
  }
  return labels;
}

/**
 * Why `board` cannot join `earlier`: its id is taken, or its name (ignoring case) — two
 * radio buttons with the same text could not be told apart.
 */
export function clashWithEarlier(board: BoardDefinition, earlier: readonly BoardDefinition[]): string | undefined {
  const byId = earlier.find((other) => other.id === board.id);
  if (byId !== undefined) return `the id ${quoted(board.id)} is already used${originNote(byId)}`;
  const byName = earlier.find((other) => other.name.toLowerCase() === board.name.toLowerCase());
  if (byName !== undefined) return `the name ${quoted(board.name)} is already used${originNote(byName)}`;
  return undefined;
}

const originNote = (board: BoardDefinition): string => (board.origin === 'built-in' ? ' by a built-in board' : '');
