// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { isProjectFileName } from '../project/fileName';
import { parseProject } from '../project/parseProject';
import { gistRawUrl } from '../project/gistUrl';
import type { Gist, GistClient, TextFile } from './gistClient';
import type { GistProjectIndex } from './gistProjectIndex';
import { GitHubApiError } from './githubHttp';
import type { GitHubUser } from './githubUser';
import { isUpToDate, planGistSave, toGistFileChanges, type GistSavePlan } from './gistSavePlan';
import { newestFirst, type IndexEntry } from './projectIndex';

/**
 * The user's HDLBoard projects on GitHub (docs/GITHUB.md): one secret gist per
 * project — the project file and its files — listed in the project index.
 */

/** Which gist a project in HDLBoard is stored in, as it was when last opened or saved. */
export interface GistLink {
  gistId: string;
  htmlUrl: string;
  /** The GitHub user the gist belongs to; only they can save to it. */
  ownerLogin: string;
  /** The project file's name in the gist. */
  projectFileName: string;
  /** The gist's `updated_at` when last opened or saved; empty when unknown. */
  updatedAt: string;
}

/** A project as HDLBoard would save it now. */
export interface ProjectSnapshot {
  name: string;
  description: string;
  projectFileName: string;
  /** The project file first, then each file stored next to it. */
  files: TextFile[];
  /** Every file the project file lists, also those not loaded or stored at their own URL. */
  listedNames: readonly string[];
}

export interface OpenedGistProject {
  link: GistLink;
  projectFileText: string;
  /** Every file in the gist; the project's are among them. */
  files: TextFile[];
  /** Where the project file can be read without signing in. */
  rawProjectUrl: string;
}

export interface SaveResult {
  link: GistLink;
  plan: GistSavePlan;
}

export type ProjectGistProblem = 'no-project-file' | 'several-project-files' | 'empty-files' | 'not-owner';

export class ProjectGistError extends Error {
  constructor(
    readonly kind: ProjectGistProblem,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectGistError';
  }
}

/** The gist was changed on GitHub (or may have been) since this project was opened or saved here. */
export class GistChangedError extends Error {
  constructor(readonly whenKnown: boolean) {
    super(
      whenKnown
        ? 'The project was changed on GitHub after you opened it here, maybe on another computer or on github.com.'
        : 'HDLBoard cannot tell whether the project on GitHub was changed since you opened it.',
    );
    this.name = 'GistChangedError';
  }
}

