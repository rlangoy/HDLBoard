// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { copyText } from './clipboard';
import { Activity, GitHubStatus } from './GitHubStatus';
import { CloudDownloadIcon, CloudUploadIcon, CopyIcon, GitHubIcon } from './icons';
import type { ProjectGistLink } from './gistLink';
import { shareLink, type GitHubSyncState } from './projectGitHub';
import type { GitHubProjects } from './useGitHubProjects';
import './GitHub.css';

export interface ProjectGitHubCardProps {
  link: ProjectGistLink | undefined;
  syncState: GitHubSyncState;
  /** The signed-in GitHub user, or null when signed out. */
  userLogin: string | null;
  projects: GitHubProjects;
}

const COPIED_FEEDBACK_MS = 2000;

/** The project page's GitHub card (docs/GITHUB.md): save the project there, or get the version that is there. */
export function ProjectGitHubCard({ link, syncState, userLogin, projects }: ProjectGitHubCardProps) {
  const busy = projects.busy !== null;
  const someoneElses = link !== undefined && userLogin !== null && link.ownerLogin.toLowerCase() !== userLogin.toLowerCase();
  return (
    <section className="wb-project__card wb-github__card" aria-label="GitHub">
      <div className="wb-github__card-head">
        <h3 className="wb-project__card-title">
          <GitHubIcon className="wb-github__card-icon" aria-hidden="true" />
          GitHub
        </h3>
        <GitHubStatus state={syncState} />
      </div>
      <p className="wb-github__card-text">{explanation(link, someoneElses)}</p>
      {link !== undefined && <GistAddress link={link} />}
      <div className="wb-github__card-actions">
        <button type="button" className="wb-github__btn wb-github__btn--primary" onClick={projects.save} disabled={busy || syncState === 'saved'}>
          <CloudUploadIcon aria-hidden="true" />
          {someoneElses ? 'Save a copy to my GitHub' : 'Save to GitHub'}
        </button>
        {link !== undefined && (
          <button type="button" className="wb-github__btn" onClick={projects.getGitHubVersion} disabled={busy}>
            <CloudDownloadIcon aria-hidden="true" />
            Get the GitHub version
          </button>
        )}
      </div>
      <Activity projects={projects} />
    </section>
  );
}

function explanation(link: ProjectGistLink | undefined, someoneElses: boolean): string {
  if (link === undefined) return 'Save the project on your GitHub account, so you can open it again on any computer. It is stored as a secret gist.';
  if (someoneElses) return `This project was opened from ${link.ownerLogin}'s GitHub. Save a copy to your own GitHub to keep your changes there.`;
  return 'Save to GitHub stores your changes there. Get the GitHub version opens it as it is on GitHub, for example after working on another computer.';
}

function GistAddress({ link }: { link: ProjectGistLink }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copyShareLink = async () => setCopied(await copyText(shareLink(window.location.href, link)));
  return (
    <p className="wb-github__address">
      <a href={link.htmlUrl} target="_blank" rel="noreferrer" className="wb-project__mono">
        {link.htmlUrl.replace(/^https:\/\//, '')}
      </a>
      <button
        type="button"
        className="wb-github__btn wb-github__btn--small"
        onClick={() => void copyShareLink()}
        title="Copy a link that opens this project in HDLBoard, to share it"
      >
        <CopyIcon aria-hidden="true" />
        {copied ? 'Link copied' : 'Copy share link'}
      </button>
    </p>
  );
}
