// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import type { GistLink } from '../../github/projectGists';
import { parseStoredGistLink } from './gistLink';
import { newProject, openProject, parseStoredProject, withEntryEdited, withEntryUnloaded } from './projectFile';
import {
  describeSavePlan,
  gistLinkFromUrl,
  gitHubSyncState,
  projectSnapshot,
  shareLink,
  withGistLink,
  withoutGistLink,
  withSavedGistLink,
} from './projectGitHub';

const LINK: GistLink = {
  gistId: 'abc123',
  htmlUrl: 'https://gist.github.com/student/abc123',
  ownerLogin: 'student',
  projectFileName: 'adder.hdlboard.json',
  updatedAt: '2026-10-09T08:00:00Z',
};

const FILES = [
  { name: 'adder.vhd', content: 'entity adder' },
  { name: 'adder_tb.vhd', content: 'entity adder_tb' },
];

const adder = () => newProject('Adder', FILES.map((file) => file.name));

describe('projectSnapshot', () => {
  it('holds the project file first, then the project files', () => {
    expect(projectSnapshot(adder(), FILES).files.map((file) => file.name)).toEqual(['adder.hdlboard.json', 'adder.vhd', 'adder_tb.vhd']);
  });

  it('stores a file that came from its own URL too, listed as stored next to the project file', () => {
    const project = withEntryEdited(adder(), 'adder_tb.vhd', { url: 'https://example.com/adder_tb.vhd' });
    const snapshot = projectSnapshot(project, FILES);
    expect(snapshot.files.map((file) => file.name)).toEqual(['adder.hdlboard.json', 'adder.vhd', 'adder_tb.vhd']);
    expect(JSON.parse(snapshot.files[0].content).files[1]).toEqual({ name: 'adder_tb.vhd', url: '', description: '' });
  });

  it('keeps the URL of a file that could not be loaded', () => {
    const project = withEntryUnloaded(withEntryEdited(adder(), 'lost.vhd', { url: 'https://example.com/lost.vhd' }), 'lost.vhd', 'Not found');
    const entries = JSON.parse(projectSnapshot(project, FILES).files[0].content).files;
    expect(entries.find((entry: { name: string }) => entry.name === 'lost.vhd').url).toBe('https://example.com/lost.vhd');
  });

  it('lists a file that could not be loaded, so saving does not delete it on GitHub', () => {
    const project = withEntryUnloaded(withEntryEdited(adder(), 'lost.vhd', {}), 'lost.vhd', 'Not found');
    expect(projectSnapshot(project, FILES).listedNames).toContain('lost.vhd');
  });
});

describe('gitHubSyncState', () => {
  it('is not on GitHub before the first save', () => {
    expect(gitHubSyncState(adder(), FILES)).toBe('not-on-github');
  });

  it('is saved right after saving', () => {
    expect(gitHubSyncState(withGistLink(adder(), LINK, FILES), FILES)).toBe('saved');
  });

  it('is changed when a file is edited', () => {
    const edited = [{ ...FILES[0], content: 'entity adder2' }, FILES[1]];
    expect(gitHubSyncState(withGistLink(adder(), LINK, FILES), edited)).toBe('changed');
  });

  it('is changed when a file that came from its own URL is edited', () => {
    const project = withEntryEdited(adder(), 'adder_tb.vhd', { url: 'https://gist.github.com/teacher/abc' });
    const edited = [FILES[0], { ...FILES[1], content: 'entity adder_tb -- edited' }];
    expect(gitHubSyncState(withGistLink(project, LINK, FILES), edited)).toBe('changed');
  });

  it('shows the saved files as stored next to the project file after saving', () => {
    const project = withEntryEdited(adder(), 'adder_tb.vhd', { url: 'https://gist.github.com/teacher/abc' });
    const saved = withSavedGistLink(project, LINK, projectSnapshot(project, FILES));
    expect([saved.entries[1].url, gitHubSyncState(saved, FILES)]).toEqual(['', 'saved']);
  });

  it('is changed when the description is edited', () => {
    const saved = withGistLink(adder(), LINK, FILES);
    expect(gitHubSyncState({ ...saved, description: 'new' }, FILES)).toBe('changed');
  });

  it('is changed when a file was edited while saving', () => {
    const sent = projectSnapshot(adder(), FILES);
    const editedMeanwhile = [{ ...FILES[0], content: 'typed during the save' }, FILES[1]];
    expect(gitHubSyncState(withSavedGistLink(adder(), LINK, sent), editedMeanwhile)).toBe('changed');
  });

  it('is not on GitHub once the link is removed', () => {
    expect(gitHubSyncState(withoutGistLink(withGistLink(adder(), LINK, FILES)), FILES)).toBe('not-on-github');
  });
});

describe('the stored gist link', () => {
  it('survives the desktop workspace round trip', () => {
    const saved = withGistLink(adder(), LINK, FILES);
    expect(parseStoredProject(JSON.parse(JSON.stringify(saved)))?.gist).toEqual(saved.gist);
  });

  it('is dropped when it does not look like one', () => {
    expect(parseStoredGistLink({ gistId: 'x' })).toBeUndefined();
  });
});

describe('opening a project from its gist', () => {
  it('uses the files read from the gist instead of downloading them', async () => {
    const text = JSON.stringify({ version: 1, name: 'Adder', board: 'DE1-SoC', description: '', files: [{ name: 'adder.vhd', url: '', description: '' }] });
    const offline = () => Promise.reject(new TypeError('offline'));
    const opened = await openProject({
      text,
      location: 'https://gist.githubusercontent.com/student/abc123/raw/adder.hdlboard.json',
      localFiles: [FILES[0]],
      fetch: offline,
    });
    expect(opened.files).toEqual([FILES[0]]);
  });
});

describe('shareLink', () => {
  it('opens the gist in HDLBoard', () => {
    expect(shareLink('https://hdlboard.example/app/?project=old#x', LINK)).toBe(
      'https://hdlboard.example/app/?project=https%3A%2F%2Fgist.github.com%2Fstudent%2Fabc123',
    );
  });
});

describe('describeSavePlan', () => {
  it('counts each kind of change', () => {
    const plan = {
      changes: [
        { kind: 'update' as const, fileName: 'a' },
        { kind: 'update' as const, fileName: 'b' },
        { kind: 'add' as const, fileName: 'c' },
      ],
      unchangedFileNames: [],
    };
    expect(describeSavePlan(plan)).toBe('2 files changed, 1 new file');
  });

  it('says when nothing changed', () => {
    expect(describeSavePlan({ changes: [], unchangedFileNames: ['a'] })).toBe('no changes');
  });
});

describe('gistLinkFromUrl', () => {
  it('links a project opened from its raw gist address', () => {
    expect(gistLinkFromUrl('https://gist.githubusercontent.com/teacher/abc123def456abc123de/raw/lab1.hdlboard.json')).toEqual({
      gistId: 'abc123def456abc123de',
      htmlUrl: 'https://gist.github.com/teacher/abc123def456abc123de',
      ownerLogin: 'teacher',
      projectFileName: 'lab1.hdlboard.json',
      updatedAt: '',
    });
  });

  it('leaves a project on any other site unlinked', () => {
    expect(gistLinkFromUrl('https://example.com/lab1/lab1.hdlboard.json')).toBeUndefined();
  });
});
