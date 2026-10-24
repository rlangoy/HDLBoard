// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reads a board file (docs/board_io_config_spec.md § 4.2, § 4.4): the built-in one and
 * the user's `boards/boards.json` alike. Never throws. A file that is not a version-1
 * board file gives one warning and no boards; a board that breaks a rule is skipped
 * with a warning that names it and its JSON path, and the other boards still load.
 */

import { isObject } from '../project/jsonValue';
import { labelProblem, portNameProblem } from './boardNames';
import {
  BOARD_ROLES,
  LABELLED_ROLES,
  type BoardDefinition,
  type BoardLabels,
  type BoardPorts,
  type BoardRole,
  type LabelledRole,
  type ParsedBoards,
} from './types';

export const BOARD_FILE_VERSION = 1;
export const SEVEN_SEGMENT_NAME_COUNT = 6;

/** The 500 Hz clock is simulator-provided, so a board file need not invent a name for it. */
export const DEFAULT_CLOCK_500HZ_NAME = 'CLOCK_500Hz';
export const DEFAULT_LABELS: BoardLabels = { switches: 'SW', pushbuttons: 'KEY', leds: 'LEDR', sevenSegment: 'HEX' };

const BOARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 32;
const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 140;
const BOARD_KEYS: readonly string[] = ['id', 'name', 'description', 'ports', 'labels'];
const OPTIONAL_ROLES: readonly BoardRole[] = ['clock500Hz'];

/** Where a board file comes from: its name in warnings, and the origin of its boards. */
export interface BoardFileSource {
  readonly fileName: string;
  readonly origin: BoardDefinition['origin'];
}

/** A value, or why there is none — the first problem found. */
type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string };

const valid = <T>(value: T): Checked<T> => ({ ok: true, value });
const invalid = (problem: string): Checked<never> => ({ ok: false, problem });
const quoted = (value: unknown): string => JSON.stringify(value);

export function parseBoardFile(text: string, source: BoardFileSource): ParsedBoards {
  const file = parseFileShape(text);
  if (!file.ok) return { boards: [], warnings: [`${source.fileName} ${file.problem}.`] };

  const boards: BoardDefinition[] = [];
  const warnings: string[] = [];
  file.value.forEach((raw, index) => {
    const board = parseBoard(raw, source.origin);
    const problem = board.ok ? clashWithEarlier(board.value, boards) : board.problem;
    if (problem === undefined && board.ok) boards.push(board.value);
    else warnings.push(skippedWarning(source.fileName, index, raw, problem ?? ''));
  });
  return { boards, warnings };
}

/** `boards/boards.json: boards[2] "de10" was skipped: ports.sevenSegment needs exactly 6 names (found 8).` */
export function skippedWarning(fileName: string, index: number, raw: unknown, problem: string): string {
  const id = isObject(raw) && typeof raw.id === 'string' ? ` ${quoted(raw.id)}` : '';
  return `${fileName}: boards[${index}]${id} was skipped: ${problem}.`;
}

/** The `boards` array of a version-1 board file. */
function parseFileShape(text: string): Checked<readonly unknown[]> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return invalid(`is not valid JSON (${(error as Error).message})`);
  }
  if (!isObject(json)) return invalid('is not a board file: the top level must be a JSON object');
  if (json.version !== BOARD_FILE_VERSION) {
    return invalid(`is not a version-${BOARD_FILE_VERSION} board file ("version" is ${quoted(json.version) ?? 'missing'})`);
  }
  if (!Array.isArray(json.boards)) return invalid('is not a board file: "boards" must be an array');
  return valid(json.boards);
}

/** The board an entry of the file defines, with its defaults filled in. */
function parseBoard(raw: unknown, origin: BoardDefinition['origin']): Checked<BoardDefinition> {
  if (!isObject(raw)) return invalid('it is not an object');
  const unknownKey = Object.keys(raw).find((key) => !BOARD_KEYS.includes(key));
  if (unknownKey !== undefined) return invalid(`${quoted(unknownKey)} is not a board field (the fields are ${BOARD_KEYS.join(', ')})`);

  const id = parseId(raw.id);
  if (!id.ok) return id;
  const name = parseName(raw.name);
  if (!name.ok) return name;
  const description = parseDescription(raw.description);
  if (!description.ok) return description;
  const ports = parsePorts(raw.ports);
  if (!ports.ok) return ports;
  const labels = parseLabels(raw.labels);
  if (!labels.ok) return labels;
  return valid({ id: id.value, name: name.value, description: description.value, ports: ports.value, labels: labels.value, origin });
}

function parseId(value: unknown): Checked<string> {
  if (typeof value !== 'string') return invalid('"id" must be a string');
  if (value.length > MAX_ID_LENGTH) return invalid(`"id" is longer than ${MAX_ID_LENGTH} characters`);
  if (!BOARD_ID.test(value)) return invalid(`"id" ${quoted(value)} must be lower-case letters and digits, joined by single hyphens`);
  return valid(value);
}

