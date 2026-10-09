// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseProject, ProjectError, serializeProject } from './parseProject';
import { entry, projectJson } from './testHelpers';

/** Every row of the validation table in § 7 that concerns the project file itself. */
describe('parseProject', () => {
  it('accepts a valid project', () => {
    const { project, board, warnings, skipped } = parseProject(projectJson([entry('counter.vhd')]));
    expect(project.name).toBe('Test');
    expect(board).toBe('DE1-SoC');
    expect(project.files).toEqual([entry('counter.vhd')]);
    expect(warnings).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseProject('{ not json')).toThrow(ProjectError);
    expect(() => parseProject('{ not json')).toThrow(/Invalid JSON/);
  });

  it('rejects a top level that is not an object', () => {
    expect(() => parseProject('[]')).toThrow(ProjectError);
  });

  it.each(['version', 'name', 'board', 'description', 'files'])('rejects a missing "%s"', (field) => {
    const raw = JSON.parse(projectJson([]));
    delete raw[field];
    expect(() => parseProject(JSON.stringify(raw))).toThrow(new RegExp(`Missing required field.*${field}`));
  });

  it('rejects an unsupported version and names the supported one', () => {
    expect(() => parseProject(projectJson([], { version: 2 }))).toThrow(/version 2; supported version is 1/);
  });

  it('warns about an unknown board and falls back to the default board', () => {
    const { project, board, warnings } = parseProject(projectJson([], { board: 'Basys3' }));
    expect(board).toBe('DE1-SoC');
    expect(project.board).toBe('Basys3');
    expect(warnings[0].message).toMatch(/Unknown board "Basys3"/);
  });

  it('matches the board name case-insensitively', () => {
    const { board, warnings } = parseProject(projectJson([], { board: 'de1-soc' }));
    expect(board).toBe('DE1-SoC');
    expect(warnings).toEqual([]);
  });

  it('uses the known boards passed in', () => {
    const { board } = parseProject(projectJson([], { board: 'DE10-Lite' }), { knownBoards: ['DE1-SoC', 'DE10-Lite'] });
    expect(board).toBe('DE10-Lite');
  });
});

describe('parseProject file entries', () => {
  function parseEntries(files: unknown[]) {
    return parseProject(projectJson(files));
  }

  it('skips an entry without "name"', () => {
    const { project, skipped, warnings } = parseEntries([{ url: '', description: 'x' }]);
    expect(project.files).toEqual([]);
    expect(skipped[0].reason).toMatch(/missing "name"/);
    expect(warnings).toHaveLength(1);
  });

  it('skips an entry without "url"', () => {
    const { skipped } = parseEntries([{ name: 'a.vhd', description: 'x' }]);
    expect(skipped).toEqual([{ name: 'a.vhd', reason: expect.stringMatching(/missing "url"/) }]);
  });

  it('accepts an empty "url"', () => {
    expect(parseEntries([entry('a.vhd', '')]).project.files).toHaveLength(1);
  });

  it('loads an entry without "description" with an empty description and a warning', () => {
    const { project, warnings } = parseEntries([{ name: 'a.vhd', url: '' }]);
    expect(project.files).toEqual([{ name: 'a.vhd', url: '', description: '' }]);
    expect(warnings[0].message).toMatch(/no description/);
  });

  it('skips the later of two names that differ only by case', () => {
    const { project, skipped } = parseEntries([entry('counter.vhd'), entry('Counter.vhd')]);
    expect(project.files.map((file) => file.name)).toEqual(['counter.vhd']);
    expect(skipped).toEqual([{ name: 'Counter.vhd', reason: expect.stringMatching(/duplicate/) }]);
  });

  it('skips an empty name', () => {
    expect(parseEntries([entry('')]).skipped[0].reason).toMatch(/empty/);
  });

  it.each(['/', '\\', '..', ':', '*', '?', '"', '<', '>', '|'])('skips a name containing %s', (part) => {
    const { project, skipped } = parseEntries([entry(`bad${part}name.vhd`), entry('good.vhd')]);
    expect(project.files.map((file) => file.name)).toEqual(['good.vhd']);
    expect(skipped[0].reason).toContain(`forbidden "${part}"`);
  });

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com/a.vhd'])(
    'skips a non-http(s) url %s',
    (url) => {
      const { project, skipped } = parseEntries([entry('a.vhd', url)]);
      expect(project.files).toEqual([]);
      expect(skipped[0].reason).toMatch(/only http/);
    },
  );

  it('accepts an https url', () => {
    expect(parseEntries([entry('a.vhd', 'https://example.com/a.vhd')]).warnings).toEqual([]);
  });

  it('accepts a plain http url with a warning', () => {
    const { project, warnings } = parseEntries([entry('a.vhd', 'http://example.com/a.vhd')]);
    expect(project.files).toHaveLength(1);
    expect(warnings[0].message).toMatch(/prefer https/);
  });

  it('keeps the other entries when one is skipped', () => {
    const { project } = parseEntries([entry('a.vhd'), { name: 'b.vhd' }, entry('c.vhd')]);
    expect(project.files.map((file) => file.name)).toEqual(['a.vhd', 'c.vhd']);
  });
});

describe('serializeProject', () => {
  it('round-trips through parseProject', () => {
    const { project } = parseProject(projectJson([entry('a.vhd'), entry('b.vhd', 'https://x.org/b.vhd')]));
    expect(parseProject(serializeProject(project)).project).toEqual(project);
  });
});
