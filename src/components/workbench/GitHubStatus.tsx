// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { CheckIcon } from './icons';
import type { GitHubSyncState } from './projectGitHub';
import type { GitHubProjects } from './useGitHubProjects';
import './GitHub.css';

const LABELS: Record<GitHubSyncState, string> = {
  'not-on-github': 'Not on GitHub yet',
  saved: 'Saved on GitHub',
  changed: 'Changes not saved to GitHub',
};

/** Whether the open project is on GitHub, and whether it still matches what is there. */
export function GitHubStatus({ state }: { state: GitHubSyncState }) {
  return (
    <span className={`wb-github__status is-${state}`}>
      {state === 'saved' ? <CheckIcon aria-hidden="true" /> : <span className="wb-github__status-dot" aria-hidden="true" />}
      {LABELS[state]}
    </span>
  );
}

/** What the GitHub actions are doing, or how the last one went. */
export function Activity({ projects }: { projects: Pick<GitHubProjects, 'busy' | 'message'> }) {
  if (projects.busy !== null) {
    return (
      <p className="wb-github__waiting" role="status">
        <span className="wb-github__spinner" aria-hidden="true" />
        {projects.busy}
      </p>
    );
  }
  if (projects.message === null) return null;
  return (
    <p className={`wb-github__message is-${projects.message.tone}`} role={projects.message.tone === 'error' ? 'alert' : 'status'}>
      {projects.message.text}
    </p>
  );
}
