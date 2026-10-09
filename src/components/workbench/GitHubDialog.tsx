// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AUTHORIZED_APPS_URL, NEW_TOKEN_URL } from '../../github/config';
import type { DeviceCode } from '../../github/deviceFlow';
import type { IndexEntry } from '../../github/projectIndex';
import type { GitHubUser } from '../../github/githubUser';
import { copyText } from './clipboard';
import { Dialog } from './Dialog';
import { Activity, GitHubStatus } from './GitHubStatus';
import { CloudUploadIcon, CopyIcon, DeleteIcon, GitHubIcon, OpenInIcon, ProjectIcon, RefreshIcon, SignOutIcon } from './icons';
import type { GitHubSyncState } from './projectGitHub';
import type { GitHubConnection, SignInStep } from './useGitHub';
import type { GitHubProjects } from './useGitHubProjects';
import './GitHub.css';

/** The open project, as the GitHub dialog shows it. */
export interface OpenProjectSummary {
  name: string;
  gistId: string | undefined;
  syncState: GitHubSyncState;
}

export interface GitHubDialogProps {
  connection: GitHubConnection;
  projects: GitHubProjects;
  openProject: OpenProjectSummary | null;
  onClose: () => void;
}

/**
 * The GitHub dialog (docs/GITHUB.md): sign in, then the user's projects on GitHub —
 * open one, delete one, or save the open project there.
 */
export function GitHubDialog({ connection, projects, openProject, onClose }: GitHubDialogProps) {
  const { session } = connection;
  // Once, as the dialog opens: running it again on every sign-in step would retry a failed sign-in in a loop.
  const prepareOnOpen = useRef(connection.prepare);
  useEffect(() => prepareOnOpen.current(), []);

  return (
    <Dialog
      open
      onClose={onClose}
      title="GitHub"
      subtitle="Keep your projects on GitHub, and open them on any computer"
      icon={<GitHubIcon />}
      size="wide"
    >
      {session === null ? (
        <SignInPanel connection={connection} />
      ) : (
        <SignedInPanel user={session.user} connection={connection} projects={projects} openProject={openProject} />
      )}
    </Dialog>
  );
}

function SignInPanel({ connection }: { connection: GitHubConnection }) {
  const { step } = connection;
  if (step.kind === 'device-code') return <DeviceCodeSteps code={step.code} onCancel={connection.cancel} />;
  if (step.kind !== 'idle') return <Waiting step={step} onCancel={connection.cancel} />;
  return <SignedOut connection={connection} />;
}

const WAITING_TEXT: Record<Exclude<SignInStep['kind'], 'idle' | 'device-code'>, string> = {
  restoring: 'Signing in to GitHub…',
  starting: 'Connecting to GitHub…',
  'waiting-for-github': 'Click “Authorize” in the GitHub window…',
};

