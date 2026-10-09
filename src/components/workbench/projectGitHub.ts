// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * An open project and the GitHub gist it is stored in (docs/GITHUB.md): what Save to
 * GitHub sends, and whether the project still matches what is on GitHub.
 * Pure: no React, no network.
 */

import { fingerprintOf, type GistSavePlan } from '../../github/gistSavePlan';
import type { GistLink, ProjectSnapshot } from '../../github/projectGists';
import { baseName, isProjectFileName, nameKey } from '../../project/fileName';
import { parseGistRef } from '../../project/gistUrl';
import { projectEntries, projectFileText, type OpenProject } from './projectFile';

export interface SourceFile {
  name: string;
  content: string;
}

/** Not stored on GitHub yet; the same as on GitHub; or changed since it was last saved there. */
export type GitHubSyncState = 'not-on-github' | 'saved' | 'changed';

/**
 * The project as Save to GitHub stores it: the project file, and every file of the
 * project that is stored next to it. A file with its own URL stays at that URL.
 */
export function projectSnapshot(project: OpenProject, files: readonly SourceFile[]): ProjectSnapshot {
  const fileNames = files.map((file) => file.name);
  const rows = projectEntries(project, fileNames);
  const storedHere = new Set(rows.filter((row) => row.url === '' && row.status === 'loaded').map((row) => nameKey(row.name)));
  return {
    name: project.name,
    description: project.description,
    projectFileName: project.fileName,
    files: [
      { name: project.fileName, content: projectFileText(project, fileNames) },
      ...files.filter((file) => storedHere.has(nameKey(file.name))).map(({ name, content }) => ({ name, content })),
    ],
    listedNames: rows.map((row) => row.name),
  };
}

export function gitHubSyncState(project: OpenProject, files: readonly SourceFile[]): GitHubSyncState {
  if (!project.gist) return 'not-on-github';
  return fingerprintOf(projectSnapshot(project, files).files) === project.gist.fingerprint ? 'saved' : 'changed';
}

/** The project as just opened from or saved to `link`: what it holds now is what GitHub holds. */
export function withGistLink(project: OpenProject, link: GistLink, files: readonly SourceFile[]): OpenProject {
  return { ...project, gist: { ...link, fingerprint: fingerprintOf(projectSnapshot(project, files).files) } };
}

/** The project just saved to `link`: GitHub holds exactly `saved`, whatever was edited while it was sent. */
export function withSavedGistLink(project: OpenProject, link: GistLink, saved: ProjectSnapshot): OpenProject {
  return { ...project, gist: { ...link, fingerprint: fingerprintOf(saved.files) } };
}

/** The project is no longer stored on GitHub (its gist was deleted). */
export function withoutGistLink(project: OpenProject): OpenProject {
  const { gist: _removed, ...rest } = project;
  return rest;
}

/**
 * The gist a project file's address points into, for a project opened by its URL
 * (Open Project, `?project=`) rather than through GitHub. When it changed on GitHub
 * is not known, so Save to GitHub asks before saving over it.
 */
export function gistLinkFromUrl(projectUrl: string): GistLink | undefined {
  const ref = parseGistRef(projectUrl);
  const projectFileName = baseName(projectUrl);
  if (ref === null || !isProjectFileName(projectFileName)) return undefined;
  return {
    gistId: ref.gistId,
    htmlUrl: `https://gist.github.com/${ref.owner}/${ref.gistId}`,
    ownerLogin: ref.owner,
    projectFileName,
    updatedAt: '',
  };
}

/** A link that opens the project in HDLBoard for anyone who has it (`?project=`, docs/PROJECTS.md). */
export function shareLink(pageUrl: string, link: GistLink): string {
  const page = new URL(pageUrl);
  page.search = '';
  page.hash = '';
  page.searchParams.set('project', link.htmlUrl);
  return page.toString();
}

/** "2 files changed, 1 new, 1 deleted", or "no changes". */
export function describeSavePlan(plan: GistSavePlan): string {
  const count = (kind: string) => plan.changes.filter((change) => change.kind === kind).length;
  const parts = [
    plural(count('update'), 'file changed', 'files changed'),
    plural(count('add'), 'new file', 'new files'),
    plural(count('delete'), 'file deleted', 'files deleted'),
  ].filter((part) => part !== '');
  return parts.length === 0 ? 'no changes' : parts.join(', ');
}

function plural(count: number, one: string, many: string): string {
  if (count === 0) return '';
  return `${count} ${count === 1 ? one : many}`;
}
