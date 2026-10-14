// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Projects page's list (docs/project_browse_page.md § 5): local and GitHub projects as one
 * kind of item, searched, filtered and sorted. Pure — no React, no I/O.
 */

import type { IndexEntry } from '../../github/projectIndex';
import { parseProject } from '../../project/parseProject';
import { baseName, projectFolderName } from '../../project/fileName';
import { languageOfName } from './fileKinds';

export type ProjectLanguage = 'vhdl' | 'verilog';
export type ProjectSource = 'local' | 'github';
export type TypeFilter = 'all' | ProjectLanguage;
/** 'local' and 'github': that place's projects first, each place newest first. */
export type SortOrder = 'newest' | 'oldest' | 'name' | 'local' | 'github';
/** 'details': the table, a row opening to the project's details; 'grid': small icons. */
export type ProjectsView = 'details' | 'grid';

export interface CatalogFile {
  name: string;
  description: string;
}

export interface ProjectListItem {
  /** Unique in the list: `local:<location>` or `github:<gistId>`. */
  key: string;
  source: ProjectSource;
  name: string;
  description: string;
  files: CatalogFile[];
  /** From the file names, 'vhdl' before 'verilog'; empty when none is a source file. */
  languages: ProjectLanguage[];
  /** ISO 8601, or '' when unknown. Local: the project file's modification time. GitHub: updatedAt, else createdAt. */
  updatedAt: string;
  /** The GitHub login for GitHub items; '' for local ones. */
  owner: string;
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

function searchText(item: ProjectListItem): string {
  return normalise([item.name, item.description, item.owner, ...item.files.flatMap((file) => [file.name, file.description])].join(' '));
}

/** The items in `type` whose search text contains every word of `query`. */
export function filterItems(items: readonly ProjectListItem[], query: string, type: TypeFilter): ProjectListItem[] {
  const words = wordsOf(query);
  return items.filter((item) => {
    if (type !== 'all' && !item.languages.includes(type)) return false;
    const text = searchText(item);
    return words.every((word) => text.includes(word));
  });
}

/** A new array in `order`; ties go by name, then key, so the order is stable. */
export function sortItems(items: readonly ProjectListItem[], order: SortOrder): ProjectListItem[] {
  const byName = (a: ProjectListItem, b: ProjectListItem) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.key.localeCompare(b.key);
  const byDate = (direction: 1 | -1) => (a: ProjectListItem, b: ProjectListItem) => {
    if ((a.updatedAt === '') !== (b.updatedAt === '')) return a.updatedAt === '' ? 1 : -1;
    return direction * a.updatedAt.localeCompare(b.updatedAt) || byName(a, b);
  };
  const newest = byDate(-1);
  const bySource = (first: ProjectSource) => (a: ProjectListItem, b: ProjectListItem) =>
    Number(b.source === first) - Number(a.source === first) || newest(a, b);
  const compare = { name: byName, newest, oldest: byDate(1), local: bySource('local'), github: bySource('github') }[order];
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
export function fileHit(item: ProjectListItem, query: string): CatalogFile | undefined {
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
  type: TypeFilter;
  sort: SortOrder;
  view: ProjectsView;
}

export const PROJECTS_PAGE_PREFS_KEY = 'hdlboard.projectsPage';
/** What is written to PROJECTS_PAGE_PREFS_KEY: the type filter lasts for the visit only. */
export const storedProjectsPagePrefs = ({ sort, view }: ProjectsPagePrefs) => JSON.stringify({ sort, view });

const DEFAULT_PREFS: ProjectsPagePrefs = { type: 'all', sort: 'newest', view: 'details' };

/**
 * The remembered choices; bad or missing JSON, or a value that is no choice, gives the default.
 * The type filter is never remembered: a filter left on from an earlier visit hid projects
 * without anyone noticing, so every visit starts at All types (a stored type is ignored).
 */
export function parseProjectsPagePrefs(json: string | null): ProjectsPagePrefs {
  let record: Record<string, unknown> = {};
  try {
    const parsed: unknown = json === null ? null : JSON.parse(json);
    if (parsed && typeof parsed === 'object') record = parsed as Record<string, unknown>;
  } catch {
    // The defaults.
  }
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    type: DEFAULT_PREFS.type,
    sort: pick(record.sort, ['newest', 'oldest', 'name', 'local', 'github'], DEFAULT_PREFS.sort),
    view: pick(record.view, ['details', 'grid'], DEFAULT_PREFS.view),
  };
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
