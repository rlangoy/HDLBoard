// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What the header's GitHub split button shows (docs/implementation_spec_one_click_share.md):
 * its face, tooltip and menu, decided from the app's state. Pure: no React, no network.
 */

import type { ProjectGistLink } from './gistLink';
import type { GitHubSyncState } from './projectGitHub';

export interface GitHubShareInput {
  hasProject: boolean;
  signedIn: boolean;
  /** The project's gist, if it is stored on GitHub. */
  link: ProjectGistLink | undefined;
  /** Whether the project is the user's own on GitHub, not someone else's. */
  someoneElses: boolean;
  syncState: GitHubSyncState;
  /** What the GitHub actions are doing (useGitHubProjects.busy). */
  busy: string | null;
  /** The last action's error text, if it failed. */
  failed: string | null;
}

export type ShareVariant = 'primary' | 'quiet';
export type ShareIcon = 'upload' | 'link' | 'spinner';
/** What the face does when clicked. */
export type ShareAction = 'save' | 'copyLink';
export type ShareMenuItem = 'copyLink' | 'getGitHubVersion' | 'myProjects';

export interface GitHubShareView {
  visible: boolean;
  variant: ShareVariant;
  icon: ShareIcon;
  action: ShareAction;
  /** Also the accessible name when only the icon shows. */
  label: string;
  /** Clicking does nothing (busy); still focusable, so the tooltip can be read. */
  primaryInert: boolean;
  chevronDisabled: boolean;
  /** No menu items: no chevron (never, while My Projects is always in the menu). */
  chevronHidden: boolean;
  unsavedDot: boolean;
  errorDot: boolean;
  tooltip: string;
  menu: { item: ShareMenuItem; detail: string }[];
}

const MENU_DETAIL: Record<ShareMenuItem, string> = {
  copyLink: 'Copies the link to the gist on GitHub',
  getGitHubVersion: 'Replace the files here with the version on GitHub',
  myProjects: 'Projects on this computer and on GitHub',
};

const HIDDEN: GitHubShareView = {
  visible: false,
  variant: 'primary',
  icon: 'upload',
  action: 'save',
  label: '',
  primaryInert: false,
  chevronDisabled: false,
  chevronHidden: true,
  unsavedDot: false,
  errorDot: false,
  tooltip: '',
  menu: [],
};

export function gitHubShareView(input: GitHubShareInput): GitHubShareView {
  if (!input.hasProject || !input.signedIn) return HIDDEN;

  const saved = input.link !== undefined && input.syncState === 'saved';
  const action: ShareAction = saved ? 'copyLink' : 'save';
  const menu: GitHubShareView['menu'] = [];
  if (input.link !== undefined) {
    if (action === 'save') menu.push({ item: 'copyLink', detail: MENU_DETAIL.copyLink });
    menu.push({ item: 'getGitHubVersion', detail: MENU_DETAIL.getGitHubVersion });
  }
  // The Projects page, as the GitHub account button opens it: always on offer, last.
  menu.push({ item: 'myProjects', detail: MENU_DETAIL.myProjects });

  const view: GitHubShareView = {
    visible: true,
    variant: 'primary',
    icon: saved ? 'link' : 'upload',
    action,
    label: saved ? 'Copy share link' : 'Save to GitHub',
    primaryInert: false,
    chevronDisabled: false,
    chevronHidden: menu.length === 0,
    unsavedDot: input.syncState === 'changed',
    errorDot: input.failed !== null,
    tooltip: saved
      ? 'Copy the link to the gist on GitHub'
      : input.syncState === 'changed'
        ? 'Save your changes to GitHub (Ctrl+Shift+S)'
        : 'Save the project as a secret gist on your GitHub (Ctrl+Shift+S)',
    menu,
  };

  if (!saved && input.someoneElses) {
    view.label = 'Save a copy to my GitHub';
    view.tooltip = 'Make your own copy of this project on GitHub';
  }
  // Reading the project list happens in the background; it is not worth the user's attention.
  const busy = input.busy?.startsWith('Reading') ? null : input.busy;
  if (busy !== null) {
    Object.assign(view, {
      variant: 'quiet',
      icon: 'spinner',
      // Only the save's own text shows; other activity is "Working…".
      label: busy.startsWith('Saving') ? busy : 'Working…',
      primaryInert: true,
      chevronDisabled: true,
      unsavedDot: false,
      tooltip: busy,
    });
  }
  if (input.failed !== null) view.tooltip = input.failed;
  return view;
}