function Waiting({ step, onCancel }: { step: Exclude<SignInStep, { kind: 'idle' } | { kind: 'device-code' }>; onCancel: () => void }) {
  return (
    <div className="wb-github__waiting" role="status">
      <span className="wb-github__spinner" aria-hidden="true" />
      <span>{WAITING_TEXT[step.kind]}</span>
      {step.kind === 'waiting-for-github' && (
        <button type="button" className="wb-github__btn" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

function SignedOut({ connection }: { connection: GitHubConnection }) {
  return (
    <div className="wb-github__signin">
      <p className="wb-github__lead">Sign in once, and HDLBoard can save your projects on your GitHub account and open them again on any computer.</p>
      <ul className="wb-github__facts">
        <li>Each project is stored as a <strong>secret gist</strong>: only people you give its link to can see it.</li>
        <li>HDLBoard asks for access to your <strong>gists only</strong> (read, save, delete and list them), never your repositories.</li>
        <li>
          {connection.remembersSignIn
            ? 'HDLBoard remembers the sign-in on this computer until you sign out.'
            : 'You stay signed in until you close this browser tab.'}
        </li>
      </ul>
      {connection.error !== null && (
        <p className="wb-github__message is-error" role="alert">
          {connection.error}
        </p>
      )}
      <button type="button" className="wb-github__btn wb-github__btn--primary wb-github__btn--big" onClick={connection.signIn}>
        <GitHubIcon aria-hidden="true" />
        Sign in with GitHub
      </button>
      <p className="wb-github__small">
        No GitHub account yet?{' '}
        <a href="https://github.com/signup" target="_blank" rel="noreferrer">
          Create one for free
        </a>
        , then come back here.
      </p>
      <TokenSignIn onSignIn={connection.signInWithToken} />
    </div>
  );
}

function DeviceCodeSteps({ code, onCancel }: { code: DeviceCode; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => setCopied(await copyText(code.userCode));
  return (
    <div className="wb-github__device">
      <ol className="wb-github__steps">
        <li>
          A GitHub page has opened.{' '}
          <a href={code.verificationUri} target="hdlboard-github-sign-in" rel="noreferrer">
            Open it again
          </a>{' '}
          if you do not see it, and sign in to GitHub there if it asks.
        </li>
        <li>
          Paste this code (it is already copied) and click <strong>Continue</strong>:
          <span className="wb-github__code-row">
            <code className="wb-github__code">{code.userCode}</code>
            <button type="button" className="wb-github__btn" onClick={() => void copy()}>
              <CopyIcon aria-hidden="true" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </li>
        <li>
          Click <strong>Authorize</strong>. GitHub asks only the first time.
        </li>
      </ol>
      <div className="wb-github__waiting" role="status">
        <span className="wb-github__spinner" aria-hidden="true" />
        <span>Waiting for GitHub…</span>
        <button type="button" className="wb-github__btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TokenSignIn({ onSignIn }: { onSignIn: (accessToken: string) => void }) {
  const [accessToken, setAccessToken] = useState('');
  const inputId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (accessToken.trim() !== '') onSignIn(accessToken);
  };
  return (
    <details className="wb-github__token">
      <summary>Sign in with a personal access token instead</summary>
      <form className="wb-github__token-form" onSubmit={submit}>
        <p>
          <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
            Create a token on GitHub
          </a>{' '}
          with the <strong>gist</strong> scope (already ticked there), then paste it here.
        </p>
        <label className="wb-github__label" htmlFor={inputId}>
          Personal access token
        </label>
        <span className="wb-github__token-row">
          <input
            id={inputId}
            className="wb-github__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="ghp_…"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
          />
          <button type="submit" className="wb-github__btn" disabled={accessToken.trim() === ''}>
            Sign in
          </button>
        </span>
      </form>
    </details>
  );
}

interface SignedInPanelProps {
  user: GitHubUser;
  connection: GitHubConnection;
  projects: GitHubProjects;
  openProject: OpenProjectSummary | null;
}

function SignedInPanel({ user, connection, projects, openProject }: SignedInPanelProps) {
  return (
    <div className="wb-github__signed-in">
      <Account user={user} remembersSignIn={connection.remembersSignIn} onSignOut={connection.signOut} />
      <CurrentProject openProject={openProject} busy={projects.busy !== null} onSave={projects.save} />
      <Activity projects={projects} />
      <ProjectList projects={projects} openGistId={openProject?.gistId} />
    </div>
  );
}

function Account({ user, remembersSignIn, onSignOut }: { user: GitHubUser; remembersSignIn: boolean; onSignOut: () => void }) {
  return (
    <div className="wb-github__account">
      {user.avatarUrl !== '' && <img className="wb-github__avatar" src={user.avatarUrl} alt="" />}
      <span className="wb-github__account-text">
        <span>
          Signed in as <strong>{user.login}</strong>
        </span>
        <span className="wb-github__small">
          {remembersSignIn ? 'Remembered on this computer until you sign out.' : 'Until you close this tab.'}{' '}
          <a href={AUTHORIZED_APPS_URL} target="_blank" rel="noreferrer">
            Manage access on GitHub
          </a>
        </span>
      </span>
      <button type="button" className="wb-github__btn" onClick={onSignOut}>
        <SignOutIcon aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

function CurrentProject({ openProject, busy, onSave }: { openProject: OpenProjectSummary | null; busy: boolean; onSave: () => void }) {
  if (openProject === null) return null;
  return (
    <div className="wb-github__current">
      <span className="wb-github__current-text">
        <span className="wb-github__small">Open now</span>
        <strong>{openProject.name || 'Untitled project'}</strong>
      </span>
      <GitHubStatus state={openProject.syncState} />
      <button
        type="button"
        className="wb-github__btn wb-github__btn--primary"
        onClick={onSave}
        disabled={busy || openProject.syncState === 'saved'}
      >
        <CloudUploadIcon aria-hidden="true" />
        Save to GitHub
      </button>
    </div>
  );
}

function ProjectList({ projects, openGistId }: { projects: GitHubProjects; openGistId: string | undefined }) {
  const { entries } = projects;
  return (
    <section className="wb-github__list-section" aria-label="Your projects on GitHub">
      <div className="wb-github__list-head">
        <h3 className="wb-github__heading">Your projects on GitHub</h3>
        <button
          type="button"
          className="wb-github__icon-btn"
          onClick={projects.refresh}
          disabled={projects.busy !== null}
          aria-label="Read the list again"
          title="Read the list again"
        >
          <RefreshIcon aria-hidden="true" />
        </button>
      </div>
      {entries !== null && entries.length === 0 && (
        <p className="wb-github__empty">No projects on GitHub yet. Click Create Project in Files, then Save to GitHub.</p>
      )}
      {entries !== null && entries.length > 0 && (
        <ul className="wb-github__list">
          {entries.map((entry) => (
            <ProjectRow key={entry.gistId} entry={entry} isOpen={entry.gistId === openGistId} projects={projects} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectRow({ entry, isOpen, projects }: { entry: IndexEntry; isOpen: boolean; projects: GitHubProjects }) {
  const busy = projects.busy !== null;
  return (
    <li className={`wb-github__row${isOpen ? ' is-open' : ''}`}>
      <span className="wb-github__row-icon" aria-hidden="true">
        <ProjectIcon />
      </span>
      <div className="wb-github__row-text">
        <span className="wb-github__row-name">
          {entry.name || 'Untitled project'}
          {isOpen && <span className="wb-github__chip">Open now</span>}
        </span>
        {entry.description !== '' && <span className="wb-github__row-description">{entry.description}</span>}
        <span className="wb-github__row-meta">{savedWhen(entry)}</span>
      </div>
      <div className="wb-github__row-actions">
        <button type="button" className="wb-github__btn" onClick={() => projects.open(entry)} disabled={busy}>
          Open
        </button>
        <a
          className="wb-github__icon-btn"
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Show ${entry.name} on github.com`}
          title="Show on github.com"
        >
          <OpenInIcon aria-hidden="true" />
        </a>
        <button
          type="button"
          className="wb-github__icon-btn wb-github__icon-btn--danger"
          onClick={() => projects.remove(entry)}
          disabled={busy}
          aria-label={`Delete ${entry.name} from GitHub`}
          title="Delete from GitHub"
        >
          <DeleteIcon aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function savedWhen(entry: IndexEntry): string {
  const when = entry.updatedAt || entry.createdAt;
  if (when === '') return '';
  return `Saved ${new Date(when).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export default GitHubDialog;
