// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { newProject, type OpenProject } from '../projectFile';
import { openProjectInfo, saveDestinationOf, type OpenProjectState } from './openProject';

const project = (over: Partial<OpenProject> = {}): OpenProject => ({ ...newProject('Counter', ['counter.vhd'], 'de1-soc'), ...over });
const gist = { gistId: 'g1', htmlUrl: 'https://gist.github.com/me/g1', ownerLogin: 'me', fingerprint: '' } as OpenProject['gist'];
const state = (over: Partial<OpenProjectState> = {}): OpenProjectState => ({
  changedSinceLocalSave: false,
  syncState: 'not-on-github',
  firstSaveToGitHub: false,
  ...over,
});

describe('saveDestinationOf', () => {
  test('a project on GitHub saves there', () => {
    expect(saveDestinationOf(project({ gist }), false)).toBe('github');
  });

  test('any other project saves on this computer, unless it is being saved to GitHub the first time', () => {
    expect(saveDestinationOf(project(), false)).toBe('local');
    expect(saveDestinationOf(project(), true)).toBe('github');
  });
});

describe('openProjectInfo', () => {
  test('a project opened from a path is on this computer; one from a web address is not', () => {
    expect(openProjectInfo(project({ location: 'C:\\p\\Counter.hdlboard.json' }), state()).onComputer).toBe(true);
    expect(openProjectInfo(project({ location: 'https://example.com/Counter.hdlboard.json' }), state()).onComputer).toBe(false);
    expect(openProjectInfo(project({ location: '' }), state()).onComputer).toBe(false);
  });

  test('is unsaved when the place it saves to does not hold it as it is now', () => {
    expect(openProjectInfo(project(), state({ changedSinceLocalSave: true })).unsaved).toBe(true);
    expect(openProjectInfo(project({ gist }), state({ changedSinceLocalSave: true, syncState: 'saved' })).unsaved).toBe(false);
    expect(openProjectInfo(project({ gist }), state({ syncState: 'changed' })).unsaved).toBe(true);
  });

  test('saving to GitHub the first time, an unchanged project has no unsaved changes', () => {
    const info = openProjectInfo(project(), state({ firstSaveToGitHub: true }));
    expect([info.destination, info.unsaved]).toEqual(['github', false]);
  });
});
