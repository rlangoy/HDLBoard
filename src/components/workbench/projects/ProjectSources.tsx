// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { AUTHORIZED_APPS_URL } from '../../../github/config';
import type { GitHubUser } from '../../../github/githubUser';
import { FolderOpenIcon, GitHubIcon, LaptopIcon, SignOutIcon } from '../icons';
import { MAX_LISTED_PROJECTS } from '../localProjectScan';
import type { GitHubConnection } from '../useGitHub';
import type { LocalProjects } from '../useLocalProjects';

/** On this computer: the projects folder, and the way to choose another. */
export function LocalFolderCard({ local }: { local: LocalProjects }) {
  return (
    <div className="wb-projects-source">
      <span className="wb-projects-source__tile" aria-hidden="true">
        <FolderOpenIcon />
      </span>
      <FolderState local={local} />
      <button type="button" className="wb-projects__btn" onClick={local.chooseFolder}>
        <FolderOpenIcon aria-hidden="true" />
        {local.folderState === 'none' ? 'Choose folder…' : 'Change folder…'}
      </button>
    </div>
  );
}

function FolderState({ local }: { local: LocalProjects }) {
  if (local.folderState === 'none') {
    return (
      <span className="wb-projects-source__text">
        <strong>No projects folder chosen</strong>
        <span className="wb-projects__muted">Choose the folder on this computer that holds your projects, and they are listed here.</span>
      </span>
    );
  }
  if (local.folderState === 'needs-permission') {
    return (
      <span className="wb-projects-source__text">
        <span>
          Location: <span className="wb-projects__mono">{local.folderLabel}</span>
        </span>
        <button type="button" className="wb-projects__link" onClick={local.allowAccess}>
          Allow access to list its projects
        </button>
      </span>
    );
  }
  return (
    <span className="wb-projects-source__text">
      <span>
        Location: <span className="wb-projects__mono" title={local.folderLabel}>{local.folderLabel}</span>
      </span>
      <FolderNotes local={local} />
    </span>
  );
}

/** What the reading of the folder left out, and whether the folder is remembered. */
function FolderNotes({ local }: { local: LocalProjects }) {
  const notes = [
    !local.remembered && 'Remembered for this visit only.',
    local.truncated && `Showing the first ${MAX_LISTED_PROJECTS} projects.`,
    local.skipped.length === 1 && '1 file could not be read.',
    local.skipped.length > 1 && `${local.skipped.length} files could not be read.`,
  ].filter(Boolean);
  if (notes.length === 0) return null;
  return (
    <span className="wb-projects__muted" title={local.skipped.map((file) => `${file.path}: ${file.reason}`).join('\n')}>
      {notes.join(' ')}
    </span>
  );
}

/** On GitHub: who is signed in (with Sign out), or the way to sign in. */
export function GitHubAccountCard({ connection, onSignIn }: { connection: GitHubConnection; onSignIn: () => void }) {
  if (connection.session === null) return <SignedOutCard signingIn={connection.step.kind !== 'idle'} onSignIn={onSignIn} />;
  return <SignedInCard connection={connection} user={connection.session.user} />;
}

function SignedOutCard({ signingIn, onSignIn }: { signingIn: boolean; onSignIn: () => void }) {
  return (
    <div className="wb-projects-source">
      <span className="wb-projects-source__tile is-github" aria-hidden="true">
        <GitHubIcon />
      </span>
      <span className="wb-projects-source__text">
        <strong>Connect GitHub</strong>
        <span className="wb-projects__muted">Sign in to see and save your projects on GitHub, on any computer.</span>
      </span>
      <button type="button" className="wb-projects__btn is-primary" onClick={onSignIn} disabled={signingIn}>
        <GitHubIcon aria-hidden="true" />
        {signingIn ? 'Signing in…' : 'Sign in'}
      </button>
    </div>
  );
}

function SignedInCard({ connection, user }: { connection: GitHubConnection; user: GitHubUser }) {
  return (
    <div className="wb-projects-source">
      {user.avatarUrl !== '' ? (
        <img className="wb-projects-source__avatar" src={user.avatarUrl} alt="" />
      ) : (
        <span className="wb-projects-source__tile is-github" aria-hidden="true">
          <GitHubIcon />
        </span>
      )}
      <span className="wb-projects-source__text">
        <span>
          Signed in as <strong>{user.login}</strong>
        </span>
        <span className="wb-projects__muted">
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

export interface SourcesFooterProps {
  local: LocalProjects;
  connection: GitHubConnection;
  onSignIn: () => void;
}

/** All projects: where the list comes from, at its foot. Each place's own section has the full story. */
export function SourcesFooter({ local, connection, onSignIn }: SourcesFooterProps) {
  const login = connection.session?.user.login;
  return (
    <div className="wb-projects-sources">
      <span>
        <LaptopIcon aria-hidden="true" />
        {local.folderState === 'none' ? (
          <button type="button" className="wb-projects__link" onClick={local.chooseFolder}>
            Choose your projects folder…
          </button>
        ) : (
          <>
            Local folder: <span className="wb-projects__mono" title={local.folderLabel}>{local.folderLabel}</span>
          </>
        )}
      </span>
      <span>
        <GitHubIcon aria-hidden="true" />
        {login ? (
          <>
            Signed in as <strong>{login}</strong>
          </>
        ) : (
          <button type="button" className="wb-projects__link" onClick={onSignIn}>
            Sign in to GitHub…
          </button>
        )}
      </span>
    </div>
  );
}
