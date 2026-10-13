// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { AUTHORIZED_APPS_URL } from '../../github/config';
import { GitHubStatus } from './GitHubStatus';
import { CloudUploadIcon, GitHubIcon, ProjectIcon, SignOutIcon } from './icons';
import type { GitHubSyncState } from './projectGitHub';
import type { GitHubConnection } from './useGitHub';
import './GitHub.css';

/** The open project, as the Projects page shows it. */
export interface OpenProjectInfo {
  name: string;
  gistId: string | undefined;
  /** Where it was opened from or saved to: a path, or the gist's address. */
  location: string;
  syncState: GitHubSyncState;
  /** It differs from its project file as last opened or saved. */
  unsaved: boolean;
}

/** Who is signed in to GitHub (with Sign out), or the way to sign in. */
export function AccountCard({ connection, onSignIn }: { connection: GitHubConnection; onSignIn: () => void }) {
  const { session } = connection;
  if (session === null) return <SignedOutCard signingIn={connection.step.kind !== 'idle'} onSignIn={onSignIn} />;
  const { user } = session;
  return (
    <div className="wb-projects__account">
      {user.avatarUrl !== '' && <img className="wb-projects__avatar" src={user.avatarUrl} alt="" />}
      <span className="wb-projects__account-text">
        <span>
          Signed in as <strong>{user.login}</strong>
        </span>
        <span className="wb-projects__small">
          {connection.remembersSignIn ? 'Remembered on this computer until you sign out.' : 'Until you close this tab.'}{' '}
          <a href={AUTHORIZED_APPS_URL} target="_blank" rel="noreferrer">
            Manage access on GitHub
          </a>
        </span>
      </span>
      <button type="button" className="wb-projects__btn" onClick={connection.signOut}>
        <SignOutIcon aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

function SignedOutCard({ signingIn, onSignIn }: { signingIn: boolean; onSignIn: () => void }) {
  return (
    <div className="wb-projects__account">
      <span className="wb-projects__gh-tile" aria-hidden="true">
        <GitHubIcon />
      </span>
      <span className="wb-projects__account-text">
        <strong>Connect GitHub</strong>
        <span className="wb-projects__small">Sign in to see and save your projects on GitHub, on any computer.</span>
      </span>
      <button type="button" className="wb-projects__btn is-dark" onClick={onSignIn} disabled={signingIn}>
        {signingIn ? <span className="wb-github__spinner" aria-hidden="true" /> : <GitHubIcon aria-hidden="true" />}
        {signingIn ? 'Signing in…' : 'Sign in with GitHub'}
      </button>
    </div>
  );
}

export interface OpenNowCardProps {
  project: OpenProjectInfo;
  /** A GitHub action is running. */
  busy: boolean;
  onShowProjectPage: () => void;
  onSaveToGitHub: () => void;
}

/** The project open now: whether it is on GitHub, whether it is saved, and the two ways on from here. */
export function OpenNowCard({ project, busy, onShowProjectPage, onSaveToGitHub }: OpenNowCardProps) {
  return (
    <div className="wb-projects__current">
      <span className="wb-projects__current-text">
        <span className="wb-projects__small">Open now</span>
        <strong>{project.name || 'Untitled project'}</strong>
      </span>
      <GitHubStatus state={project.syncState} />
      {project.unsaved && <span className="wb-projects__chip is-warn">Unsaved changes</span>}
      <button type="button" className="wb-projects__btn" onClick={onShowProjectPage}>
        <ProjectIcon aria-hidden="true" />
        Project page
      </button>
      <button type="button" className="wb-projects__btn is-primary" onClick={onSaveToGitHub} disabled={busy || project.syncState === 'saved'}>
        <CloudUploadIcon aria-hidden="true" />
        Save to GitHub
      </button>
    </div>
  );
}
