// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import {
  displayName,
  fileHit,
  filterItems,
  isSameProject,
  itemFromIndexEntry,
  itemFromProjectFile,
  languagesOf,
  parseProjectsPagePrefs,
  relativeTime,
  sortItems,
  type ProjectListItem,
} from './projectCatalog';

const item = (over: Partial<ProjectListItem> & { name: string }): ProjectListItem => ({
  key: `local:${over.name}`,
  source: 'local',
  description: '',
  files: [],
  languages: [],
  updatedAt: '',
  owner: '',
  location: over.name,
  ...over,
});

const counter = item({
  name: 'Lab 2',
  description: 'A counter on HEX0.',
  files: [{ name: 'counter.vhd', description: '4-bit counter with enable' }],
  languages: ['vhdl'],
});

describe('displayName', () => {
  test('drops a language in brackets at the end', () => {
    expect(displayName('Shift Register (Verilog)')).toBe('Shift Register');
    expect(displayName('Full Adder Truth Table (VHDL testbench)')).toBe('Full Adder Truth Table');
  });

  test('keeps other brackets, and a name that is only the language', () => {
    expect(displayName('Counter (4-bit)')).toBe('Counter (4-bit)');
    expect(displayName('(VHDL)')).toBe('(VHDL)');
  });
});

describe('languagesOf', () => {
  test('lists each language once, vhdl first', () => {
    expect(languagesOf(['a.vhd', 'b.v', 'c.vhdl', 'x.txt'])).toEqual(['vhdl', 'verilog']);
    expect(languagesOf([])).toEqual([]);
  });
});

describe('filterItems', () => {
  test('finds a project by a word only a file description has', () => {
    const lab = item({ name: 'Lab 3', files: [{ name: 'a.vhd', description: 'debouncer' }] });
    expect(filterItems([lab, counter], 'debouncer', 'all')).toEqual([lab]);
  });

  test('ignores case and accents and needs every word', () => {
    expect(filterItems([counter], 'cöunter ENABLE', 'all')).toEqual([counter]);
    expect(filterItems([counter], 'counter xyz', 'all')).toEqual([]);
  });

  test('an empty query matches everything', () => {
    expect(filterItems([counter], '   ', 'all')).toEqual([counter]);
  });

  test('a type keeps the projects with that language, mixed ones too', () => {
    const verilog = item({ name: 'v', languages: ['verilog'] });
    const mixed = item({ name: 'm', languages: ['vhdl', 'verilog'] });
    const none = item({ name: 'n' });
    expect(filterItems([counter, verilog, mixed, none], '', 'verilog')).toEqual([verilog, mixed]);
  });
});

describe('sortItems', () => {
  const old = item({ name: 'old', updatedAt: '2026-01-01T00:00:00Z' });
  const recent = item({ name: 'recent', updatedAt: '2026-06-01T00:00:00Z' });
  const unknown = item({ name: 'unknown' });

  test('newest and oldest put unknown dates last', () => {
    expect(sortItems([unknown, old, recent], 'newest')).toEqual([recent, old, unknown]);
    expect(sortItems([unknown, recent, old], 'oldest')).toEqual([old, recent, unknown]);
  });

  test('equal dates go by name', () => {
    const b = item({ name: 'b', updatedAt: old.updatedAt });
    const a = item({ name: 'a', updatedAt: old.updatedAt });
    expect(sortItems([b, a], 'newest')).toEqual([a, b]);
  });

  test('by name, numbers count as numbers', () => {
    const lab2 = item({ name: 'lab2' });
    const lab10 = item({ name: 'lab10' });
    expect(sortItems([lab10, lab2], 'name')).toEqual([lab2, lab10]);
  });

  test('by where it is stored: that place first, each place newest first', () => {
    const gitHubOld = item({ name: 'g-old', source: 'github', updatedAt: old.updatedAt });
    const gitHubNew = item({ name: 'g-new', source: 'github', updatedAt: recent.updatedAt });
    const items = [gitHubOld, old, gitHubNew, recent];
    expect(sortItems(items, 'local')).toEqual([recent, old, gitHubNew, gitHubOld]);
    expect(sortItems(items, 'github')).toEqual([gitHubNew, gitHubOld, recent, old]);
  });

  test('does not change its input', () => {
    const input = [unknown, old];
    sortItems(input, 'newest');
    expect(input).toEqual([unknown, old]);
  });
});

