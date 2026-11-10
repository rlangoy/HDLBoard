// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { ProjectListItem } from '../projectCatalog';
import type { OpenProjectInfo } from './openProject';
import { projectRows, rowsInSection } from './projectRows';

const local = (name: string, updatedAt = ''): ProjectListItem => ({
  key: `local:${name}`,
  source: 'local',
  name,
  description: '',
  files: [],
  languages: [],
  updatedAt,
  owner: '',
  location: `projects/${name}.hdlboard.json`,
});

const github = (name: string, gistId: string, updatedAt = ''): ProjectListItem => ({
  ...local(name, updatedAt),
  key: `github:${gistId}`,
  source: 'github',
  owner: 'me',
  location: `https://gist.github.com/me/${gistId}`,
  gistId,
});

const open = (over: Partial<OpenProjectInfo>): OpenProjectInfo => ({
  name: 'Counter',
  description: 'Counts',
  files: [],
  location: 'projects/Counter.hdlboard.json',
  gistId: undefined,
  onComputer: true,
  changedSinceLocalSave: false,
  syncState: 'not-on-github',
  destination: 'local',
  unsaved: false,
  ...over,
});

describe('projectRows', () => {
  test('lists each project once, in one place', () => {
    const rows = projectRows([local('Adder'), github('Knight Rider', 'g1')], null);
    expect(rows.map((row) => [row.name, row.places.map((place) => place.source)])).toEqual([
      ['Adder', ['local']],
      ['Knight Rider', ['github']],
    ]);
  });

  test('a project stored in both places is one row, each place with its own saved state', () => {
    const rows = projectRows(
      [local('Counter', '2026-01-01T00:00:00Z'), github('Counter', 'g1', '2026-02-01T00:00:00Z')],
      open({ gistId: 'g1', changedSinceLocalSave: true, syncState: 'saved' }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].isOpen).toBe(true);
    expect(rows[0].places.map((place) => [place.source, place.state])).toEqual([
      ['local', 'changed'],
      ['github', 'saved'],
    ]);
    expect(rows[0].updatedAt).toBe('2026-02-01T00:00:00Z');
  });

  test('the open project shows its current name and description, not the listed ones', () => {
    const [row] = projectRows([local('Counter')], open({ name: 'Counter', description: 'Edited just now' }));
    expect(row.description).toBe('Edited just now');
  });

  test('the open project is listed even before the list has read its file', () => {
    const rows = projectRows([], open({}));
    expect(rows.map((row) => [row.isOpen, row.places[0].item])).toEqual([[true, undefined]]);
  });

  test('a project saved nowhere yet is no row', () => {
    expect(projectRows([local('Adder')], open({ location: '', onComputer: false }))).toHaveLength(1);
  });

  test('another project of the same name on GitHub stays a row of its own', () => {
    const rows = projectRows([local('Counter'), github('Counter', 'g2')], open({ gistId: 'g1' }));
    expect(rows).toHaveLength(2);
    expect(rows[1].isOpen).toBe(false);
  });
});

describe('rowsInSection', () => {
  const rows = projectRows([local('Counter'), github('Counter', 'g1'), local('Adder'), github('Knight Rider', 'g2')], open({ gistId: 'g1' }));
  const names = (section: Parameters<typeof rowsInSection>[1]) => rowsInSection(rows, section).map((row) => row.name);

  test('All projects lists every row', () => {
    expect(names('all')).toEqual(['Counter', 'Adder', 'Knight Rider']);
  });

  test('a place lists the rows stored there, a project in both places in each', () => {
    expect(names('local')).toEqual(['Counter', 'Adder']);
    expect(names('github')).toEqual(['Counter', 'Knight Rider']);
  });
});
