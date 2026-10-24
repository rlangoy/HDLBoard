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
import { fileNameProblem, folderNameProblem, isProjectFileName, nameKey, projectFolderName, sameFileName } from '../../project/fileName';
import { boardIdOf, parseProject, serializeProject } from '../../project/parseProject';
import { CURRENT_PROJECT_VERSION, DEFAULT_SOURCE_DIRECTORY, PROJECT_FILE_EXTENSION, type ProjectFileEntry, type SavedWaveView, type SavedWaveViews } from '../../project/types';
import { parseWaveViews, withWaveViewOf } from '../../project/waveViews';
import { diskPath } from '../../project/resolveSource';
import { projectDirectoryOf } from './projectLayout';
import { isHttpUrl } from '../../project/url';
import { fingerprintOf } from '../../project/fingerprint';
import { parseStoredGistLink, type ProjectGistLink } from './gistLink';
import { folderForUpload } from './fileKinds';
import { STARTER_FILES } from './files';
import { RESERVED_PREFIX_REASON, RESERVED_PREFIX } from './fileNameRules';

export interface OpenProject {
  version: number;
  name: string;
  board: string;
  description: string;
  /** The project file's own name, e.g. `counter.hdlboard.json`. */
  fileName: string;
  /**
   * The folder inside the project folder that holds the project's files on local disk,
   * `src` unless changed on the project settings (docs/impl_project_structure.md D3). The
   * project folder itself is not stored: it is always the project file name (projectLayout.ts).
   */
  sourceDirectory: string;
  /**
   * Where each file of the project is on local disk now, by nameKey, relative to the
   * project file's folder: `fantasicleds/src/DE1_SoC.vhdl`, or `DE1_SoC.vhdl` for a flat
   * project. Set when a file is read from a folder or saved to one; missing for a project
   * that is not on disk (a gist, a URL, a new project) and for a file new since then.
   */
  onDisk?: Record<string, string>;
  /** The project file's name on disk as last opened or saved there, so a rename is seen as a move (D11). */
  onDiskFileName?: string;
  /**
   * Paths a save wrote before it failed (docs/impl_project_structure.md § 6.5): this
   * project's own copies, so the next save writes over them without asking.
   */
  ownWrites?: string[];
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
  /**
   * fingerprintOf each of the project's files as last opened, loaded or saved, by
   * nameKey, so an edit to a VHDL or Verilog file counts as an unsaved change too.
   * Missing (a workspace stored before this existed) reads as "unknown" and only the
   * project file text is compared.
   */
  savedFiles?: Record<string, string>;
  /** The GitHub gist the project is stored in (projectGitHub.ts), if it is. */
  gist?: ProjectGistLink;
  /**
   * Files in Files that the project leaves out, by nameKey: those Files held when the
   * project was created with Create Project, until they are added, and files taken out
   * with "Leave the project". Missing reads as none.
   */
  excluded?: string[];
  /** How the waveform view of each testbench was set up, saved in the project file (docs/imp_wave_rearange.md § 11). */
  waveViews?: SavedWaveViews;
}

/** One row of the project settings' file table. */
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
 * does not list yet (added since it was opened), with an empty description. Files the
 * project leaves out (`excluded`) are not listed.
 */
