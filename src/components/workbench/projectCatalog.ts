// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Projects page's lists (docs/project_browse_page.md § 5, issue #44): local and GitHub
 * projects as one kind of item, searched and sorted. Pure — no React, no I/O.
 */

import type { IndexEntry } from '../../github/projectIndex';
import { parseProject } from '../../project/parseProject';
import { baseName, projectFolderName } from '../../project/fileName';
import { languageOfName } from './fileKinds';

export type ProjectLanguage = 'vhdl' | 'verilog';
export type ProjectSource = 'local' | 'github';
export type SortOrder = 'newest' | 'oldest' | 'name';

export const SORT_ORDERS: readonly SortOrder[] = ['newest', 'oldest', 'name'];

export interface CatalogFile {
  name: string;
  description: string;
}

/** What a search looks through: the project's own words and its files'. */
export interface Searchable {
  name: string;
  description: string;
  /** The GitHub login for GitHub projects; '' for local ones. */
  owner: string;
  files: readonly CatalogFile[];
}

/** What a sort orders by. */
export interface Sortable {
  /** Unique in the list. */
  key: string;
  name: string;
  /** ISO 8601, or '' when unknown. */
  updatedAt: string;
}

export interface ProjectListItem extends Searchable, Sortable {
  /** `local:<location>` or `github:<gistId>`. */
  key: string;
  source: ProjectSource;
  files: CatalogFile[];
  /** From the file names, 'vhdl' before 'verilog'; empty when none is a source file. */
  languages: ProjectLanguage[];
  /** Local: the project file's modification time. GitHub: updatedAt, else createdAt. */
  updatedAt: string;
  /** Local: the project file's full path (Windows app) or `<folder>/<sub>/<file>` (browser). GitHub: the gist's address. */
  location: string;
  /** GitHub items only. */
  gistId?: string;
  /** The index entry, so the page can open or delete the project through useGitHubProjects. */
  entry?: IndexEntry;
}

/** Languages of the given file names, each once, 'vhdl' first. */
export function languagesOf(fileNames: readonly string[]): ProjectLanguage[] {
  const found = new Set(fileNames.map(languageOfName));
  return (['vhdl', 'verilog'] as const).filter((language) => found.has(language));
}

// "Shift Register (Verilog)", "Full Adder (VHDL testbench)": the tile and the language chips say it already.
const LANGUAGE_SUFFIX = /\s*\((?:vhdl|verilog)\b[^)]*\)\s*$/i;

/** A project's name as the list shows it: without a language in brackets at the end. */
export function displayName(name: string): string {
  return name.replace(LANGUAGE_SUFFIX, '') || name;
}

export function itemFromIndexEntry(entry: IndexEntry, owner: string): ProjectListItem {
  const files = entry.files ?? [];
  return {
    key: `github:${entry.gistId}`,
    source: 'github',
    name: entry.name,
    description: entry.description,
    files: files.map(({ name, description }) => ({ name, description })),
    languages: languagesOf(files.map((file) => file.name)),
    updatedAt: entry.updatedAt || entry.createdAt,
    owner,
    location: entry.url,
    gistId: entry.gistId,
    entry,
  };
}

/** A project file read from the projects folder as an item; undefined when it is not a valid project file. */
export function itemFromProjectFile(text: string, location: string, modifiedMs: number): ProjectListItem | undefined {
  let project;
  try {
    project = parseProject(text).project;
  } catch {
    return undefined;
  }
  const files = project.files.map(({ name, description }) => ({ name, description }));
  return {
    key: `local:${location}`,
    source: 'local',
    // A project saved without a name is listed by its file name.
    name: project.name.trim() || projectFolderName(baseName(location)),
    description: project.description,
    files,
    languages: languagesOf(files.map((file) => file.name)),
    updatedAt: Number.isFinite(modifiedMs) && modifiedMs > 0 ? new Date(modifiedMs).toISOString() : '',
    owner: '',
    location,
  };
}

function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function wordsOf(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

function searchText(item: Searchable): string {
  return normalise([item.name, item.description, item.owner, ...item.files.flatMap((file) => [file.name, file.description])].join(' '));
}

/** The items whose search text contains every word of `query`. */
export function filterItems<T extends Searchable>(items: readonly T[], query: string): T[] {
  const words = wordsOf(query);
  return items.filter((item) => {
    const text = searchText(item);
    return words.every((word) => text.includes(word));
  });
}

/** A new array in `order`; ties go by name, then key, so the order is stable. */
export function sortItems<T extends Sortable>(items: readonly T[], order: SortOrder): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.key.localeCompare(b.key);
  const byDate = (direction: 1 | -1) => (a: T, b: T) => {
    if ((a.updatedAt === '') !== (b.updatedAt === '')) return a.updatedAt === '' ? 1 : -1;
    return direction * a.updatedAt.localeCompare(b.updatedAt) || byName(a, b);
  };
  const compare = { name: byName, newest: byDate(-1), oldest: byDate(1) }[order];
  return [...items].sort(compare);
}

/**
 * Whether a list item is the open project: the same gist, or the same local project file. A
 * project opened with Upload File knows only its file name, so a scanned file of that name and
 * project name counts too.
 */
export function isSameProject(item: ProjectListItem, open: { name: string; gistId: string | undefined; location: string }): boolean {
  if (item.gistId !== undefined || open.gistId !== undefined) return item.gistId === open.gistId;
  if (open.location === '') return false;
  return item.location === open.location || (item.location.endsWith(`/${open.location}`) && item.name === open.name);
}

/**
 * The first file that matches the words the project's own name, description and owner do not:
 * what to show under the project while searching. Undefined when the project itself matches, or
 * no single file does.
 */
export function fileHit(item: Searchable, query: string): CatalogFile | undefined {
  const words = wordsOf(query);
  if (words.length === 0) return undefined;
  const own = normalise(`${item.name} ${item.description} ${item.owner}`);
  const rest = words.filter((word) => !own.includes(word));
  if (rest.length === 0) return undefined;
  return item.files.find((file) => {
    const text = normalise(`${file.name} ${file.description}`);
    return rest.every((word) => text.includes(word));
  });
}

export interface ProjectsPagePrefs {
  sort: SortOrder;
}

export const PROJECTS_PAGE_PREFS_KEY = 'hdlboard.projectsPage';
export const storedProjectsPagePrefs = ({ sort }: ProjectsPagePrefs) => JSON.stringify({ sort });

const DEFAULT_PREFS: ProjectsPagePrefs = { sort: 'newest' };

/** The remembered sort; bad or missing JSON, or a sort this version has no more, gives the default. */
export function parseProjectsPagePrefs(json: string | null): ProjectsPagePrefs {
  let record: Record<string, unknown> = {};
  try {
    const parsed: unknown = json === null ? null : JSON.parse(json);
    if (parsed && typeof parsed === 'object') record = parsed as Record<string, unknown>;
  } catch {
    // The defaults.
  }
  const sort = SORT_ORDERS.find((order) => order === record.sort) ?? DEFAULT_PREFS.sort;
  return { sort };
}

const UNIT_SECONDS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_557_600],
  ['month', 2_629_800],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/** "4 days ago", "last week", "yesterday": the largest unit that fits; the future reads as now. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.min(0, (new Date(iso).getTime() - now) / 1000);
  const [unit, size] = UNIT_SECONDS.find(([, size]) => Math.abs(seconds) >= size) ?? UNIT_SECONDS[UNIT_SECONDS.length - 1];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(seconds / size) || 0, unit);
}
