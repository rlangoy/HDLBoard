// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import type { GitHubUser } from '../../github/githubUser';
import { HeaderLogo } from './logo';
import { GearIcon, GitHubIcon } from './icons';
import { APP_NAME, APP_TAGLINE } from './project';
import './Header.css';

export interface HeaderProps {
  /** Opens the Settings dialog. */
  onSettings?: () => void;
  /** Opens the Help dialog. */
  onHelp?: () => void;
  /** Opens the About dialog. */
  onAbout?: () => void;
  /** Opens the sign-in dialog, or, signed in, the Projects page; the signed-in user is shown on the button. */
  onGitHub?: () => void;
  gitHubUser?: GitHubUser | null;
  /** Shown left of the GitHub account button, with a divider: the save/share split button. */
  gitHubActions?: ReactNode;
}

/**
 * The workbench's top bar — the product name and tagline, reading as the
 * same one line the window title bar carries, and the always-present
 * chrome actions (Settings, Help, About), each of which opens a dialog
 * owned by `<Workbench>`.
 */
export function Header({ onSettings, onHelp, onAbout, onGitHub, gitHubUser, gitHubActions }: HeaderProps) {
  return (
    <header className="wb-header">
      <div className="wb-header__brand">
        <HeaderLogo />
        <span className="wb-header__title">{APP_NAME}</span>
        <span className="wb-header__tagline">&mdash; {APP_TAGLINE}</span>
      </div>
      <div className="wb-header__actions">
        {gitHubActions}
        {gitHubActions && <span className="wb-header__divider" aria-hidden="true" />}
        {onGitHub && (
          <button
            type="button"
            className="wb-header__action"
            onClick={onGitHub}
            title={gitHubUser ? `Signed in to GitHub as ${gitHubUser.login}: your projects` : 'Sign in to GitHub to save your projects there'}
          >
            {gitHubUser?.avatarUrl ? (
              <img className="wb-header__github-avatar" src={gitHubUser.avatarUrl} alt="" />
            ) : (
              <GitHubIcon className="wb-header__github-icon" aria-hidden="true" />
            )}
            {gitHubUser ? gitHubUser.login : 'GitHub'}
          </button>
        )}
        <button type="button" className="wb-header__action" onClick={onSettings}>
          <span className="wb-icon wb-icon--gear" aria-hidden="true">
            <GearIcon />
          </span>
          Settings
        </button>
        <button type="button" className="wb-header__action" onClick={onHelp}>
          <span className="wb-icon wb-icon--help" aria-hidden="true">
            ?
          </span>
          Help
        </button>
        <button type="button" className="wb-header__action" onClick={onAbout}>
          <span className="wb-icon wb-icon--help" aria-hidden="true">
            i
          </span>
          About
        </button>
      </div>
    </header>
  );
}

export default Header;