function parseName(value: unknown): Checked<string> {
  if (typeof value !== 'string' || value.trim() === '') return invalid('"name" must be a non-empty string');
  if (value.length > MAX_NAME_LENGTH) return invalid(`"name" is longer than ${MAX_NAME_LENGTH} characters`);
  return valid(value);
}

function parseDescription(value: unknown): Checked<string> {
  if (value === undefined) return valid('');
  if (typeof value !== 'string') return invalid('"description" must be a string');
  if (value.length > MAX_DESCRIPTION_LENGTH) return invalid(`"description" is longer than ${MAX_DESCRIPTION_LENGTH} characters`);
  return valid(value);
}

function parsePorts(value: unknown): Checked<BoardPorts> {
  if (!isObject(value)) return invalid('"ports" must be an object');
  const unknownRole = Object.keys(value).find((key) => !(BOARD_ROLES as readonly string[]).includes(key));
  if (unknownRole !== undefined) return invalid(`ports.${unknownRole} is not a role (the roles are ${BOARD_ROLES.join(', ')})`);
  const missingRole = BOARD_ROLES.find((role) => !(role in value) && !OPTIONAL_ROLES.includes(role));
  if (missingRole !== undefined) return invalid(`ports.${missingRole} is missing`);

  const singles: Record<string, unknown> = { ...value, clock500Hz: value.clock500Hz ?? DEFAULT_CLOCK_500HZ_NAME };
  for (const role of BOARD_ROLES) {
    const problem = role === 'sevenSegment' ? sevenSegmentProblem(value.sevenSegment) : singleNameProblem(role, singles[role]);
    if (problem !== undefined) return invalid(problem);
  }
  const ports = singles as unknown as BoardPorts;
  const duplicate = duplicateNameProblem(ports);
  return duplicate === undefined ? valid(ports) : invalid(duplicate);
}

function singleNameProblem(role: BoardRole, name: unknown): string | undefined {
  if (typeof name !== 'string') return `ports.${role} must be a string (one port name)`;
  const problem = portNameProblem(name);
  return problem === undefined ? undefined : `ports.${role} ${quoted(name)} ${problem}`;
}

function sevenSegmentProblem(names: unknown): string | undefined {
  if (!Array.isArray(names)) return `ports.sevenSegment must be an array of ${SEVEN_SEGMENT_NAME_COUNT} names`;
  if (names.length !== SEVEN_SEGMENT_NAME_COUNT) {
    return `ports.sevenSegment needs exactly ${SEVEN_SEGMENT_NAME_COUNT} names (found ${names.length})`;
  }
  const index = names.findIndex((name) => typeof name !== 'string' || portNameProblem(name) !== undefined);
  if (index < 0) return undefined;
  const name: unknown = names[index];
  if (typeof name !== 'string') return `ports.sevenSegment[${index}] must be a string`;
  return `ports.sevenSegment[${index}] ${quoted(name)} ${portNameProblem(name)}`;
}

/** Every port name with its JSON path, in role order. */
function namedPorts(ports: BoardPorts): { path: string; name: string }[] {
  return BOARD_ROLES.flatMap((role) =>
    role === 'sevenSegment'
      ? ports.sevenSegment.map((name, index) => ({ path: `ports.sevenSegment[${index}]`, name }))
      : [{ path: `ports.${role}`, name: ports[role] }],
  );
}

/** VHDL sees `Key` and `KEY` as one port, so a board's names must differ ignoring case. */
function duplicateNameProblem(ports: BoardPorts): string | undefined {
  const seen = new Map<string, string>();
  for (const { path, name } of namedPorts(ports)) {
    const earlier = seen.get(name.toLowerCase());
    if (earlier !== undefined) return `${path} ${quoted(name)} is the same name as ${earlier} (names ignore case)`;
    seen.set(name.toLowerCase(), `${path} ${quoted(name)}`);
  }
  return undefined;
}

function parseLabels(value: unknown): Checked<BoardLabels> {
  if (value === undefined) return valid(DEFAULT_LABELS);
  if (!isObject(value)) return invalid('"labels" must be an object');
  const unknownRole = Object.keys(value).find((key) => !(LABELLED_ROLES as readonly string[]).includes(key));
  if (unknownRole !== undefined) {
    return invalid(`labels.${unknownRole} is not a labelled role (the labelled roles are ${LABELLED_ROLES.join(', ')})`);
  }
  const labels: Record<LabelledRole, string> = { ...DEFAULT_LABELS };
  for (const role of LABELLED_ROLES) {
    const label = value[role];
    if (label === undefined) continue;
    if (typeof label !== 'string') return invalid(`labels.${role} must be a string`);
    const problem = labelProblem(label);
    if (problem !== undefined) return invalid(`labels.${role} ${quoted(label)} ${problem}`);
    labels[role] = label;
  }
  return valid(labels);
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
