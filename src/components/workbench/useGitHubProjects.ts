// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GistChangedError,
  type OpenedGistProject,
  type ProjectGists,
  type ProjectSnapshot,
  type SaveResult,
} from '../../github/projectGists';
import type { IndexEntry } from '../../github/projectIndex';
import type { OpenProject } from './projectFile';
import { describeSavePlan, gitHubSyncState, projectSnapshot, withoutGistLink, withSavedGistLink, type SourceFile } from './projectGitHub';
import type { GitHubConnection } from './useGitHub';

export interface GitHubMessage {
  tone: 'success' | 'error';
  text: string;
}

/** Saving stopped because the project on GitHub changed (or may have) since it was opened here. */
export interface SaveConflict {
  whenKnown: boolean;
}

export interface GitHubProjects {
  /** The user's projects on GitHub, newest first; null until read. */
  entries: IndexEntry[] | null;
  /** What is being done, e.g. "Saving to GitHub…"; the buttons wait while it runs. */
  busy: string | null;
  message: GitHubMessage | null;
  conflict: SaveConflict | null;
  refresh(): void;
  open(entry: IndexEntry): void;
  remove(entry: IndexEntry): void;
  /**
   * Save to GitHub: a new gist the first time, then that gist — or, for a project opened
   * from someone else's gist, a copy in a new gist of the user's own. Asks to sign in first.
   */
  save(): void;
  /** Opens the project again as it is on GitHub, replacing the files here. */
  getGitHubVersion(): void;
  /** The conflict's answers: save over GitHub's version, or open it instead. */
  replaceGitHubVersion(): void;
  dismissConflict(): void;
}

export interface GitHubProjectsOptions {
  github: GitHubConnection;
  project: OpenProject | null;
  /** The files in Files: the open project's files. */
  files: readonly SourceFile[];
  setProject: (update: (project: OpenProject | null) => OpenProject | null) => void;
  /** Opens a project read from its gist, replacing Files. Returns why not, or null. */
  openGistProject: (opened: OpenedGistProject) => Promise<string | null>;
  /** Shows the GitHub dialog, so the user can sign in. */
  showSignIn: () => void;
  log: (text: string, tone?: 'success' | 'error') => void;
}

type SignedInAction = (projects: ProjectGists) => Promise<void>;

