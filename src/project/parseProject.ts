// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { fileNameProblem, folderNameProblem, nameKey } from './fileName';
import { isObject } from './jsonValue';
import {
  CURRENT_PROJECT_VERSION,
  DEFAULT_SOURCE_DIRECTORY,
  SUPPORTED_PROJECT_VERSIONS,
  VERSION_1_BOARD_ID,
  type Diagnostic,
  type HdlBoardProject,
  type ProjectFileEntry,
  type SkippedEntry,
} from './types';
import { isPlainHttpUrl, urlProblem } from './url';
import { parseWaveViews, serializableWaveViews } from './waveViews';
import { parseDisplaySettings } from './displaySettings';

/** Thrown when a project file cannot be loaded at all (§ 7, "Error" rows). */
export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

export interface ParsedProject {
  /** The project with only the accepted file entries, as a current-version project. */
  project: HdlBoardProject;
  warnings: Diagnostic[];
  skipped: SkippedEntry[];
}

const REQUIRED_FIELDS = ['version', 'name', 'board', 'description', 'files'] as const;

/** Parses and validates a project file (§ 7). Throws {@link ProjectError} on errors. */
export function parseProject(json: string): ParsedProject {
  const raw = parseJsonObject(json);
  requireTopLevelFields(raw);
  if (raw.boardConfig !== undefined && !isObject(raw.boardConfig)) throw new ProjectError('"boardConfig" must be a board configuration object');

  const warnings: Diagnostic[] = [];
  const { files, skipped } = parseFileEntries(raw.files as unknown[], warnings);

  const projectDirectory = folderField(raw, 'projectDirectory', warnings);
  const sourceDirectory = folderField(raw, 'sourceDirectory', warnings);
  const waveViews = parseWaveViews(raw.waveViews, warnings);
  const displaySettings = parseDisplaySettings(raw.displaySettings, warnings);

  const project: HdlBoardProject = {
    version: CURRENT_PROJECT_VERSION,
    name: raw.name as string,
    board: boardIdOf(raw.version as number, raw.board as string),
    ...(isObject(raw.boardConfig) ? { boardConfig: raw.boardConfig } : {}),
    description: raw.description as string,
    ...(projectDirectory !== undefined ? { projectDirectory } : {}),
    ...(sourceDirectory !== undefined ? { sourceDirectory } : {}),
    files,
    ...(waveViews !== undefined ? { waveViews } : {}),
    ...(displaySettings !== undefined ? { displaySettings } : {}),
  };
  return { project, warnings, skipped };
}

/**
 * The board a project opens on (docs/board_io_config_spec.md § 10). Every version-1 file
 * was written with the Default board's names, even though it says "DE1-SoC", so it opens
 * on the Default board, with no question and no guessing from its sources. A version-2
 * file names a board id, kept as written even when that board is not installed here.
 */
export function boardIdOf(version: number, board: string): string {
  return version === 1 ? VERSION_1_BOARD_ID : board;
}

/**
 * `projectDirectory` or `sourceDirectory` (docs/impl_project_structure.md § 3.2): the value
 * when it is a valid folder name; undefined when missing, or, with a warning, when invalid.
 */
function folderField(raw: Record<string, unknown>, field: 'projectDirectory' | 'sourceDirectory', warnings: Diagnostic[]): string | undefined {
  if (!(field in raw)) return undefined;
  const value = raw[field];
  const fallback = field === 'projectDirectory' ? 'the project file name' : `"${DEFAULT_SOURCE_DIRECTORY}"`;
  const problem = typeof value === 'string' ? folderNameProblem(value) : 'it is not a string';
  if (problem === null) return value as string;
  warnings.push({ severity: 'warning', message: `"${field}" is not a usable folder (${problem}); using ${fallback}` });
  return undefined;
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
  if (!SUPPORTED_PROJECT_VERSIONS.includes(raw.version)) {
    throw new ProjectError(
      `Unsupported project file version ${raw.version}; supported versions are ${SUPPORTED_PROJECT_VERSIONS.join(' and ')}`,
    );
  }
  for (const field of ['name', 'board', 'description'] as const) {
    if (typeof raw[field] !== 'string') throw new ProjectError(`"${field}" must be a string`);
  }
  if (!Array.isArray(raw.files)) throw new ProjectError('"files" must be an array');
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

/** Serializes a project the way it is written to disk: always as the current version, with the board's id. */
export function serializeProject(project: HdlBoardProject): string {
  const ordered: HdlBoardProject = {
    version: CURRENT_PROJECT_VERSION,
    name: project.name,
    board: project.board,
    ...(project.boardConfig !== undefined ? { boardConfig: project.boardConfig } : {}),
    description: project.description,
    ...(project.projectDirectory !== undefined ? { projectDirectory: project.projectDirectory } : {}),
    ...(project.sourceDirectory !== undefined ? { sourceDirectory: project.sourceDirectory } : {}),
    files: project.files.map(({ name, url, description }) => ({ name, url, description })),
    ...(project.waveViews !== undefined ? { waveViews: serializableWaveViews(project.waveViews) } : {}),
    ...(project.displaySettings !== undefined ? { displaySettings: project.displaySettings } : {}),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
