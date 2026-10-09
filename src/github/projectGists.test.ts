// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { beforeEach, describe, expect, it } from 'vitest';
import { GistClient } from './gistClient';
import { GistProjectIndex } from './gistProjectIndex';
import { GitHubHttp } from './githubHttp';
import { GistChangedError, ProjectGists, type GistLink, type ProjectSnapshot } from './projectGists';
import { INDEX_FILE_NAME } from './projectIndex';
import { FAKE_LOGIN, FakeGitHub } from './testSupport/fakeGitHub';

const NOW = new Date('2026-10-09T08:00:00Z');

function projectFileText(name: string, fileNames: readonly string[]): string {
  const files = fileNames.map((fileName) => ({ name: fileName, url: '', description: '' }));
  return JSON.stringify({ version: 1, name, board: 'DE1-SoC', description: 'An adder', files }, null, 2);
}

/** The adder project with these source files, as HDLBoard would save it. */
function snapshot(sources: Record<string, string>, projectFileName = 'adder.hdlboard.json'): ProjectSnapshot {
  const names = Object.keys(sources);
  return {
    name: 'Adder',
    description: 'An adder',
    projectFileName,
    files: [{ name: projectFileName, content: projectFileText('Adder', names) }, ...names.map((name) => ({ name, content: sources[name] }))],
    listedNames: names,
  };
}

