// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { folderOfPath, isFilePath, localProjectPath, parseProjectLocation, pathInFolder } from './projectLocation';

const PAGE = 'https://hdlboard.example.com/app/index.html';

describe('parseProjectLocation', () => {
  it('takes an absolute URL as it is', () => {
    expect(parseProjectLocation(' https://gist.github.com/u/abc ', PAGE)).toEqual({ kind: 'url', url: 'https://gist.github.com/u/abc' });
  });

  it('reads a relative address against the page, so a host can publish projects next to HDLBoard', () => {
    expect(parseProjectLocation('projects/lab1/lab1.hdlboard.json', PAGE)).toEqual({
      kind: 'url',
      url: 'https://hdlboard.example.com/app/projects/lab1/lab1.hdlboard.json',
    });
    expect(parseProjectLocation('/projects/x.hdlboard.json', PAGE)).toEqual({
      kind: 'url',
      url: 'https://hdlboard.example.com/projects/x.hdlboard.json',
    });
  });

  it('takes Windows paths, UNC paths and file:// URLs as paths, quotes and all', () => {
    expect(parseProjectLocation('"C:\\Labs\\lab1\\lab1.hdlboard.json"', PAGE)).toEqual({ kind: 'path', path: 'C:\\Labs\\lab1\\lab1.hdlboard.json' });
    expect(parseProjectLocation('D:/x/p.hdlboard.json', PAGE)).toEqual({ kind: 'path', path: 'D:/x/p.hdlboard.json' });
    expect(parseProjectLocation('\\\\server\\share\\p.json', PAGE)).toEqual({ kind: 'path', path: '\\\\server\\share\\p.json' });
    expect(parseProjectLocation('file:///C:/My%20Labs/p.json', PAGE)).toEqual({ kind: 'path', path: 'C:\\My Labs\\p.json' });
  });

  it('refuses other schemes and an empty field', () => {
    expect(parseProjectLocation('ftp://x/p.json', PAGE)).toMatch(/Only http/);
    expect(parseProjectLocation('javascript:alert(1)', PAGE)).toMatch(/Only http/);
    expect(parseProjectLocation('  ', PAGE)).toMatch(/Enter/);
  });
});

describe('paths', () => {
  it('finds the folder and joins names with its own separator', () => {
    expect(isFilePath('C:\\Labs\\p.json')).toBe(true);
    expect(isFilePath('https://x/p.json')).toBe(false);
    expect(isFilePath('p.hdlboard.json')).toBe(false);
    expect(folderOfPath('C:\\Labs\\lab1\\p.json')).toBe('C:\\Labs\\lab1');
    expect(pathInFolder('C:\\Labs\\lab1', 'a.vhd')).toBe('C:\\Labs\\lab1\\a.vhd');
    expect(pathInFolder('D:/x', 'a.vhd')).toBe('D:/x/a.vhd');
  });
});

describe('localProjectPath', () => {
  it("takes a chosen file's path only when it is a full file path", () => {
    expect(localProjectPath('C:\\Labs\\lab1\\lab1.hdlboard.json')).toBe('C:\\Labs\\lab1\\lab1.hdlboard.json');
    expect(localProjectPath('\\\\server\\share\\p.hdlboard.json')).toBe('\\\\server\\share\\p.hdlboard.json');
    expect(localProjectPath(undefined)).toBeNull(); // a browser
    expect(localProjectPath('')).toBeNull(); // a file from a .zip
    expect(localProjectPath('lab1.hdlboard.json')).toBeNull();
  });
});
