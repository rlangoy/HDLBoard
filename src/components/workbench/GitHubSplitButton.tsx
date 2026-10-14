// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../board';
import { copyText } from './clipboard';
import type { ProjectGistLink } from './gistLink';
import type { GitHubShareView, ShareMenuItem } from './gitHubShare';
import { ChevronDownIcon, CloudDownloadIcon, CloudUploadIcon, CopyIcon, FolderOpenIcon, LinkIcon } from './icons';
import { ProjectMenu, type MenuAction } from './ProjectMenu';
import './GitHubSplitButton.css';

const COPIED_FEEDBACK_MS = 2000;

const MENU_LABELS: Record<ShareMenuItem, { label: string; icon: ReactNode }> = {
  copyLink: { label: 'Copy share link', icon: <CopyIcon aria-hidden="true" /> },
  getGitHubVersion: { label: 'Get the GitHub version', icon: <CloudDownloadIcon aria-hidden="true" /> },
  myProjects: { label: 'My Projects', icon: <FolderOpenIcon aria-hidden="true" /> },
};

export interface GitHubSplitButtonProps {
  view: GitHubShareView;
  link: ProjectGistLink | undefined;
  /** Whether the project is someone else's gist, for the menu header. */
  someoneElses: boolean;
  onSave: () => void;
  onGetGitHubVersion: () => void;
  /** Opens the Projects page. */
  onOpenProjects: () => void;
}

/**
 * The header's save/share split button (docs/implementation_spec_one_click_share.md): the
 * face saves the project to GitHub, or — once everything is saved — copies the gist's link;
 * the menu has the other actions. What it shows is decided in gitHubShare.ts.
 */
export function GitHubSplitButton({ view, link, someoneElses, onSave, onGetGitHubVersion, onOpenProjects }: GitHubSplitButtonProps) {
  const tipId = useId();
  const chevronRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // The menu goes when there is nothing in it, or nothing it may do now.
  const menuShown = menuOpen && !view.chevronHidden && !view.chevronDisabled;

  const copyLink = async () => {
    if (link) setCopied(await copyText(link.htmlUrl));
  };

  const actions: MenuAction[] = view.menu.map(({ item, detail }) => ({
    ...MENU_LABELS[item],
    detail,
    onSelect: item === 'copyLink' ? () => void copyLink() : item === 'getGitHubVersion' ? onGetGitHubVersion : onOpenProjects,
  }));

  const icon =
    view.icon === 'spinner' ? (
      <span className="wb-gh-split__spinner" aria-hidden="true" />
    ) : view.icon === 'link' ? (
      <LinkIcon aria-hidden="true" />
    ) : (
      <CloudUploadIcon aria-hidden="true" />
    );

  return (
    <div className={cx('wb-gh-split', `is-${view.variant}`, view.chevronHidden && 'is-single')} role="group" aria-label="GitHub">
      <button
        type="button"
        className="wb-gh-split__main"
        aria-disabled={view.primaryInert || undefined}
        aria-describedby={tipId}
        onClick={() => {
          if (view.primaryInert) return;
          if (view.action === 'save') onSave();
          else void copyLink();
        }}
      >
        <span className="wb-gh-split__icon">
          {icon}
          {view.unsavedDot && <span className="wb-gh-split__dot" />}
          {view.errorDot && <span className="wb-gh-split__dot is-error" />}
        </span>
        <span className="wb-gh-split__label">{copied ? 'Link copied' : view.label}</span>
      </button>
      {!view.chevronHidden && (
        <button
          type="button"
          ref={chevronRef}
          className="wb-gh-split__chevron"
          aria-label="More GitHub actions"
          aria-haspopup="menu"
          aria-expanded={menuShown}
          disabled={view.chevronDisabled}
          onClick={() => setMenuOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setMenuOpen(true);
            }
          }}
        >
          <ChevronDownIcon aria-hidden="true" />
        </button>
      )}
      <span role="tooltip" id={tipId} className="wb-gh-split__tip">
        {view.tooltip}
      </span>
      {menuShown && chevronRef.current && (
        <ProjectMenu
          anchor={chevronRef.current}
          header={someoneElses && link ? `From ${link.ownerLogin}'s GitHub` : undefined}
          actions={actions}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <span className="wb-gh-split__live" aria-live="polite">
        {copied ? 'Share link copied' : ''}
      </span>
    </div>
  );
}
