// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import type { ProjectGistLink } from './gistLink';
import { gitHubShareView, type GitHubShareInput } from './gitHubShare';
import { isSomeoneElses } from './projectGitHub';

const LINK: ProjectGistLink = {
  gistId: 'abc',
  htmlUrl: 'https://gist.github.com/rune/abc',
  ownerLogin: 'rune',
  projectFileName: 'p.hdlproject',
  updatedAt: '',
  fingerprint: 'f',
};

const input = (over: Partial<GitHubShareInput> = {}): GitHubShareInput => ({
  hasProject: true,
  signedIn: true,
  link: undefined,
  someoneElses: false,
  syncState: 'not-on-github',
  busy: null,
  failed: null,
  ...over,
});

const items = (over: Partial<GitHubShareInput>) => gitHubShareView(input(over)).menu.map((entry) => entry.item);

describe('gitHubShareView', () => {
  it('is hidden without a project', () => {
    expect(gitHubShareView(input({ hasProject: false })).visible).toBe(false);
  });

  it('is hidden when signed out', () => {
    expect(gitHubShareView(input({ signedIn: false })).visible).toBe(false);
  });

  it('not on GitHub: Save to GitHub, and a menu with only My Projects', () => {
    const view = gitHubShareView(input());
    expect(view).toMatchObject({ visible: true, action: 'save', label: 'Save to GitHub', icon: 'upload', unsavedDot: false, chevronHidden: false });
    expect(view.menu.map((entry) => entry.item)).toEqual(['myProjects']);
  });

  it('changed: Save to GitHub with the unsaved dot; menu has Copy share link, Get the GitHub version and My Projects', () => {
    const view = gitHubShareView(input({ link: LINK, syncState: 'changed' }));
    expect(view).toMatchObject({ action: 'save', label: 'Save to GitHub', unsavedDot: true, chevronHidden: false });
    expect(view.menu.map((entry) => entry.item)).toEqual(['copyLink', 'getGitHubVersion', 'myProjects']);
  });

  it('saved: the face copies the share link; the menu has Get the GitHub version and My Projects', () => {
    const view = gitHubShareView(input({ link: LINK, syncState: 'saved' }));
    expect(view).toMatchObject({ action: 'copyLink', label: 'Copy share link', icon: 'link', unsavedDot: false, primaryInert: false });
    expect(view.menu.map((entry) => entry.item)).toEqual(['getGitHubVersion', 'myProjects']);
  });

  it("someone else's, changed: Save a copy to my GitHub", () => {
    const view = gitHubShareView(input({ link: LINK, syncState: 'changed', someoneElses: true }));
    expect(view).toMatchObject({ action: 'save', label: 'Save a copy to my GitHub' });
  });

  it("someone else's, unchanged: copies the link like a saved project", () => {
    expect(gitHubShareView(input({ link: LINK, syncState: 'saved', someoneElses: true })).action).toBe('copyLink');
  });

  it('busy saving: quiet, spinner, inert, chevron disabled, with the busy text', () => {
    const view = gitHubShareView(input({ link: LINK, syncState: 'changed', busy: 'Saving to GitHub…' }));
    expect(view).toMatchObject({ variant: 'quiet', icon: 'spinner', label: 'Saving to GitHub…', primaryInert: true, chevronDisabled: true, tooltip: 'Saving to GitHub…', unsavedDot: false });
  });

  it('other activity shows "Working…"', () => {
    expect(gitHubShareView(input({ busy: 'Opening the project from GitHub…' })).label).toBe('Working…');
  });

  it('reading the project list in the background shows nothing', () => {
    const view = gitHubShareView(input({ link: LINK, syncState: 'changed', busy: 'Reading your projects on GitHub…' }));
    expect(view).toMatchObject({ variant: 'primary', label: 'Save to GitHub', primaryInert: false, chevronDisabled: false });
  });

  it('busy wins over someone else\'s', () => {
    const view = gitHubShareView(input({ link: LINK, syncState: 'changed', someoneElses: true, busy: 'Saving to GitHub…' }));
    expect(view.label).toBe('Saving to GitHub…');
  });

  it('a failure sets the error dot and replaces the tooltip in every visible state', () => {
    for (const over of [{}, { link: LINK, syncState: 'changed' as const }, { link: LINK, syncState: 'saved' as const }]) {
      const view = gitHubShareView(input({ ...over, failed: 'Network down' }));
      expect(view).toMatchObject({ errorDot: true, tooltip: 'Network down' });
    }
  });

  it('menu order and details', () => {
    expect(items({ link: LINK, syncState: 'changed' })).toEqual(['copyLink', 'getGitHubVersion', 'myProjects']);
    expect(gitHubShareView(input({ link: LINK, syncState: 'changed' })).menu[0].detail).toBe('Copies the link to the gist on GitHub');
  });
});

describe('isSomeoneElses', () => {
  it('is false for the same login in another case', () => {
    expect(isSomeoneElses(LINK, 'RUNE')).toBe(false);
  });
  it('is true for another login', () => {
    expect(isSomeoneElses(LINK, 'teacher')).toBe(true);
  });
  it('is false for an empty owner', () => {
    expect(isSomeoneElses({ ...LINK, ownerLogin: '' }, 'teacher')).toBe(false);
  });
  it('is false when signed out or without a gist', () => {
    expect(isSomeoneElses(LINK, null)).toBe(false);
    expect(isSomeoneElses(undefined, 'rune')).toBe(false);
  });
});
