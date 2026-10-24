// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseProject, ProjectError, serializeProject } from './parseProject';
import { entry, projectJson } from './testHelpers';

/** Every row of the validation table in § 7 that concerns the project file itself. */
describe('parseProject', () => {
  it('accepts a valid project', () => {
    const { project, warnings, skipped } = parseProject(projectJson([entry('counter.vhd')], { version: 2, board: 'de1-soc' }));
    expect(project.name).toBe('Test');
    expect(project.board).toBe('de1-soc');
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

  it('rejects an unsupported version and names the supported ones', () => {
    expect(() => parseProject(projectJson([], { version: 3 }))).toThrow(/version 3; supported versions are 1 and 2/);
  });
});

/** docs/board_io_config_spec.md § 10: version 2 stores a board id; version 1 always meant the Default names. */
describe('parseProject boards', () => {
  it('opens a version-1 "DE1-SoC" project on the Default board, with no warning', () => {
    const { project, warnings } = parseProject(projectJson([], { version: 1, board: 'DE1-SoC' }));
    expect(project.board).toBe('default');
    expect(project.version).toBe(2);
    expect(warnings).toEqual([]);
  });

  it('opens any version-1 board name on the Default board: there is no guessing', () => {
    expect(parseProject(projectJson([], { version: 1, board: 'Basys3' })).project.board).toBe('default');
  });

  it('keeps a version-2 board id as written', () => {
    expect(parseProject(projectJson([], { version: 2, board: 'de1-soc' })).project.board).toBe('de1-soc');
  });

  it('keeps an unknown board id through parse, serialize and parse again', () => {
    const once = parseProject(projectJson([], { version: 2, board: 'de10-lite' })).project;
    const again = parseProject(serializeProject(once)).project;
    expect(again.board).toBe('de10-lite');
  });

  it('writes version 2 with the board id, never a display name', () => {
    const { project } = parseProject(projectJson([], { version: 2, board: 'de1-soc' }));
    expect(JSON.parse(serializeProject(project))).toMatchObject({ version: 2, board: 'de1-soc' });
    const migrated = parseProject(projectJson([])).project;
    expect(JSON.parse(serializeProject(migrated))).toMatchObject({ version: 2, board: 'default' });
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

describe('projectDirectory and sourceDirectory (docs/impl_project_structure.md § 3)', () => {
  it('reads both folders', () => {
    const { project, warnings } = parseProject(projectJson([], { projectDirectory: 'fantasicleds', sourceDirectory: 'rtl' }));
    expect(project.projectDirectory).toBe('fantasicleds');
    expect(project.sourceDirectory).toBe('rtl');
    expect(warnings).toEqual([]);
  });

  it('leaves missing folders undefined, without a warning', () => {
    const { project, warnings } = parseProject(projectJson([]));
    expect(project.projectDirectory).toBeUndefined();
    expect(project.sourceDirectory).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('warns about an invalid sourceDirectory and falls back to src', () => {
    const { project, warnings } = parseProject(projectJson([], { sourceDirectory: '../outside' }));
    expect(project.sourceDirectory).toBeUndefined();
    expect(warnings.map((w) => w.message).join()).toMatch(/"sourceDirectory" is not a usable folder.*using "src"/);
  });

  it('treats an invalid projectDirectory as missing, with a warning', () => {
    const { project, warnings } = parseProject(projectJson([], { projectDirectory: 'C:\\labs' }));
    expect(project.projectDirectory).toBeUndefined();
    expect(warnings.map((w) => w.message).join()).toMatch(/"projectDirectory" is not a usable folder.*project file name/);
  });

  it('warns about a folder that is not a string', () => {
    const { project, warnings } = parseProject(projectJson([], { sourceDirectory: 3 }));
    expect(project.sourceDirectory).toBeUndefined();
    expect(warnings[0].message).toMatch(/not a string/);
  });

  it('writes both folders after the description, before files', () => {
    const text = serializeProject({
      version: 1,
      name: 'Fantasic_Leds',
      board: 'DE1-SoC',
      description: 'Show the status of the LEDS',
      projectDirectory: 'fantasicleds',
      sourceDirectory: 'src',
      files: [entry('DE1_SoC.vhdl')],
    });
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'name', 'board', 'description', 'projectDirectory', 'sourceDirectory', 'files']);
  });
});
