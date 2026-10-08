// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The open project (docs/Impl_project_file_and_online_storage.md): a `.hdlboard.json`
 * file that names the project, its board, and the files that belong to it, each with
 * a description and, optionally, the URL it is stored at.
 *
 * While a project is open, the files in the Files panel *are* its files: a file added
 * there joins the project, a deleted one leaves it, a renamed one keeps its description.
 * The project only stores what Files does not know — the descriptions and URLs — plus
 * the entries that could not be loaded, so saving the project never loses them.
 * Pure: no React, no state.
 */

import { fetchText, type FetchFn } from '../../project/fetchText';
import { fileNameProblem, isProjectFileName, nameKey, sameFileName } from '../../project/fileName';
import { DEFAULT_KNOWN_BOARDS, parseProject, serializeProject } from '../../project/parseProject';
import { PROJECT_FILE_EXTENSION, SUPPORTED_PROJECT_VERSION, type ProjectFileEntry } from '../../project/types';
import { isHttpUrl, urlProblem } from '../../project/url';
import { folderForUpload } from './fileKinds';
import { RESERVED_PREFIX_REASON, RESERVED_PREFIX } from './fileNameRules';

export { DEFAULT_KNOWN_BOARDS as KNOWN_BOARDS };

export interface OpenProject {
  version: number;
  name: string;
  board: string;
  description: string;
  /** The project file's own name, e.g. `counter.hdlboard.json`. */
  fileName: string;
  /** Where the project was opened from: a file name, a URL, or '' for a new project. */
  location: string;
  /** Every entry in project order. Entries of files in Files are kept in step with them (projectEntries). */
  entries: ProjectFileEntry[];
  /** Entries that are not in Files, by nameKey: why each could not be loaded. */
  unloaded: Record<string, string>;
  /** What loading the project reported: unknown board, skipped entries, failed downloads. */
  warnings: string[];
  /** The project file text as last opened or saved, so the page can tell it has unsaved changes. */
  savedText: string;
}

/** One row of the project page's file table. */
export interface ProjectEntryRow extends ProjectFileEntry {
  /** In Files, or listed by the project only. */
  status: 'loaded' | 'unloaded';
  /** Why an unloaded entry is not in Files. */
  problem?: string;
}

/** A file read while opening a project, to be put in Files. */
export interface ProjectSourceFile {
  name: string;
  content: string;
}

const NEW_PROJECT_DESCRIPTION = '';

/**
 * The project's file list as it reads now: every entry whose file is in Files or that
 * could not be loaded, in project order, then the files Files has that the project
 * does not list yet (added since it was opened), with an empty description.
 */
export function projectEntries(project: OpenProject, fileNames: readonly string[]): ProjectEntryRow[] {
  const inFiles = new Set(fileNames.map(nameKey));
  const rows: ProjectEntryRow[] = [];
  const listed = new Set<string>();
  for (const entry of project.entries) {
    const key = nameKey(entry.name);
    if (listed.has(key)) continue;
    if (inFiles.has(key)) rows.push({ ...entry, status: 'loaded' });
    else if (key in project.unloaded) rows.push({ ...entry, status: 'unloaded', problem: project.unloaded[key] });
    else continue;
    listed.add(key);
  }
  for (const name of fileNames) {
    if (listed.has(nameKey(name))) continue;
    rows.push({ name, url: '', description: '', status: 'loaded' });
    listed.add(nameKey(name));
  }
  return rows;
}

/** The project file as it is saved: the format of § 4, listing the files as they are now. */
export function projectFileText(project: OpenProject, fileNames: readonly string[]): string {
  return serializeProject({
    version: project.version,
    name: project.name,
    board: project.board,
    description: project.description,
    files: projectEntries(project, fileNames).map(({ name, url, description }) => ({ name, url, description })),
  });
}

/** Whether the project differs from its file as last opened or saved. */
export function hasUnsavedChanges(project: OpenProject, fileNames: readonly string[]): boolean {
  return projectFileText(project, fileNames) !== project.savedText;
}

/** Records a save: the text written becomes the project's saved state. */
export function withSaved(project: OpenProject, fileNames: readonly string[]): OpenProject {
  return { ...project, savedText: projectFileText(project, fileNames) };
}

/** `4-bit Counter` → `4-bit-counter.hdlboard.json`; never empty. */
export function projectFileNameFor(projectName: string): string {
  const words = projectName.toLowerCase().match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) ?? [];
  return `${words.join('-') || 'project'}${PROJECT_FILE_EXTENSION}`;
}

/** Why a project cannot be called `name`, or undefined if it can. */
export function projectNameError(name: string): string | undefined {
  if (name.trim() === '') return 'Enter a project name.';
  return undefined;
}

