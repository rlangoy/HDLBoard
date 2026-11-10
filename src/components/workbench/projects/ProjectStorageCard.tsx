// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState, type ReactNode } from 'react';
import { copyText } from '../clipboard';
import type { ProjectGistLink } from '../gistLink';
import { Activity } from '../GitHubStatus';
import { CloudDownloadIcon, CloudUploadIcon, CopyIcon, DeleteIcon, InfoIcon, SaveIcon } from '../icons';
import { PLACE, PlaceIcon } from './places';
import { FoldingPageCard } from '../page/PageCard';
import type { OpenProject } from '../projectFile';
import { pendingLayoutChange, sourceFolderOf } from '../projectLayout';
import type { GitHubProjects } from '../useGitHubProjects';
import type { OpenProjectInfo } from './openProject';
import { SavedChip, type SavedState } from './StateChip';

/** Saving on this computer: what Save does there, and the folders the last save emptied. */
export interface LocalStorage {
  /** Where Save to this computer writes, for its tooltip. */
  saveHint: string;
  /** Folders the last save emptied (docs/impl_project_structure.md D13): offered for removal, never removed unasked. */
  emptiedFolders: readonly string[];
  onRemoveFolder: (folder: string) => void;
}

/** Saving on GitHub (docs/GITHUB.md). */
export interface GitHubStorage {
  link: ProjectGistLink | undefined;
  /** The project was opened from someone else's gist: Save to GitHub saves a copy. */
  someoneElses: boolean;
  projects: GitHubProjects;
}

export interface ProjectStorageCardProps {
  project: OpenProject;
  info: OpenProjectInfo;
  /** Saving or opening is under way: the buttons wait. */
  busy: boolean;
  local: LocalStorage;
  github: GitHubStorage;
  onSaveToComputer: () => void;
  onSaveToGitHub: () => void;
}

/** Active project › Storage: the project on this computer and on GitHub, each with its own saved state. */
export function ProjectStorageCard(props: ProjectStorageCardProps) {
  return (
    <FoldingPageCard title="Storage" icon={<SaveIcon />}>
      <LocalPlace {...props} />
      <LayoutHint project={props.project} />
      <EmptiedFolders local={props.local} busy={props.busy} />
      <GitHubPlace {...props} />
      <Activity projects={props.github.projects} />
    </FoldingPageCard>
  );
}

function localState(info: OpenProjectInfo): SavedState {
  if (!info.onComputer) return 'not-saved';
  return info.changedSinceLocalSave ? 'changed' : 'saved';
}

const GITHUB_STATE: Record<OpenProjectInfo['syncState'], SavedState> = { 'not-on-github': 'not-saved', saved: 'saved', changed: 'changed' };

function LocalPlace({ info, busy, local, onSaveToComputer }: ProjectStorageCardProps) {
  return (
    <StoragePlace
      icon={<PlaceIcon place="local" />}
      title={PLACE.local.title}
      state={localState(info)}
      destination={info.destination === 'local'}
      where={info.onComputer ? <span className="wb-projects__mono" title={info.location}>{info.location}</span> : 'Not saved on this computer yet.'}
    >
      <button type="button" className="wb-projects__btn" onClick={onSaveToComputer} disabled={busy} title={local.saveHint}>
        <SaveIcon aria-hidden="true" />
        Save to {PLACE.local.name}
      </button>
    </StoragePlace>
  );
}

/** Folders the last save emptied: offered for removal, never removed unasked. */
function EmptiedFolders({ local, busy }: { local: LocalStorage; busy: boolean }) {
  return local.emptiedFolders.map((folder) => (
    <p key={folder} className="wb-active__notice" role="status">
      <span>
        The old folder <span className="wb-projects__mono">{folder}</span> is empty.
      </span>
      <button type="button" className="wb-projects__btn" onClick={() => local.onRemoveFolder(folder)} disabled={busy}>
        <DeleteIcon aria-hidden="true" />
        Remove folder
      </button>
    </p>
  ));
}

