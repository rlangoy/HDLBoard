// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { beforeEach, describe, expect, it } from 'vitest';
import { INDEX_FILE_NAME, type IndexEntry } from './projectIndex';
import { GistClient } from './gistClient';
import { GistProjectIndex } from './gistProjectIndex';
import { GitHubHttp } from './githubHttp';
import { FakeGitHub } from './testSupport/fakeGitHub';

const ENTRY: IndexEntry = { name: 'Adder', description: 'Adds', url: 'https://gist.github.com/s/x', gistId: 'x', createdAt: '', updatedAt: '' };

describe('GistProjectIndex', () => {
  let github: FakeGitHub;
  let index: GistProjectIndex;

  beforeEach(() => {
    github = new FakeGitHub();
    index = new GistProjectIndex(new GistClient(new GitHubHttp('token', github.fetch)));
  });

  it('lists no projects when the user has no index gist', async () => {
    expect(await index.listEntries()).toEqual([]);
  });

  it('creates the index gist on the first registration', async () => {
    await index.register(ENTRY);
    expect(await index.listEntries()).toEqual([ENTRY]);
  });

  it('finds an existing index gist among the user gists', async () => {
    github.addGist('other', { 'notes.txt': 'hi' });
    github.addGist('HDLBoard project index', { [INDEX_FILE_NAME]: JSON.stringify({ version: 1, projects: [ENTRY] }) });
    expect(await index.listEntries()).toEqual([ENTRY]);
  });

  it('updates the existing index gist instead of creating a second one', async () => {
    await index.register(ENTRY);
    await index.register({ ...ENTRY, gistId: 'y' });
    expect(github.gists.size).toBe(1);
  });

  it('takes a deleted project off the list and keeps the others', async () => {
    await index.register(ENTRY);
    await index.register({ ...ENTRY, gistId: 'y' });
    await index.unregister('x');
    expect((await index.listEntries()).map((entry) => entry.gistId)).toEqual(['y']);
  });

  it('reads the index again before writing, so an entry saved from another computer is kept', async () => {
    await index.register(ENTRY);
    const otherComputer = new GistProjectIndex(new GistClient(new GitHubHttp('token', github.fetch)));
    await otherComputer.register({ ...ENTRY, gistId: 'z' });
    await index.register({ ...ENTRY, gistId: 'y' });
    expect((await index.listEntries()).map((entry) => entry.gistId)).toEqual(['x', 'z', 'y']);
  });
});