export function projectEntries(project: OpenProject, fileNames: readonly string[]): ProjectEntryRow[] {
  const inFiles = new Set(fileNames.map(nameKey));
  const rows: ProjectEntryRow[] = [];
  const listed = new Set<string>(project.excluded ?? []);
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

/** Files in Files that the project leaves out, in Files order: what the project settings offers to add. */
export function availableFiles(project: OpenProject, fileNames: readonly string[]): string[] {
  const excluded = new Set(project.excluded ?? []);
  return fileNames.filter((name) => excluded.has(nameKey(name)));
}

/** The project's own files among `files`: what Save project and Save to GitHub write. */
export function filesInProject<T extends { name: string }>(project: OpenProject, files: readonly T[]): T[] {
  const excluded = new Set(project.excluded ?? []);
  return files.filter((file) => !excluded.has(nameKey(file.name)));
}

/** The project file as it is saved: the format of § 4, listing the files as they are now. */
export function projectFileText(project: OpenProject, fileNames: readonly string[]): string {
  return serializeProject({
    version: project.version,
    name: project.name,
    board: project.board,
    description: project.description,
    projectDirectory: projectDirectoryOf(project),
    sourceDirectory: project.sourceDirectory,
    files: projectEntries(project, fileNames).map(({ name, url, description }) => ({ name, url, description })),
    waveViews: project.waveViews,
  });
}

/**
 * Whether the project differs from what was last opened or saved: its project file
 * (details, descriptions, which files it lists), or the text of any of its files.
 */
export function hasUnsavedChanges(project: OpenProject, files: readonly ProjectSourceFile[]): boolean {
  const fileNames = files.map((file) => file.name);
  if (projectFileText(project, fileNames) !== project.savedText) return true;
  const saved = project.savedFiles;
  if (saved === undefined) return false;
  return filesInProject(project, files).some((file) => saved[nameKey(file.name)] !== fingerprintOf([file]));
}

/**
 * What is asked before another project replaces Files that hold unsaved changes.
 * `savedTo` says where they are not saved ('GitHub'); left out, they are not saved anywhere.
 */
export function unsavedChangesQuestion(question: string, projectName: string, savedTo?: string): string {
  const where = savedTo === undefined ? '' : ` to ${savedTo}`;
  return `${question}\n\n${projectName || 'The open project'} has changes that are not saved${where}. They are lost when another project opens.`;
}

/** Records a save (or an open): the project file and its files as they are now become the saved state. */
export function withSaved(project: OpenProject, files: readonly ProjectSourceFile[]): OpenProject {
  return {
    ...project,
    savedText: projectFileText(project, files.map((file) => file.name)),
    savedFiles: fileFingerprints(filesInProject(project, files)),
  };
}

function fileFingerprints(files: readonly ProjectSourceFile[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [nameKey(file.name), fingerprintOf([file])]));
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

/** The part of a project file name the student edits: `counter.hdlboard.json` → `counter`. */
export function projectFileBase(fileName: string): string {
  return fileName.replace(/\.hdlboard\.json$/i, '');
}

/**
 * The project file name for a typed base name. The extension is fixed, so one typed or
 * pasted anyway (`counter.hdlboard.json`, `counter.json`) is not added twice.
 */
export function projectFileNameFromBase(base: string): string {
  return `${base.trim().replace(/\.hdlboard\.json$|\.json$/i, '')}${PROJECT_FILE_EXTENSION}`;
}

/** Why the project file cannot be called `fileName`, or undefined if it can (§ 5.1). */
export function projectFileNameError(fileName: string): string | undefined {
  if (projectFileBase(fileName).trim() === '') return 'Enter a name for the project file.';
  const problem = fileNameProblem(fileName);
  if (problem) return `The ${problem}.`;
  if (!isProjectFileName(fileName)) return `The name must end in ${PROJECT_FILE_EXTENSION}.`;
  return undefined;
}

/** Why the project's files cannot be kept in the folder `name`, or undefined if they can (§ 6.2). */
export function sourceDirectoryError(name: string): string | undefined {
  const problem = folderNameProblem(name);
  return problem ? `The source folder is not usable: ${problem}.` : undefined;
}


/** A new project on `board` (an id), listing every file now in Files (the New File dialog's Project choice). */
export function newProject(name: string, fileNames: readonly string[], board: string): OpenProject {
  const project: OpenProject = {
    version: CURRENT_PROJECT_VERSION,
    name: name.trim(),
    board,
    description: NEW_PROJECT_DESCRIPTION,
    fileName: projectFileNameFor(name),
    sourceDirectory: DEFAULT_SOURCE_DIRECTORY,
    location: '',
    entries: fileNames.map((fileName) => ({ name: fileName, url: '', description: '' })),
    unloaded: {},
    warnings: [],
    savedText: '',
  };
  return project;
}

export const DEFAULT_PROJECT_NAME = 'Default';
/**
 * The Default project exactly as the workspace made it: still named Default, its project file
 * still default, nothing changed since, and not on GitHub. Saving it to GitHub goes through the
 * project settings first, where it can be named (docs/implementation_spec_one_click_share.md).
 */
export function isUntouchedDefault(project: OpenProject, unsaved: boolean): boolean {
  return (
    !unsaved && project.gist === undefined && project.name === DEFAULT_PROJECT_NAME && project.fileName === projectFileNameFor(DEFAULT_PROJECT_NAME)
  );
}

/**
 * The project has no name of its own yet: it is empty, or it is the Default project's name and
 * not on GitHub. Saving (to disk or GitHub) waits for one, and the project settings asks for it.
 */
export function projectNeedsName(project: OpenProject): boolean {
  return project.name.trim() === '' || (project.name === DEFAULT_PROJECT_NAME && project.gist === undefined);
}

/** What Download All writes as the project's description while it has none. */
export const UNSET_DESCRIPTION = 'Not set yet';

/** The project as Download All writes it: an empty description reads "Not set yet". */
export function withDescriptionForDownload(project: OpenProject): OpenProject {
  return project.description.trim() === '' ? { ...project, description: UNSET_DESCRIPTION } : project;
}

/** What the start-up files (DE1_SoC.vhdl, DE1_SoC.v) are for, in the Default project's file list. */
export const STARTER_FILE_DESCRIPTION = 'Displays the switch states on the LEDs';

/**
 * The project the workspace is when no other is open: "Default", holding every file in
 * Files — the start-up files, opened examples, dropped and new files — kept in `src`
 * like any project. `descriptions` (by nameKey) keeps what the files were described as
 * before (a project just closed); the start-up files are described otherwise. It reads as
 * saved until something changes, so a fresh start shows no unsaved changes.
 */
export function defaultProject(
  files: readonly ProjectSourceFile[],
  board: string,
  descriptions: Readonly<Record<string, string>> = {},
): OpenProject {
  const starters = new Set(STARTER_FILES.map((file) => nameKey(file.name)));
  const described = (name: string) => descriptions[nameKey(name)] ?? (starters.has(nameKey(name)) ? STARTER_FILE_DESCRIPTION : '');
  const base = newProject(DEFAULT_PROJECT_NAME, [], board);
  const project: OpenProject = {
    ...base,
    description: '',
    entries: files.map((file) => ({ name: file.name, url: '', description: described(file.name) })),
  };
  return withSaved(project, files);
}

/**
 * Create Project: a new, empty project. The files now in Files are offered on the
 * project settings to be added (availableFiles); files made or uploaded later join at once.
 */
export function startProject(fileNames: readonly string[], board: string): OpenProject {
  return { ...newProject('', [], board), excluded: fileNames.map(nameKey) };
}

export type ProjectDetails = Partial<Pick<OpenProject, 'name' | 'board' | 'description' | 'fileName' | 'sourceDirectory'>>;

/**
 * Edits the project's details. While a new project has never been saved and its file
 * name is still the one made from its name, the file name follows the name.
 */
export function withDetails(project: OpenProject, details: ProjectDetails): OpenProject {
  const followsName =
    details.name !== undefined && details.fileName === undefined && project.location === '' && project.fileName === projectFileNameFor(project.name);
  return { ...project, ...details, ...(followsName ? { fileName: projectFileNameFor(details.name ?? '') } : {}) };
}

/**
 * The waveform view of `testbench` as the student set it up; it is saved with the project
 * file, so it counts as a change. The same project comes back when nothing changes.
 */
export function withWaveView(project: OpenProject, testbench: string, view: SavedWaveView): OpenProject {
  const waveViews = withWaveViewOf(project.waveViews, testbench, view);
  if (waveViews === project.waveViews) return project;
  const { waveViews: _old, ...rest } = project;
  return waveViews === undefined ? rest : { ...rest, waveViews };
}

/** Files offered on the project settings join the project. */
export function withFilesAdded(project: OpenProject, names: readonly string[]): OpenProject {
  const added = new Set(names.map(nameKey));
  return { ...project, excluded: (project.excluded ?? []).filter((key) => !added.has(key)) };
}

/** A file leaves the project but stays in Files; its description is kept in case it is added again. */
export function withFileLeft(project: OpenProject, name: string): OpenProject {
  const key = nameKey(name);
  return { ...withEntryEdited(project, name, {}), excluded: [...(project.excluded ?? []).filter((other) => other !== key), key] };
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
    ...(project.excluded ? { excluded: project.excluded.map((key) => (key === nameKey(oldName) ? nameKey(newName) : key)) } : {}),
    // The renamed file has no place on disk yet: the old one is another file now.
    ...withoutOnDisk(project, oldName),
  };
}