/** Why the project file cannot be called `fileName`, or undefined if it can (§ 5.1). */
export function projectFileNameError(fileName: string): string | undefined {
  const problem = fileNameProblem(fileName);
  if (problem) return `The ${problem}.`;
  if (!isProjectFileName(fileName)) return `The name must end in ${PROJECT_FILE_EXTENSION}.`;
  return undefined;
}

/** Why a file entry's URL cannot be used, or undefined; an empty URL means "in the project folder". */
export function entryUrlError(url: string): string | undefined {
  if (url.trim() === '') return undefined;
  return urlProblem(url.trim()) ?? undefined;
}

/** A new project listing every file now in Files (the New File dialog's Project choice). */
export function newProject(name: string, fileNames: readonly string[]): OpenProject {
  const project: OpenProject = {
    version: SUPPORTED_PROJECT_VERSION,
    name: name.trim(),
    board: DEFAULT_KNOWN_BOARDS[0],
    description: NEW_PROJECT_DESCRIPTION,
    fileName: projectFileNameFor(name),
    location: '',
    entries: fileNames.map((fileName) => ({ name: fileName, url: '', description: '' })),
    unloaded: {},
    warnings: [],
    savedText: '',
  };
  return project;
}

export type ProjectDetails = Partial<Pick<OpenProject, 'name' | 'board' | 'description' | 'fileName'>>;

export function withDetails(project: OpenProject, details: ProjectDetails): OpenProject {
  return { ...project, ...details };
}

/**
 * Edits one entry's description or URL. An entry Files added since the project was
 * opened is not in `entries` yet; it is written there now, so the edit is kept.
 */
export function withEntryEdited(
  project: OpenProject,
  name: string,
  patch: Partial<Pick<ProjectFileEntry, 'description' | 'url'>>,
): OpenProject {
  const exists = project.entries.some((entry) => sameFileName(entry.name, name));
  const entries = exists
    ? project.entries.map((entry) => (sameFileName(entry.name, name) ? { ...entry, ...patch } : entry))
    : [...project.entries, { name, url: '', description: '', ...patch }];
  return { ...project, entries };
}

/** A file renamed in Files keeps its description and URL under its new name. */
export function withEntryRenamed(project: OpenProject, oldName: string, newName: string): OpenProject {
  return {
    ...project,
    entries: project.entries.map((entry) => (sameFileName(entry.name, oldName) ? { ...entry, name: newName } : entry)),
  };
}

/** A file deleted from Files, or an unloaded entry removed on the project page, leaves the project. */
export function withEntryRemoved(project: OpenProject, name: string): OpenProject {
  const unloaded = { ...project.unloaded };
  delete unloaded[nameKey(name)];
  return { ...project, entries: project.entries.filter((entry) => !sameFileName(entry.name, name)), unloaded };
}

/** Files that were added to Files after all (from the project folder, or downloaded again) are no longer unloaded. */
export function withEntriesLoaded(project: OpenProject, names: readonly string[]): OpenProject {
  const unloaded = { ...project.unloaded };
  for (const name of names) delete unloaded[nameKey(name)];
  return { ...project, unloaded };
}

/** An entry that could not be loaded (again), and why. */
export function withEntryUnloaded(project: OpenProject, name: string, problem: string): OpenProject {
  return { ...project, unloaded: { ...project.unloaded, [nameKey(name)]: problem } };
}

/** Why a file listed by a project cannot be put in Files, whatever its content; undefined if it can. */
export function entryFileRefusal(name: string): string | undefined {
  if (folderForUpload(name) === undefined) return NOT_SOURCE_ENTRY;
  if (name.toLowerCase().startsWith(RESERVED_PREFIX)) return RESERVED_PREFIX_REASON;
  return undefined;
}

export const NOT_SOURCE_ENTRY = 'Not a VHDL or Verilog file (.vhd / .vhdl / .v / .vh), so it is not opened in Files.';

export const MISSING_LOCAL_FILE =
  'Not found: it is stored in the project folder. Choose the project folder, or upload it together with the project file.';

/** Where the project file came from, and the files picked or dropped beside it. */
export interface ProjectSource {
  text: string;
  /** The project file's own name, or URL. */
  location: string;
  /** Files chosen together with the project file: the project folder. Matched by name, ignoring case. */
  localFiles?: readonly ProjectSourceFile[];
  fetch?: FetchFn;
}

export interface OpenedProject {
  project: OpenProject;
  /** The files to put in Files, in project order. */
  files: ProjectSourceFile[];
}