export class ProjectGists {
  constructor(
    private readonly gists: GistClient,
    private readonly index: GistProjectIndex,
    private readonly user: GitHubUser,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<IndexEntry[]> {
    return newestFirst(await this.index.listEntries());
  }

  async open(gistId: string): Promise<OpenedGistProject> {
    const gist = await this.gists.getGist(gistId);
    const projectFile = requireOneProjectFile(gist);
    return {
      link: linkTo(gist, projectFile.name),
      projectFileText: projectFile.content,
      files: gist.files,
      rawProjectUrl: gistRawUrl({ owner: gist.ownerLogin, gistId: gist.id }, projectFile.name),
    };
  }

  isOwnedByUser(link: GistLink): boolean {
    return link.ownerLogin === '' || link.ownerLogin.toLowerCase() === this.user.login.toLowerCase();
  }

  /** Stores the project in a new secret gist and lists it in the index. */
  async publish(snapshot: ProjectSnapshot): Promise<SaveResult> {
    requireNoEmptyFiles(snapshot.files);
    const gist = await this.gists.createGist(gistDescriptionFor(snapshot.name), snapshot.files);
    const createdAt = this.timestamp();
    await this.index.register({ ...this.indexEntryFor(snapshot, gist), createdAt });
    return { link: linkTo(gist, snapshot.projectFileName), plan: { changes: [], unchangedFileNames: gist.fileNames } };
  }

  /** Saves the project over its gist. Throws GistChangedError when the gist changed since `link`. */
  async save(link: GistLink, snapshot: ProjectSnapshot): Promise<SaveResult> {
    const gist = await this.readOwnGist(link, snapshot);
    if (link.updatedAt === '' || gist.updatedAt !== link.updatedAt) throw new GistChangedError(link.updatedAt !== '');
    return this.writeChanges(gist, link, snapshot);
  }

  /** Saves the project over its gist even if it was changed on GitHub: the user chose to replace it. */
  async saveReplacingChanges(link: GistLink, snapshot: ProjectSnapshot): Promise<SaveResult> {
    return this.writeChanges(await this.readOwnGist(link, snapshot), link, snapshot);
  }

  /** Deletes the project's gist and takes it off the list. A gist already gone is not an error. */
  async remove(gistId: string): Promise<void> {
    try {
      await this.gists.deleteGist(gistId);
    } catch (error) {
      if (!(error instanceof GitHubApiError && error.kind === 'not-found')) throw error;
    }
    await this.index.unregister(gistId);
  }

  private async readOwnGist(link: GistLink, snapshot: ProjectSnapshot): Promise<Gist> {
    if (!this.isOwnedByUser(link)) {
      throw new ProjectGistError('not-owner', `This project is stored in ${link.ownerLogin}'s gist. Save a copy to your own GitHub instead.`);
    }
    requireNoEmptyFiles(snapshot.files);
    return this.gists.getGist(link.gistId);
  }

  private async writeChanges(gist: Gist, link: GistLink, snapshot: ProjectSnapshot): Promise<SaveResult> {
    const plan = planGistSave(snapshot.files, gist.files, removableFiles(gist, link, snapshot));
    const description = gistDescriptionFor(snapshot.name);
    const needsWrite = !isUpToDate(plan) || gist.description !== description;
    const saved = needsWrite ? await this.gists.updateGist(gist.id, toGistFileChanges(plan, snapshot.files), description) : gist;
    await this.index.register({ ...this.indexEntryFor(snapshot, saved), createdAt: '' });
    return { link: linkTo(saved, snapshot.projectFileName), plan };
  }

  private indexEntryFor(snapshot: ProjectSnapshot, gist: Gist): Omit<IndexEntry, 'createdAt'> {
    return { name: snapshot.name, description: snapshot.description, url: gist.htmlUrl, gistId: gist.id, updatedAt: this.timestamp() };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

export function gistDescriptionFor(projectName: string): string {
  return `HDLBoard project: ${projectName}`;
}

function linkTo(gist: Gist, projectFileName: string): GistLink {
  return { gistId: gist.id, htmlUrl: gist.htmlUrl, ownerLogin: gist.ownerLogin, projectFileName, updatedAt: gist.updatedAt };
}

function requireOneProjectFile(gist: Gist): TextFile {
  const projectFiles = gist.files.filter((file) => isProjectFileName(file.name));
  if (projectFiles.length === 0) {
    throw new ProjectGistError('no-project-file', 'This gist holds no HDLBoard project file (a file ending in .hdlboard.json).');
  }
  if (projectFiles.length > 1) {
    const names = projectFiles.map((file) => file.name).join(', ');
    throw new ProjectGistError('several-project-files', `This gist holds several project files (${names}). Open one with Open Project.`);
  }
  return projectFiles[0];
}

/**
 * Gist files that left the project: the project file and its files as the gist's
 * own project file lists them, minus what the project still lists. A file the
 * project never listed (a README added on github.com) is never deleted.
 */
function removableFiles(gist: Gist, link: GistLink, snapshot: ProjectSnapshot): Set<string> {
  const stillListed = new Set(snapshot.listedNames);
  return new Set([link.projectFileName, ...filesListedIn(gist, link.projectFileName)].filter((name) => !stillListed.has(name)));
}

function filesListedIn(gist: Gist, projectFileName: string): string[] {
  const projectFile = gist.files.find((file) => file.name === projectFileName);
  if (projectFile === undefined) return [];
  try {
    return parseProject(projectFile.content).project.files.filter((entry) => entry.url === '').map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** GitHub refuses empty gist files, and an empty file in a change would delete it. */
function requireNoEmptyFiles(files: readonly TextFile[]): void {
  const empty = files.filter((file) => file.content.trim() === '').map((file) => file.name);
  if (empty.length > 0) {
    throw new ProjectGistError('empty-files', `GitHub cannot store empty files: ${empty.join(', ')}. Write something in them, or delete them.`);
  }
}
