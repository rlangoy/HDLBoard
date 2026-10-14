// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { folderNameProblem } from './fileName';

describe('folderNameProblem (docs/impl_project_structure.md § 6.2)', () => {
  it.each(['src', 'lab_src', 'rtl-1', 'Src', 'my sources', 'fantasicleds'])('accepts %j', (name) => {
    expect(folderNameProblem(name)).toBeNull();
  });

  it.each([
    ['', /empty/],
    ['   ', /empty/],
    ['.', /"\."/],
    ['..', /\.\./],
    ['a..b', /\.\./],
    ['a/b', /one folder/],
    ['a\\b', /one folder/],
    ['C:', /":"/],
    ['src.', /dot or a space/],
    ['src ', /dot or a space/],
    [' src', /start with a space/],
    ['CON', /Windows/],
    ['nul.txt', /Windows/],
    ['com1', /Windows/],
    ['<src>', /"<"/],
    ['src*', /"\*"/],
  ])('rejects %j', (name, why) => {
    expect(folderNameProblem(name)).toMatch(why);
  });

  it('allows names that only contain a reserved word', () => {
    expect(folderNameProblem('console')).toBeNull();
    expect(folderNameProblem('com10')).toBeNull();
  });
});