/**
 * Opens a project file (§ 6.2): parses and validates it (throws ProjectError when it
 * cannot be opened at all), then reads every entry — from its URL when it has one,
 * else from the files chosen with it — without giving up on the others when one fails.
 */
export async function openProject(source: ProjectSource): Promise<OpenedProject> {
  const { project, board, warnings, skipped } = parseProject(source.text);
  const local = new Map((source.localFiles ?? []).map((file) => [nameKey(file.name), file.content]));
  const fetchFn = source.fetch ?? fetch;

  const results = await Promise.all(
    project.files.map(async (entry): Promise<{ entry: ProjectFileEntry; content?: string; problem?: string }> => {
      const refusal = entryFileRefusal(entry.name);
      if (refusal) return { entry, problem: refusal };
      if (entry.url === '' && isHttpUrl(source.location)) {
        // A project opened from a URL: its folder is the URL's folder (§ 5).
        try {
          return { entry, content: await fetchText(new URL(entry.name, source.location).toString(), fetchFn) };
        } catch (error) {
          return { entry, problem: (error as Error).message };
        }
      }
      if (entry.url === '') {
        const content = local.get(nameKey(entry.name));
        return content === undefined ? { entry, problem: MISSING_LOCAL_FILE } : { entry, content };
      }
      try {
        return { entry, content: await fetchText(entry.url, fetchFn) };
      } catch (error) {
        // A copy picked from the project folder stands in for a download that failed.
        const copy = local.get(nameKey(entry.name));
        if (copy !== undefined) return { entry, content: copy };
        return { entry, problem: (error as Error).message };
      }
    }),
  );

  const unloaded: Record<string, string> = {};
  const files: ProjectSourceFile[] = [];
  for (const { entry, content, problem } of results) {
    if (content === undefined) unloaded[nameKey(entry.name)] = problem ?? 'Not loaded.';
    else files.push({ name: entry.name, content });
  }

  const opened: OpenProject = {
    version: project.version,
    name: project.name,
    board,
    description: project.description,
    fileName: projectFileName(source.location, project.name),
    location: source.location,
    entries: project.files,
    unloaded,
    warnings: [
      ...warnings.filter((w) => !skipped.some((s) => s.name === w.fileName)).map((w) => w.message),
      ...skipped.map((s) => `${s.name} was skipped: ${s.reason}.`),
    ],
    savedText: '',
  };
  // Saved state is the project as it reads opened, so an untouched project shows no changes.
  return { project: withSaved(opened, files.map((f) => f.name)), files };
}

/** The last segment of the location when it is a project file name, else one made from the project name. */
function projectFileName(location: string, projectName: string): string {
  const last = location.split(/[?#]/)[0].split(/[/\\]/).filter(Boolean).pop() ?? '';
  const name = decodeURIComponentSafe(last);
  return isProjectFileName(name) ? name : projectFileNameFor(projectName);
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * A project as the desktop app stored it with the workspace (desktop.ts), or undefined
 * when it does not look like one we wrote.
 */
export function parseStoredProject(raw: unknown): OpenProject | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const strings = ['name', 'board', 'description', 'fileName', 'location', 'savedText'] as const;
  if (typeof r.version !== 'number' || strings.some((key) => typeof r[key] !== 'string')) return undefined;
  if (!Array.isArray(r.entries)) return undefined;
  const entries = r.entries.filter(
    (e): e is ProjectFileEntry =>
      !!e && typeof e === 'object' && ['name', 'url', 'description'].every((key) => typeof (e as Record<string, unknown>)[key] === 'string'),
  );
  const unloaded =
    r.unloaded && typeof r.unloaded === 'object'
      ? Object.fromEntries(Object.entries(r.unloaded).filter(([, why]) => typeof why === 'string'))
      : {};
  const warnings = Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === 'string') : [];
  return {
    version: r.version,
    name: r.name as string,
    board: r.board as string,
    description: r.description as string,
    fileName: r.fileName as string,
    location: r.location as string,
    entries: entries.map(({ name, url, description }) => ({ name, url, description })),
    unloaded: unloaded as Record<string, string>,
    warnings,
    savedText: r.savedText as string,
  };
}

/** Whether an uploaded file is a project file: `.hdlboard.json`, or any other `.json`. */
export function isProjectUpload(name: string): boolean {
  return /\.json$/i.test(name);
}

/** The project file among uploaded files: a `.hdlboard.json` first, else the first `.json`. */
export function pickProjectUpload<T extends { name: string }>(files: readonly T[]): T | undefined {
  return files.find((file) => isProjectFileName(file.name)) ?? files.find((file) => isProjectUpload(file.name));
}
