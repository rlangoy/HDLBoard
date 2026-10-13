// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ProjectTable } from './ProjectItems';
import type { ProjectListItem } from './projectCatalog';

const item = (source: ProjectListItem['source'], name: string): ProjectListItem => ({
  key: `${source}:${name}`,
  source,
  name,
  description: '',
  files: [],
  languages: ['vhdl'],
  updatedAt: '',
  owner: source === 'github' ? 'someone' : '',
  location: source === 'github' ? 'https://gist.github.com/x' : `test_s/${name}.hdlboard.json`,
});

/** The class of each control after Open in every row's actions, in row order. */
function actionSlots(onShowInFolder?: () => void): string[][] {
  const html = renderToStaticMarkup(
    createElement(ProjectTable, {
      items: [item('local', 'Runes'), item('github', 'Counter')],
      query: '',
      opening: false,
      isOpenNow: () => false,
      onOpen: () => {},
      onMenu: () => {},
      onShowInFolder,
      sort: 'newest',
      onSort: () => {},
      total: 2,
    }),
  );
  return [...html.matchAll(/wb-projects__p-actions">(.*?)<\/div>/g)].map(([, actions]) =>
    [...actions.matchAll(/class="([^"]*)"/g)].map(([, cls]) => cls),
  );
}

describe('ProjectTable', () => {
  test('a local row without Show in Explorer keeps an empty slot, so its Open lines up with a GitHub row', () => {
    const [local, github] = actionSlots();
    expect(local).toHaveLength(github.length);
    expect(local[1]).toContain('is-empty');
    expect(github[1]).not.toContain('is-empty');
  });

  test('with Show in Explorer (the Windows app) no slot is empty', () => {
    expect(actionSlots(() => {}).flat().some((cls) => cls.includes('is-empty'))).toBe(false);
  });
});