describe('ProjectGists', () => {
  let github: FakeGitHub;
  let projects: ProjectGists;

  beforeEach(() => {
    github = new FakeGitHub();
    const gists = new GistClient(new GitHubHttp('token', github.fetch));
    projects = new ProjectGists(gists, new GistProjectIndex(gists), { login: FAKE_LOGIN, avatarUrl: '' }, () => NOW);
  });

  const publishAdder = async (sources: Record<string, string> = { 'adder.vhd': 'entity adder' }) =>
    (await projects.publish(snapshot(sources))).link;

  describe('publish', () => {
    it('stores the project file and its files in a new gist', async () => {
      const link = await publishAdder();
      expect(github.fileNames(link.gistId)).toEqual(['adder.hdlboard.json', 'adder.vhd']);
    });

    it('lists the new project in the index', async () => {
      const link = await publishAdder();
      expect(await projects.list()).toEqual([
        {
          name: 'Adder',
          description: 'An adder',
          url: link.htmlUrl,
          gistId: link.gistId,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      ]);
    });

    it('refuses an empty file, which GitHub cannot store', async () => {
      await expect(projects.publish(snapshot({ 'empty.vhd': '  ' }))).rejects.toMatchObject({ kind: 'empty-files' });
      expect(github.writes()).toEqual([]);
    });
  });

  describe('open', () => {
    it('reads the project file and every file of the gist', async () => {
      const link = await publishAdder();
      const opened = await projects.open(link.gistId);
      expect([opened.link, opened.files.map((file) => file.name)]).toEqual([link, ['adder.hdlboard.json', 'adder.vhd']]);
    });

    it('gives the address that opens the project without signing in', async () => {
      const link = await publishAdder();
      expect((await projects.open(link.gistId)).rawProjectUrl).toBe(
        `https://gist.githubusercontent.com/${FAKE_LOGIN}/${link.gistId}/raw/adder.hdlboard.json`,
      );
    });

    it('refuses a gist without a project file', async () => {
      const gistId = github.addGist('notes', { 'notes.txt': 'hi' });
      await expect(projects.open(gistId)).rejects.toMatchObject({ kind: 'no-project-file' });
    });

    it('refuses a gist with several project files', async () => {
      const gistId = github.addGist('two', { 'a.hdlboard.json': '{}', 'b.hdlboard.json': '{}' });
      await expect(projects.open(gistId)).rejects.toMatchObject({ kind: 'several-project-files' });
    });
  });

  describe('save', () => {
    it('writes only what changed', async () => {
      const link = await publishAdder({ 'adder.vhd': 'v1', 'adder_tb.vhd': 'tb' });
      const { plan } = await projects.save(link, snapshot({ 'adder.vhd': 'v2', 'adder_tb.vhd': 'tb' }));
      expect([plan.changes, github.fileContent(link.gistId, 'adder.vhd')]).toEqual([[{ kind: 'update', fileName: 'adder.vhd' }], 'v2']);
    });

    it('deletes a file that was taken out of the project', async () => {
      const link = await publishAdder({ 'adder.vhd': 'v1', 'old.vhd': 'old' });
      await projects.save(link, snapshot({ 'adder.vhd': 'v1' }));
      expect(github.fileNames(link.gistId)).toEqual(['adder.hdlboard.json', 'adder.vhd']);
    });

    it('keeps a file that the project still lists but could not load', async () => {
      const link = await publishAdder({ 'adder.vhd': 'v1', 'missing.vhd': 'kept' });
      const withoutContent = { ...snapshot({ 'adder.vhd': 'v1' }), listedNames: ['adder.vhd', 'missing.vhd'] };
      await projects.save(link, withoutContent);
      expect(github.fileContent(link.gistId, 'missing.vhd')).toBe('kept');
    });

    it('keeps a file added to the gist on github.com', async () => {
      const link = await publishAdder();
      github.editElsewhere(link.gistId, 'README.md', 'notes');
      const { link: refreshed } = await projects.open(link.gistId);
      await projects.save(refreshed, snapshot({ 'adder.vhd': 'v2' }));
      expect(github.fileContent(link.gistId, 'README.md')).toBe('notes');
    });

    it('replaces the old project file when the project file is renamed', async () => {
      const link = await publishAdder();
      await projects.save(link, snapshot({ 'adder.vhd': 'entity adder' }, 'renamed.hdlboard.json'));
      expect(github.fileNames(link.gistId)).toEqual(['adder.vhd', 'renamed.hdlboard.json']);
    });

    it('returns a link with the gist as it is now, so saving again needs no confirmation', async () => {
      const first = await projects.save(await publishAdder(), snapshot({ 'adder.vhd': 'v2' }));
      await expect(projects.save(first.link, snapshot({ 'adder.vhd': 'v3' }))).resolves.toBeDefined();
    });

    it('stops when the gist was changed on GitHub since it was opened', async () => {
      const link = await publishAdder();
      github.editElsewhere(link.gistId, 'adder.vhd', 'edited on github.com');
      await expect(projects.save(link, snapshot({ 'adder.vhd': 'mine' }))).rejects.toBeInstanceOf(GistChangedError);
      expect(github.fileContent(link.gistId, 'adder.vhd')).toBe('edited on github.com');
    });

    it('asks first when it cannot tell whether the gist changed', async () => {
      const link: GistLink = { ...(await publishAdder()), updatedAt: '' };
      await expect(projects.save(link, snapshot({ 'adder.vhd': 'mine' }))).rejects.toMatchObject({ whenKnown: false });
    });

    it('replaces the changes on GitHub when the user chose to', async () => {
      const link = await publishAdder();
      github.editElsewhere(link.gistId, 'adder.vhd', 'edited on github.com');
      await projects.saveReplacingChanges(link, snapshot({ 'adder.vhd': 'mine' }));
      expect(github.fileContent(link.gistId, 'adder.vhd')).toBe('mine');
    });

    it("refuses to save over someone else's gist", async () => {
      const gistId = github.addGist('theirs', { 'adder.hdlboard.json': projectFileText('Adder', []) }, 'teacher');
      const { link } = await projects.open(gistId);
      await expect(projects.save(link, snapshot({ 'adder.vhd': 'x' }))).rejects.toMatchObject({ kind: 'not-owner' });
    });

    it('updates the project name and description in the index', async () => {
      const link = await publishAdder();
      await projects.save(link, { ...snapshot({ 'adder.vhd': 'entity adder' }), name: 'Adder v2' });
      expect((await projects.list()).map((entry) => entry.name)).toEqual(['Adder v2']);
    });
  });

  describe('remove', () => {
    it('deletes the gist and takes the project off the list', async () => {
      const link = await publishAdder();
      await projects.remove(link.gistId);
      expect([github.gists.has(link.gistId), await projects.list()]).toEqual([false, []]);
    });

    it('takes a project whose gist is already gone off the list', async () => {
      const link = await publishAdder();
      github.gists.delete(link.gistId);
      await projects.remove(link.gistId);
      expect(await projects.list()).toEqual([]);
    });

    it('keeps the index gist itself', async () => {
      await projects.remove((await publishAdder()).gistId);
      const indexGists = [...github.gists.values()].filter((gist) => gist.files.has(INDEX_FILE_NAME));
      expect(indexGists).toHaveLength(1);
    });
  });
});
