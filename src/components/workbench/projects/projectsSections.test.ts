// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { isActiveProjectSection, pageOf, projectsSection } from './projectsSections';

describe('the Active project page', () => {
  test('is shown by Files', () => {
    expect(isActiveProjectSection('active-files')).toBe(true);
  });

  test('is shown by Overview', () => {
    expect(isActiveProjectSection('active')).toBe(true);
  });

  test('is not shown by a list', () => {
    expect(isActiveProjectSection('all')).toBe(false);
  });

  test('is not shown while the Projects page is closed', () => {
    expect(isActiveProjectSection(null)).toBe(false);
  });

  test('is the page Files shows', () => {
    expect(pageOf('active-files')).toBe('active');
  });

  test('gives Files its title', () => {
    expect(projectsSection('active-files').label).toBe('Active project');
  });
});