/** A file deleted from Files, or an unloaded entry removed on the project settings, leaves the project. */
export function withEntryRemoved(project: OpenProject, name: string): OpenProject {
  const unloaded = { ...project.unloaded };
  delete unloaded[nameKey(name)];
  const entries = project.entries.filter((entry) => !sameFileName(entry.name, name));
  const excluded = project.excluded?.filter((key) => key !== nameKey(name));
  return { ...project, entries, unloaded, ...(excluded ? { excluded } : {}), ...withoutOnDisk(project, name) };
}

function withoutOnDisk(project: OpenProject, name: string): Pick<OpenProject, 'onDisk'> | Record<string, never> {
  if (!project.onDisk || !(nameKey(name) in project.onDisk)) return {};
  const onDisk = { ...project.onDisk };
  delete onDisk[nameKey(name)];
  return { onDisk };
}

/**
 * Records a save to local disk: every file of the project is at its place now, and the
 * project file has the name it was saved under (docs/impl_project_structure.md § 6.5).
 */
export function withOnDisk(project: OpenProject, onDisk: Record<string, string>, fileName: string): OpenProject {
  const { ownWrites: _done, ...rest } = project;
  return { ...rest, onDisk, onDiskFileName: fileName };
}

/** The project is not in a folder this page can write to (a new folder was picked, say): nothing is known on disk. */
export function withoutDiskPlaces(project: OpenProject): OpenProject {
  const { onDisk: _onDisk, onDiskFileName: _name, ownWrites: _own, ...rest } = project;
  return rest;
}

