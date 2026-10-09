// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { emptyIndex, newestFirst, parseIndex, serializeIndex, withEntry, withoutEntry, type IndexEntry } from './projectIndex';

const ENTRY: IndexEntry = {
  name: 'Adder',
  description: 'Adds\ntwo numbers',
  url: 'https://gist.github.com/s/x',
  gistId: 'x',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '',
};

describe('the project index', () => {
  it('reads back what it writes', () => {
    const index = withEntry(emptyIndex(), ENTRY);
    expect(parseIndex(serializeIndex(index))).toEqual(index);
  });

  it('reads an index written before entries had updatedAt (the test app, spec § 5.1)', () => {
    const { name, description, url, gistId, createdAt } = ENTRY;
    const text = JSON.stringify({ version: 1, projects: [{ name, description, url, gistId, createdAt }] });
    expect(parseIndex(text).projects[0].updatedAt).toBe('');
  });

  it('refuses another format version', () => {
    expect(() => parseIndex(JSON.stringify({ version: 2, projects: [] }))).toThrow('"version" must be 1');
  });

  it('keeps the creation time when a project is saved again', () => {
    const resaved = { ...ENTRY, name: 'Adder 2', createdAt: '', updatedAt: '2026-10-09T08:00:00.000Z' };
    expect(withEntry(withEntry(emptyIndex(), ENTRY), resaved).projects).toEqual([{ ...resaved, createdAt: ENTRY.createdAt }]);
  });

  it('removes an entry by its gist', () => {
    expect(withoutEntry(withEntry(emptyIndex(), ENTRY), 'x').projects).toEqual([]);
  });

  it('lists the most recently saved project first', () => {
    const old = { ...ENTRY, gistId: 'old', updatedAt: '2026-10-02T00:00:00.000Z' };
    const fresh = { ...ENTRY, gistId: 'fresh', updatedAt: '2026-10-08T00:00:00.000Z' };
    const neverSaved = { ...ENTRY, gistId: 'never', createdAt: '2026-10-05T00:00:00.000Z' };
    expect(newestFirst([old, fresh, neverSaved]).map((entry) => entry.gistId)).toEqual(['fresh', 'never', 'old']);
  });
});
