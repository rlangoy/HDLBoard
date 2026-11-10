// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { CatalogFile, ProjectSource } from '../projectCatalog';
import type { OpenProject } from '../projectFile';
import type { GitHubSyncState } from '../projectGitHub';

/** Where Save project writes the open project (issue #44: said plainly, never guessed). */
export type SaveDestination = ProjectSource;

/** The open project, as the Projects page shows it. */
export interface OpenProjectInfo {
  readonly name: string;
  readonly description: string;
  readonly files: readonly CatalogFile[];
  /** Where it was opened from or saved to: a path, or a web address; '' while new. */
  readonly location: string;
  readonly gistId: string | undefined;
  /** It has a project file on this computer (opened from or saved to a path, not a web address). */
  readonly onComputer: boolean;
  /** It differs from its project file on this computer as last opened or saved. */
  readonly changedSinceLocalSave: boolean;
  readonly syncState: GitHubSyncState;
  readonly destination: SaveDestination;
  /** Where it saves to does not hold it as it is now. */
  readonly unsaved: boolean;
}

export interface OpenProjectState {
  /** It differs from its project file as last opened or saved (hasUnsavedChanges). */
  readonly changedSinceLocalSave: boolean;
  readonly syncState: GitHubSyncState;
  /** It is being saved to GitHub for the first time (the first-save flow of the project settings). */
  readonly firstSaveToGitHub: boolean;
}

/** A project on GitHub saves there; any other saves on this computer. */
export function saveDestinationOf(project: OpenProject, firstSaveToGitHub: boolean): SaveDestination {
  return project.gist !== undefined || firstSaveToGitHub ? 'github' : 'local';
}

const WEB_ADDRESS = /^https?:\/\//i;

/** The open project as the Projects page needs it. */
export function openProjectInfo(project: OpenProject, state: OpenProjectState): OpenProjectInfo {
  const { name, description, location, gist, entries } = project;
  const destination = saveDestinationOf(project, state.firstSaveToGitHub);
  // Before its first save to GitHub there is nothing there to differ from: its own saved state counts.
  const savedAtDestination = gist !== undefined ? state.syncState === 'saved' : !state.changedSinceLocalSave;
  return {
    name,
    description,
    files: entries.map((entry) => ({ name: entry.name, description: entry.description })),
    location,
    gistId: gist?.gistId,
    onComputer: location !== '' && !WEB_ADDRESS.test(location),
    changedSinceLocalSave: state.changedSinceLocalSave,
    syncState: state.syncState,
    destination,
    unsaved: !savedAtDestination,
  };
}
