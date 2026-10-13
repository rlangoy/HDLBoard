// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { NEW_TOKEN_URL } from '../../github/config';
import type { DeviceCode } from '../../github/deviceFlow';
import { copyText } from './clipboard';
import { Dialog } from './Dialog';
import { CopyIcon, GitHubIcon } from './icons';
import type { GitHubConnection, SignInStep } from './useGitHub';
import './GitHub.css';

export interface GitHubSignInDialogProps {
  connection: GitHubConnection;
  onClose: () => void;
}

/**
 * The GitHub sign-in (docs/GITHUB.md), the one part of GitHub that stays a dialog: it waits
 * while the user acts in another window. Signed in, the projects are on the Projects page.
 */
export function GitHubSignInDialog({ connection, onClose }: GitHubSignInDialogProps) {
  // Once, as the dialog opens: running it again on every sign-in step would retry a failed sign-in in a loop.
  const prepareOnOpen = useRef(connection.prepare);
  useEffect(() => prepareOnOpen.current(), []);

  return (
    <Dialog open onClose={onClose} title="Sign in to GitHub" subtitle="Keep your projects on GitHub, and open them on any computer" icon={<GitHubIcon />}>
      <SignInPanel connection={connection} />
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
      {connection.canChooseBrowser && (
        <label className="wb-github__option">
          <input type="checkbox" checked={connection.signInInBrowser} onChange={(e) => connection.setSignInInBrowser(e.target.checked)} />
          <span>
            Open the sign-in page in my default web browser
            <span className="wb-github__option-note">
              Recommended: it already has your GitHub sign-in, passkeys and saved passwords. Untick it to sign in inside HDLBoard.
            </span>
          </span>
        </label>
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

export default GitHubSignInDialog;