/**
 * Files that were added to Files after all (from the project folder, or downloaded again)
 * are no longer unloaded. They read as stored, so they count as saved.
 */
export function withEntriesLoaded(project: OpenProject, loaded: readonly ProjectSourceFile[]): OpenProject {
  const unloaded = { ...project.unloaded };
  for (const file of loaded) delete unloaded[nameKey(file.name)];
  const savedFiles = project.savedFiles && { ...project.savedFiles, ...fileFingerprints(loaded) };
  return { ...project, unloaded, ...(savedFiles ? { savedFiles } : {}) };
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

/**
 * A file chosen, dropped, unpacked or read with the project file. `path` is where it is,
 * relative to the project file's folder (`fantasicleds/src/DE1_SoC.vhdl`), when that is
 * known; a file without one is matched by its name only.
 */
export interface LocalSourceFile extends ProjectSourceFile {
  path?: string;
}

/** Where the project file came from, and the files picked or dropped beside it. */
export interface ProjectSource {
  text: string;
  /** The project file's own name, or URL. */
  location: string;
  /**
   * Files chosen together with the project file: the project folder. Matched by path
   * first (the project's source folder, then next to the project file), then by name,
   * ignoring case. Only this project's files: the caller leaves out other projects' folders.
   */
  localFiles?: readonly LocalSourceFile[];
  /** Reads a file by its path relative to the project file's folder (the Windows app, for a project opened by its path). */
  readLocal?: (relativePath: string) => Promise<string>;
  fetch?: FetchFn;
  /** The gist the project was opened from, through the GitHub API. */
  gist?: ProjectGistLink;
}

export interface OpenedProject {
  project: OpenProject;
  /** The files to put in Files, in project order. */
  files: ProjectSourceFile[];
}

/** A file found for an entry, and where it was on disk when that is known. */
interface Found {
  content: string;
  path?: string;
}

/**
 * Finds an entry's file among the local files, or on disk (docs/impl_project_structure.md
 * § 6.4): in the project's source folder first, then next to the project file. Undefined
 * when it is in neither; `readError` says why reading it failed.
 */
async function findLocal(
  name: string,
  candidates: readonly string[],
  source: ProjectSource,
  byPath: ReadonlyMap<string, LocalSourceFile>,
  byName: ReadonlyMap<string, LocalSourceFile>,
): Promise<{ found?: Found; readError?: string }> {
  for (const path of candidates) {
    const file = byPath.get(nameKey(path));
    if (file) return { found: { content: file.content, path: file.path } };
  }
  const named = byName.get(nameKey(name));
  if (named) return { found: { content: named.content, ...(named.path !== undefined ? { path: named.path } : {}) } };
  if (!source.readLocal) return {};
  let readError: string | undefined;
  for (const path of candidates) {
    try {
      return { found: { content: await source.readLocal(path), path } };
    } catch (error) {
      readError ??= (error as Error).message;
    }
  }
  return { readError };
}

/**
 * Opens a project file (§ 6.2): parses and validates it (throws ProjectError when it
 * cannot be opened at all), then reads every entry — from its URL when it has one,
 * else from the files chosen with it — without giving up on the others when one fails.
 * Read from a folder, each file is looked for in the project's source folder first and
 * next to the project file second; where it was found is kept in `onDisk`.
 */
export async function openProject(source: ProjectSource): Promise<OpenedProject> {
  const { project, warnings, skipped } = parseProject(source.text);
  const localFiles = source.localFiles ?? [];
  const byPath = new Map(localFiles.filter((file) => file.path !== undefined).map((file) => [nameKey(file.path!), file]));
  // By name: a file without a path, else the shallowest one with that name.
  const byName = new Map<string, LocalSourceFile>();
  const depth = (file: LocalSourceFile) => (file.path === undefined ? 0 : file.path.split('/').length);
  for (const file of [...localFiles].sort((a, b) => depth(a) - depth(b))) {
    if (!byName.has(nameKey(file.name))) byName.set(nameKey(file.name), file);
  }
  const fetchFn = source.fetch ?? fetch;
  const fileName = projectFileName(source.location, project.name);
  // Where the project file says its files are; its folder is found by its own name when it does not say (§ 3.2).
  const storedFolder = project.projectDirectory ?? projectFolderName(fileName);
  const sourceDirectory = project.sourceDirectory ?? DEFAULT_SOURCE_DIRECTORY;
  const candidatesFor = (name: string) => [diskPath(storedFolder, sourceDirectory, name), name];
  const fromUrl = isHttpUrl(source.location);

  const results = await Promise.all(
    project.files.map(async (entry): Promise<{ entry: ProjectFileEntry; content?: string; problem?: string; path?: string }> => {
      const refusal = entryFileRefusal(entry.name);
      if (refusal) return { entry, problem: refusal };
      if (entry.url === '') {
        // A file handed over with the project (chosen beside it, or read from its gist), or read from its folder.
        const { found, readError } = await findLocal(entry.name, candidatesFor(entry.name), source, byPath, byName);
        if (found) return { entry, ...found };
        if (fromUrl) {
          // A project opened from a URL: its folder is the URL's folder, flat (§ 5, D6).
          try {
            return { entry, content: await fetchText(new URL(entry.name, source.location).toString(), fetchFn) };
          } catch (error) {
            return { entry, problem: (error as Error).message };
          }
        }
        if (!source.readLocal) return { entry, problem: MISSING_LOCAL_FILE };
        return { entry, problem: `Not found in ${storedFolder}/${sourceDirectory} or next to the project file: ${readError ?? 'no such file'}` };
      }
      // A file with its own URL is downloaded; its saved copy, if there is one, tells where it is on disk.
      const copy = fromUrl ? {} : await findLocal(entry.name, candidatesFor(entry.name), source, byPath, byName);
      try {
        return { entry, content: await fetchText(entry.url, fetchFn), ...(copy.found?.path !== undefined ? { path: copy.found.path } : {}) };
      } catch (error) {
        // A copy picked from the project folder stands in for a download that failed.
        if (copy.found) return { entry, ...copy.found };
        return { entry, problem: (error as Error).message };
      }
    }),
  );

  const unloaded: Record<string, string> = {};
  const files: ProjectSourceFile[] = [];
  const onDisk: Record<string, string> = {};
  for (const { entry, content, problem, path } of results) {
    if (content === undefined) unloaded[nameKey(entry.name)] = problem ?? 'Not loaded.';
    else files.push({ name: entry.name, content });
    if (content !== undefined && path !== undefined) onDisk[nameKey(entry.name)] = path;
  }
  const onFolder = Object.keys(onDisk).length > 0;

  const opened: OpenProject = {
    version: project.version,
    name: project.name,
    board: project.board,
    description: project.description,
    fileName,
    sourceDirectory,
    ...(onFolder ? { onDisk, onDiskFileName: fileName } : {}),
    location: source.location,
    entries: project.files,
    unloaded,
    warnings: [
      ...warnings.filter((w) => !skipped.some((s) => s.name === w.fileName)).map((w) => w.message),
      ...skipped.map((s) => `${s.name} was skipped: ${s.reason}.`),
    ],
    savedText: '',
    ...(source.gist ? { gist: source.gist } : {}),
    ...(project.waveViews ? { waveViews: project.waveViews } : {}),
  };
  // Saved state is the project as it reads opened, so an untouched project shows no changes.
  return { project: withSaved(opened, files), files };
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
  const gist = parseStoredGistLink(r.gist);
  const excluded = Array.isArray(r.excluded) ? r.excluded.filter((key): key is string => typeof key === 'string') : [];
  // An older workspace stored one checksum for all files: read as unknown.
  const savedFiles =
    r.savedFiles && typeof r.savedFiles === 'object' && Object.values(r.savedFiles).every((value) => typeof value === 'string')
      ? (r.savedFiles as Record<string, string>)
      : undefined;
  // A workspace stored before project folders existed has none: `src`, and nothing known on disk.
  const sourceDirectory =
    typeof r.sourceDirectory === 'string' && folderNameProblem(r.sourceDirectory) === null ? r.sourceDirectory : DEFAULT_SOURCE_DIRECTORY;
  const onDisk =
    r.onDisk && typeof r.onDisk === 'object' && Object.values(r.onDisk).every((value) => typeof value === 'string')
      ? (r.onDisk as Record<string, string>)
      : undefined;
  const onDiskFileName = typeof r.onDiskFileName === 'string' ? r.onDiskFileName : undefined;
  const waveViews = parseWaveViews(r.waveViews, []);
  // A workspace stored before boards were configurable holds a version-1 project: it is on the Default board.
  return {
    version: CURRENT_PROJECT_VERSION,
    name: r.name as string,
    board: boardIdOf(r.version, r.board as string),
    description: r.description as string,
    fileName: r.fileName as string,
    sourceDirectory,
    ...(onDisk ? { onDisk } : {}),
    ...(onDiskFileName !== undefined ? { onDiskFileName } : {}),
    location: r.location as string,
    entries: entries.map(({ name, url, description }) => ({ name, url, description })),
    unloaded: unloaded as Record<string, string>,
    warnings,
    savedText: r.version === 1 ? savedTextInVersion2(r.savedText as string) : (r.savedText as string),
    ...(gist ? { gist } : {}),
    ...(excluded.length > 0 ? { excluded } : {}),
    ...(savedFiles ? { savedFiles } : {}),
    ...(waveViews ? { waveViews } : {}),
  };
}

/**
 * The saved text of a version-1 project as the same project reads in version 2, so a workspace
 * stored by HDLBoard 1.5 has nothing to save after the upgrade. Text that is not a project
 * file (none was saved yet) is kept as it is.
 */
function savedTextInVersion2(savedText: string): string {
  try {
    return serializeProject(parseProject(savedText).project);
  } catch {
    return savedText;
  }
}

/** Whether an uploaded file is a project file: `.hdlboard.json`, or any other `.json`. */
export function isProjectUpload(name: string): boolean {
  return /\.json$/i.test(name);
}

/** The project file among uploaded files: a `.hdlboard.json` first, else the first `.json`. */
export function pickProjectUpload<T extends { name: string }>(files: readonly T[]): T | undefined {
  return files.find((file) => isProjectFileName(file.name)) ?? files.find((file) => isProjectUpload(file.name));
}