function GitHubPlace({ info, busy, github, onSaveToGitHub }: ProjectStorageCardProps) {
  const waiting = busy || github.projects.busy !== null;
  const { link } = github;
  return (
    <StoragePlace
      icon={<PlaceIcon place="github" />}
      title={PLACE.github.title}
      state={GITHUB_STATE[info.syncState]}
      destination={info.destination === 'github'}
      where={link ? <GistAddress link={link} /> : 'Save it on your GitHub account to open it on any computer. It is stored as a secret gist.'}
    >
      <button type="button" className="wb-projects__btn" onClick={onSaveToGitHub} disabled={waiting || info.syncState === 'saved'}>
        <CloudUploadIcon aria-hidden="true" />
        {github.someoneElses ? 'Save a copy to my GitHub' : 'Save to GitHub'}
      </button>
      {link && (
        <button type="button" className="wb-projects__btn" onClick={github.projects.getGitHubVersion} disabled={waiting} title="Open the project as it is on GitHub, for example after working on another computer">
          <CloudDownloadIcon aria-hidden="true" />
          Get the GitHub version
        </button>
      )}
      {github.someoneElses && link && (
        <span className="wb-projects__muted">Opened from {link.ownerLogin}'s GitHub: save a copy to your own to keep your changes there.</span>
      )}
    </StoragePlace>
  );
}

interface StoragePlaceProps {
  icon: ReactNode;
  title: string;
  state: SavedState;
  /** Save project writes here. */
  destination: boolean;
  where: ReactNode;
  /** The place's buttons. */
  children: ReactNode;
}

/** One place the project can be stored: where exactly, whether it holds the project as it is now, and its buttons. */
function StoragePlace({ icon, title, state, destination, where, children }: StoragePlaceProps) {
  return (
    <div className="wb-active__place">
      <span className="wb-active__place-icon" aria-hidden="true">{icon}</span>
      <div className="wb-active__place-text">
        <span className="wb-active__place-title">
          <strong>{title}</strong>
          {destination && <span className="wb-projects-chip is-destination">Save goes here</span>}
        </span>
        <span className="wb-active__place-where">{where}</span>
      </div>
      <SavedChip state={state} />
      <div className="wb-active__place-actions">{children}</div>
    </div>
  );
}

const COPIED_FEEDBACK_MS = 2000;

/** The gist's own address: it opens on GitHub, and Open from a URL takes it as it is. */
function GistAddress({ link }: { link: ProjectGistLink }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <span className="wb-active__gist">
      <a href={link.htmlUrl} target="_blank" rel="noreferrer" className="wb-projects__mono">
        {link.htmlUrl.replace(/^https:\/\//, '')}
      </a>
      <button type="button" className="wb-projects__link" onClick={() => void copyText(link.htmlUrl).then(setCopied)} title="Copy the address of this project's gist, to share it">
        <CopyIcon aria-hidden="true" />
        {copied ? 'Link copied' : 'Copy share link'}
      </button>
    </span>
  );
}

/**
 * What the next save does to the files on disk (docs/impl_project_structure.md § 7): copy a
 * flat project into its source folder, or move the files to a new one. Nothing is said
 * about the flat files themselves: they are left alone (D9).
 */
function LayoutHint({ project }: { project: OpenProject }) {
  const change = pendingLayoutChange(project);
  const target = <span className="wb-projects__mono">{sourceFolderOf(project)}</span>;
  let text: ReactNode = null;
  if (change.renamedOutsideFrom !== undefined) {
    text = (
      <>
        The project file was renamed: its files move from <span className="wb-projects__mono">{change.renamedOutsideFrom}</span> to {target} when you save.
      </>
    );
  } else if (change.move) {
    text = <>Files move to {target} when you save.</>;
  } else if (change.copy) {
    text = <>Files are copied to {target} when you save.</>;
  }
  if (text === null) return null;
  return (
    <p className="wb-active__notice" role="status">
      <InfoIcon aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
