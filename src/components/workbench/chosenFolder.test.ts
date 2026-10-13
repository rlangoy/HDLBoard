// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { filesBesideProject, filesDirectlyInFolder, pathBeside, projectFileInFolder, type Placed } from './chosenFolder';

/** As a browser reports a chosen folder: every path starts with the folder's name. */
const inFolder = (...paths: string[]) => paths.map((path) => ({ name: path.split('/').pop() ?? path, webkitRelativePath: path }));

describe('a folder chosen in a browser', () => {
  const testS = inFolder('test_s/fantasic_leds.hdlboard.json', 'test_s/DE1_SoC.vhdl', 'test_s/old/DE1_SoC.vhdl');

  it('finds the project file in it', () => {
    expect(projectFileInFolder(testS)?.webkitRelativePath).toBe('test_s/fantasic_leds.hdlboard.json');
  });

  it('takes the files in the folder itself, not in its subfolders', () => {
    expect(filesDirectlyInFolder(testS).map((file) => file.webkitRelativePath)).toEqual([
      'test_s/fantasic_leds.hdlboard.json',
      'test_s/DE1_SoC.vhdl',
    ]);
  });

  it('has no project file when the folder holds none', () => {
    expect(projectFileInFolder(inFolder('lab/adder.vhd'))).toBeUndefined();
  });

  it('opens the first project file by name when there are several', () => {
    expect(projectFileInFolder(inFolder('lab/b.hdlboard.json', 'lab/a.hdlboard.json'))?.name).toBe('a.hdlboard.json');
  });

  it('takes files chosen one by one (no folder path) as they are', () => {
    expect(filesDirectlyInFolder([{ name: 'x.vhd', webkitRelativePath: '' }])).toHaveLength(1);
  });
});

describe('pathBeside (docs/impl_project_structure.md § 6.4)', () => {
  const project = { name: 'lab1.hdlboard.json', webkitRelativePath: 'labs/lab1.hdlboard.json' };

  it('is the path inside the chosen folder, relative to the project file', () => {
    expect(pathBeside({ name: 'a.vhd', webkitRelativePath: 'labs/lab1/src/a.vhd' }, project)).toBe('lab1/src/a.vhd');
    expect(pathBeside({ name: 'a.vhd', webkitRelativePath: 'labs/a.vhd' }, project)).toBe('a.vhd');
  });

  it('is relative to a project file one folder down', () => {
    const deeper = { name: 'p.hdlboard.json', webkitRelativePath: 'root/sub/p.hdlboard.json' };
    expect(pathBeside({ name: 'a.vhd', webkitRelativePath: 'root/sub/p/src/a.vhd' }, deeper)).toBe('p/src/a.vhd');
    expect(pathBeside({ name: 'a.vhd', webkitRelativePath: 'root/other/a.vhd' }, deeper)).toBeUndefined();
  });

  it('reads the path inside a .zip, also one zipped inside a folder', () => {
    const zipped = { name: 'lab1.hdlboard.json', zipPath: 'lab1-folder/lab1.hdlboard.json' };
    expect(pathBeside({ name: 'a.vhd', zipPath: 'lab1-folder/lab1/src/a.vhd' }, zipped)).toBe('lab1/src/a.vhd');
  });

  it('uses the tag of a file read through a folder handle', () => {
    expect(pathBeside({ name: 'a.vhd', relativePath: 'lab1/src/a.vhd' }, { name: 'lab1.hdlboard.json' })).toBe('lab1/src/a.vhd');
  });

  it('uses the paths on disk in the Windows app', () => {
    const disk = (file: Placed) => ({ 'lab1.hdlboard.json': 'C:/Labs/lab1.hdlboard.json', 'a.vhd': 'C:/Labs/lab1/src/a.vhd' })[file.name];
    expect(pathBeside({ name: 'a.vhd' }, { name: 'lab1.hdlboard.json' }, disk)).toBe('lab1/src/a.vhd');
  });

  it('cannot tell for files picked one by one in a browser', () => {
    expect(pathBeside({ name: 'a.vhd' }, { name: 'lab1.hdlboard.json' })).toBeUndefined();
  });
});

describe('filesBesideProject (§ 6.8): two projects in one folder do not mix', () => {
  const layout = { projectDirectory: 'fantasicleds', sourceDirectory: 'src' };
  const projectFile = { name: 'fantasicleds.hdlboard.json', webkitRelativePath: 'Common/fantasicleds.hdlboard.json' };
  const at = (path: string) => ({ name: path.split('/').pop()!, webkitRelativePath: `Common/${path}` });

  it('keeps the project own folder and the files next to it, and leaves the other project out', () => {
    const own = at('fantasicleds/src/DE1_SoC.vhdl');
    const flat = at('notes.vhd');
    const other = at('not_so_fantasicleds/src/DE1_SoC.vhdl');
    const kept = filesBesideProject(projectFile, [own, flat, other], layout);
    expect(kept).toEqual([
      { file: own, path: 'fantasicleds/src/DE1_SoC.vhdl' },
      { file: flat, path: 'notes.vhd' },
    ]);
  });

  it('keeps files whose place cannot be told, matched by name later', () => {
    const picked = { name: 'a.vhd', webkitRelativePath: '' };
    expect(filesBesideProject({ name: 'fantasicleds.hdlboard.json', webkitRelativePath: '' }, [picked], layout)).toEqual([{ file: picked }]);
  });

  it('keeps every file of a .zip, an older one with vhdl/ too', () => {
    const zipped = { name: 'a.vhd', zipPath: 'vhdl/a.vhd' };
    expect(filesBesideProject({ name: 'p.hdlboard.json', zipPath: 'p.hdlboard.json' }, [zipped], layout)).toEqual([{ file: zipped, path: 'vhdl/a.vhd' }]);
  });
});
