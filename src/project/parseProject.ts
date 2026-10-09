// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { fileNameProblem, nameKey } from './fileName';
import {
  SUPPORTED_PROJECT_VERSION,
  type Diagnostic,
  type HdlBoardProject,
  type ProjectFileEntry,
  type SkippedEntry,
} from './types';
import { isPlainHttpUrl, urlProblem } from './url';

/** Boards built into HDLBoard. Stage 2 passes HDLBoard's own list instead. */
export const DEFAULT_KNOWN_BOARDS = ['DE1-SoC'] as const;

/** Thrown when a project file cannot be loaded at all (§ 7, "Error" rows). */
export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

export interface ParseOptions {
  knownBoards?: readonly string[];
}

export interface ParsedProject {
  /** The project with only the accepted file entries. */
  project: HdlBoardProject;
  /** The board to use: the matching known board, or the default board (§ 4.2). */
  board: string;
  warnings: Diagnostic[];
  skipped: SkippedEntry[];
}

const REQUIRED_FIELDS = ['version', 'name', 'board', 'description', 'files'] as const;

/** Parses and validates a project file (§ 7). Throws {@link ProjectError} on errors. */
export function parseProject(json: string, options: ParseOptions = {}): ParsedProject {
  const raw = parseJsonObject(json);
  requireTopLevelFields(raw);

  const warnings: Diagnostic[] = [];
  const board = resolveBoard(raw.board as string, options.knownBoards ?? DEFAULT_KNOWN_BOARDS, warnings);
  const { files, skipped } = parseFileEntries(raw.files as unknown[], warnings);

  const project: HdlBoardProject = {
    version: raw.version as number,
    name: raw.name as string,
    board: raw.board as string,
    description: raw.description as string,
    files,
  };
  return { project, board, warnings, skipped };
}

function parseJsonObject(json: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new ProjectError(`Invalid JSON: ${(error as Error).message}`);
  }
  if (!isObject(value)) throw new ProjectError('Invalid project file: the top level must be a JSON object');
  return value;
}

function requireTopLevelFields(raw: Record<string, unknown>): void {
  const missing = REQUIRED_FIELDS.filter((field) => !(field in raw));
  if (missing.length > 0) throw new ProjectError(`Missing required field(s): ${missing.join(', ')}`);

  if (typeof raw.version !== 'number') throw new ProjectError('"version" must be a number');
  if (raw.version !== SUPPORTED_PROJECT_VERSION) {
    throw new ProjectError(
      `Unsupported project file version ${raw.version}; supported version is ${SUPPORTED_PROJECT_VERSION}`,
    );
  }
  for (const field of ['name', 'board', 'description'] as const) {
    if (typeof raw[field] !== 'string') throw new ProjectError(`"${field}" must be a string`);
  }
  if (!Array.isArray(raw.files)) throw new ProjectError('"files" must be an array');
}

function resolveBoard(board: string, knownBoards: readonly string[], warnings: Diagnostic[]): string {
  const match = knownBoards.find((known) => nameKey(known) === nameKey(board));
  if (match) return match;

  const fallback = knownBoards[0] ?? board;
  warnings.push({ severity: 'warning', message: `Unknown board "${board}"; using the default board "${fallback}"` });
  return fallback;
}

function parseFileEntries(rawEntries: unknown[], warnings: Diagnostic[]) {
  const files: ProjectFileEntry[] = [];
  const skipped: SkippedEntry[] = [];
  const seen = new Set<string>();

  rawEntries.forEach((rawEntry, index) => {
    const label = entryLabel(rawEntry, index);
    const problem = entryProblem(rawEntry, seen);
    if (problem) {
      skipped.push({ name: label, reason: problem });
      warnings.push({ severity: 'warning', fileName: label, message: `File "${label}" skipped: ${problem}` });
      return;
    }

    const entry = toEntry(rawEntry as Record<string, unknown>, warnings);
    seen.add(nameKey(entry.name));
    files.push(entry);
  });
  return { files, skipped };
}

function entryProblem(rawEntry: unknown, seen: Set<string>): string | null {
  if (!isObject(rawEntry)) return 'entry is not an object';
  if (typeof rawEntry.name !== 'string') return 'missing "name"';
  if (typeof rawEntry.url !== 'string') return 'missing "url" (it must be present, but may be empty)';

  const nameProblem = fileNameProblem(rawEntry.name);
  if (nameProblem) return nameProblem;
  if (seen.has(nameKey(rawEntry.name))) return 'duplicate file name (names are compared case-insensitively)';
  if (rawEntry.url !== '') return urlProblem(rawEntry.url);
  return null;
}

function toEntry(rawEntry: Record<string, unknown>, warnings: Diagnostic[]): ProjectFileEntry {
  const name = rawEntry.name as string;
  const url = rawEntry.url as string;
  if (isPlainHttpUrl(url)) {
    warnings.push({ severity: 'warning', fileName: name, message: `File "${name}" uses plain http://; prefer https://` });
  }
  if (typeof rawEntry.description === 'string') return { name, url, description: rawEntry.description };

  warnings.push({ severity: 'warning', fileName: name, message: `File "${name}" has no description` });
  return { name, url, description: '' };
}

function entryLabel(rawEntry: unknown, index: number): string {
  if (isObject(rawEntry) && typeof rawEntry.name === 'string' && rawEntry.name !== '') return rawEntry.name;
  return `entry #${index + 1}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Serializes a project the way it is written to disk. */
export function serializeProject(project: HdlBoardProject): string {
  const ordered: HdlBoardProject = {
    version: project.version,
    name: project.name,
    board: project.board,
    description: project.description,
    files: project.files.map(({ name, url, description }) => ({ name, url, description })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
