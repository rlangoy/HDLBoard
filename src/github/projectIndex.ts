// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  asRecord,
  parseJsonObject,
  readArray,
  readOptionalString,
  readString,
  requireVersion,
  toPrettyJson,
} from './jsonDocument';

/**
 * The list of a user's HDLBoard projects, `Repo.HDLBoard.json` in its own gist
 * (docs/GITHUB.md). Pure: no I/O.
 */

export const INDEX_FILE_NAME = 'Repo.HDLBoard.json';
export const INDEX_GIST_DESCRIPTION = 'HDLBoard project index';
const INDEX_FORMAT_VERSION = 1;

export interface IndexEntry {
  name: string;
  description: string;
  /** The project gist's `html_url`. */
  url: string;
  gistId: string;
  /** ISO 8601 in UTC; empty when unknown. */
  createdAt: string;
  /** ISO 8601 in UTC of the last save from HDLBoard; empty when unknown. */
  updatedAt: string;
}

export interface ProjectIndex {
  version: number;
  projects: IndexEntry[];
}

export function emptyIndex(): ProjectIndex {
  return { version: INDEX_FORMAT_VERSION, projects: [] };
}

export function parseIndex(text: string): ProjectIndex {
  const record = parseJsonObject(text, INDEX_FILE_NAME);
  return {
    version: requireVersion(record, INDEX_FORMAT_VERSION, INDEX_FILE_NAME),
    projects: readArray(record, 'projects', INDEX_FILE_NAME).map((entry, position) =>
      parseEntry(entry, `${INDEX_FILE_NAME} projects[${position}]`),
    ),
  };
}

export function serializeIndex(index: ProjectIndex): string {
  return toPrettyJson(index);
}

/** Adds the entry, or replaces the entry for the same gist and keeps its creation time. */
export function withEntry(index: ProjectIndex, entry: IndexEntry): ProjectIndex {
  const existing = index.projects.find((project) => project.gistId === entry.gistId);
  if (existing === undefined) return { ...index, projects: [...index.projects, entry] };

  const replacement = { ...entry, createdAt: existing.createdAt || entry.createdAt };
  return {
    ...index,
    projects: index.projects.map((project) => (project === existing ? replacement : project)),
  };
}

export function withoutEntry(index: ProjectIndex, gistId: string): ProjectIndex {
  return { ...index, projects: index.projects.filter((project) => project.gistId !== gistId) };
}

/** The most recently saved first; never-saved entries by creation time. */
export function newestFirst(entries: readonly IndexEntry[]): IndexEntry[] {
  const lastChange = (entry: IndexEntry) => entry.updatedAt || entry.createdAt;
  return [...entries].sort((a, b) => lastChange(b).localeCompare(lastChange(a)));
}

function parseEntry(value: unknown, sourceName: string): IndexEntry {
  const record = asRecord(value, sourceName);
  return {
    name: readString(record, 'name', sourceName),
    description: readString(record, 'description', sourceName),
    url: readString(record, 'url', sourceName),
    gistId: readString(record, 'gistId', sourceName),
    createdAt: readOptionalString(record, 'createdAt'),
    updatedAt: readOptionalString(record, 'updatedAt'),
  };
}