describe('itemFromIndexEntry', () => {
  const entry = { name: 'P', description: 'd', url: 'https://gist.github.com/me/1', gistId: '1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '' };

  test('an entry without files has none and no languages', () => {
    const made = itemFromIndexEntry(entry, 'me');
    expect(made.files).toEqual([]);
    expect(made.languages).toEqual([]);
    expect(made.updatedAt).toBe(entry.createdAt);
    expect(made.owner).toBe('me');
  });

  test('takes the languages from the file names', () => {
    expect(itemFromIndexEntry({ ...entry, files: [{ name: 'a.v', description: '' }] }, 'me').languages).toEqual(['verilog']);
  });
});

describe('itemFromProjectFile', () => {
  const text = JSON.stringify({
    version: 1,
    name: 'Adder',
    board: 'DE1-SoC',
    description: 'Adds.',
    files: [{ name: 'adder.vhd', url: '', description: 'The adder' }],
  });

  test('reads a project file', () => {
    const made = itemFromProjectFile(text, 'C:/p/adder.hdlboard.json', Date.UTC(2026, 0, 2));
    expect(made).toMatchObject({ source: 'local', name: 'Adder', languages: ['vhdl'], updatedAt: '2026-01-02T00:00:00.000Z' });
    expect(made?.files).toEqual([{ name: 'adder.vhd', description: 'The adder' }]);
  });

  test('is undefined for text that is not a project file', () => {
    expect(itemFromProjectFile('{nope', 'x', 0)).toBeUndefined();
  });
});

describe('fileHit', () => {
  test('returns the file when only the file matches', () => {
    expect(fileHit(counter, 'enable')?.name).toBe('counter.vhd');
  });

  test('is undefined when the project itself matches or the query is empty', () => {
    expect(fileHit(counter, 'lab')).toBeUndefined();
    expect(fileHit(counter, '')).toBeUndefined();
  });
});

describe('isSameProject', () => {
  const open = { name: 'Runes', gistId: undefined, location: 'project.hdlboard.json' };

  test('a scanned file of the uploaded file name and project name is the open project', () => {
    expect(isSameProject(item({ name: 'Runes', location: 'test_s/project.hdlboard.json' }), open)).toBe(true);
  });

  test('another project in a file of that name is not', () => {
    expect(isSameProject(item({ name: 'Other', location: 'lab/project.hdlboard.json' }), open)).toBe(false);
  });

  test('a GitHub project is matched by its gist only', () => {
    expect(isSameProject(item({ name: 'Runes', source: 'github', gistId: 'g1', location: 'project.hdlboard.json' }), open)).toBe(false);
    expect(isSameProject(item({ name: 'x', source: 'github', gistId: 'g1' }), { ...open, gistId: 'g1' })).toBe(true);
  });

  test('a project not saved anywhere yet is no list item', () => {
    expect(isSameProject(item({ name: 'Runes', location: '' }), { ...open, location: '' })).toBe(false);
  });
});

describe('parseProjectsPagePrefs', () => {
  test('a bad value gives the default for that choice', () => {
    expect(parseProjectsPagePrefs('{"view":"grid","sort":"bogus"}')).toEqual({ type: 'all', sort: 'newest', view: 'grid' });
    // Views of earlier versions ('compact', 'list') read as the default.
    expect(parseProjectsPagePrefs('{"view":"compact"}').view).toBe('details');
    expect(parseProjectsPagePrefs('{"view":"list"}').view).toBe('details');
    expect(parseProjectsPagePrefs('{"sort":"github"}').sort).toBe('github');
  });

  test('nothing, or text that is not JSON, gives the defaults', () => {
    const defaults = { type: 'all', sort: 'newest', view: 'details' };
    expect(parseProjectsPagePrefs(null)).toEqual(defaults);
    expect(parseProjectsPagePrefs('{nope')).toEqual(defaults);
    expect(parseProjectsPagePrefs('5')).toEqual(defaults);
  });
});

describe('relativeTime', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const format = (value: number, unit: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, unit);
  const ago = (ms: number) => new Date(now - ms).toISOString();

  test('reads days, weeks and minutes', () => {
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe(format(-4, 'day'));
    expect(relativeTime(ago(9 * 86_400_000), now)).toBe(format(-1, 'week'));
    expect(relativeTime(ago(5 * 60_000), now)).toBe(format(-5, 'minute'));
  });

  test('the future reads as now', () => {
    expect(relativeTime(new Date(now + 30_000).toISOString(), now)).toBe(format(0, 'second'));
  });
});