/** The GitHub actions on projects (docs/GITHUB.md), for the GitHub dialog and the project page. */
export function useGitHubProjects(options: GitHubProjectsOptions): GitHubProjects {
  const { github, project, files, setProject, openGistProject, showSignIn, log } = options;
  const projects = github.session?.projects ?? null;
  const [entries, setEntries] = useState<IndexEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<GitHubMessage | null>(null);
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  // An action the user started while signed out; it runs once they have signed in.
  const afterSignIn = useRef<SignedInAction | null>(null);

  const report = useCallback(
    (tone: GitHubMessage['tone'], text: string) => {
      setMessage({ tone, text });
      log(text, tone);
    },
    [log],
  );

  const run = useCallback(
    async (activity: string, action: () => Promise<void>) => {
      setBusy(activity);
      setMessage(null);
      try {
        await action();
      } catch (failure) {
        report('error', failure instanceof Error ? failure.message : String(failure));
      } finally {
        setBusy(null);
      }
    },
    [report],
  );

  const whenSignedIn = (action: SignedInAction) => {
    if (projects !== null) return void action(projects);
    afterSignIn.current = action;
    showSignIn();
  };

  const refresh = useCallback(() => {
    if (projects === null) return;
    void run('Reading your projects on GitHub…', async () => setEntries(await projects.list()));
  }, [projects, run]);

  useEffect(() => {
    setEntries(null);
    refresh();
    const pending = afterSignIn.current;
    afterSignIn.current = null;
    if (pending !== null && projects !== null) void pending(projects);
  }, [projects, refresh]);

  const linkSaved = (result: SaveResult, saved: ProjectSnapshot) => {
    setProject((current) => current && withSavedGistLink(current, result.link, saved));
    setConflict(null);
    refresh();
  };

  const publish = (target: ProjectGists, current: ProjectSnapshot) =>
    run('Saving to GitHub…', async () => {
      linkSaved(await target.publish(current), current);
      report('success', `Saved ${current.name} to GitHub as a new secret gist.`);
    });

  const saveOver = (current: ProjectSnapshot, write: (snapshot: ProjectSnapshot) => Promise<SaveResult>) =>
    run('Saving to GitHub…', async () => {
      try {
        const result = await write(current);
        linkSaved(result, current);
        report('success', `Saved ${current.name} to GitHub: ${describeSavePlan(result.plan)}.`);
      } catch (failure) {
        if (!(failure instanceof GistChangedError)) throw failure;
        setConflict({ whenKnown: failure.whenKnown });
      }
    });

  const save = () => {
    if (project === null) return;
    const current = projectSnapshot(project, files);
    const link = project.gist;
    whenSignedIn(async (target) => {
      if (link === undefined || !target.isOwnedByUser(link)) await publish(target, current);
      else await saveOver(current, (snapshot) => target.save(link, snapshot));
    });
  };

  const replaceGitHubVersion = () => {
    const link = project?.gist;
    if (projects === null || project === null || link === undefined) return;
    void saveOver(projectSnapshot(project, files), (snapshot) => projects.saveReplacingChanges(link, snapshot));
  };

  const openGist = (target: ProjectGists, gistId: string) =>
    run('Opening the project from GitHub…', async () => {
      const problem = await openGistProject(await target.open(gistId));
      if (problem !== null) throw new Error(problem);
      setConflict(null);
    });

  const open = (entry: IndexEntry) => {
    if (!confirmReplacingFiles(project, files, `Open ${entry.name} from GitHub?`)) return;
    whenSignedIn((target) => openGist(target, entry.gistId));
  };

  const getGitHubVersion = () => {
    const link = project?.gist;
    if (link === undefined || !confirmLosingChanges(project, files)) return;
    whenSignedIn((target) => openGist(target, link.gistId));
  };

  const remove = (entry: IndexEntry) => {
    if (projects === null || !window.confirm(deleteQuestion(entry))) return;
    void run(`Deleting ${entry.name} from GitHub…`, async () => {
      await projects.remove(entry.gistId);
      if (project?.gist?.gistId === entry.gistId) setProject((current) => current && withoutGistLink(current));
      setEntries((current) => current?.filter((other) => other.gistId !== entry.gistId) ?? null);
      report('success', `Deleted ${entry.name} from GitHub. The files open in HDLBoard are kept.`);
    });
  };

  return {
    entries,
    busy,
    message,
    conflict,
    refresh,
    open,
    remove,
    save,
    getGitHubVersion,
    replaceGitHubVersion,
    dismissConflict: () => setConflict(null),
  };
}

function deleteQuestion(entry: IndexEntry): string {
  return `Delete ${entry.name} from GitHub?\n\nIts gist and all its files are deleted on GitHub. This cannot be undone. The files open in HDLBoard are kept.`;
}

/** Opening another project replaces Files: ask first when the open project has changes not saved anywhere. */
function confirmReplacingFiles(project: OpenProject | null, files: readonly SourceFile[], question: string): boolean {
  if (project === null || gitHubSyncState(project, files) !== 'changed') return true;
  return window.confirm(`${question}\n\n${project.name} has changes that are not saved to GitHub. They are lost when another project opens.`);
}

function confirmLosingChanges(project: OpenProject | null, files: readonly SourceFile[]): boolean {
  if (project === null || gitHubSyncState(project, files) !== 'changed') return true;
  return window.confirm('Replace the files in HDLBoard with the version on GitHub?\n\nYour changes since the last Save to GitHub are lost.');
}
