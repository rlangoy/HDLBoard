// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { filesDirectlyInFolder, projectFileInFolder } from './chosenFolder';

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
