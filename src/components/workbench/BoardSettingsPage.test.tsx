// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BUILT_IN_BOARDS } from '../../boards/boardCatalog';
import { initialBoardDocument } from '../../boards/boardEditorStorage';
import { BoardSettingsPage } from './BoardSettingsPage';

const render = (id: string) => renderToStaticMarkup(<BoardSettingsPage document={initialBoardDocument()} boards={BUILT_IN_BOARDS}
  initialBoardId={id} onClose={() => {}} onSave={async () => {}} />);

it('renders the Nexys cross spatially with independent reset and shared save controls', () => {
  const html = render('nexys-a7');
  expect(html).toContain('bce-cross__up');
  expect(html).toContain('value="BTNC"');
  expect(html).toContain('Pressing a button produces 1.');
  expect(html).toContain('Edit reset');
  expect(html).toContain('Save changes');
  expect(html).toContain('View JSON');
});

it('renders DE1-SoC as its original active-low vector', () => {
  const html = render('de1-soc');
  expect(html).toContain('value="KEY"');
  expect(html).toContain('value="4"');
  expect(html).toContain('Pressing a button produces 0.');
  expect(html).not.toContain('Edit reset');
});

it('shows no status line for a saved, editable board', () => {
  const html = renderToStaticMarkup(<BoardSettingsPage document={initialBoardDocument()} boards={BUILT_IN_BOARDS}
    initialBoardId="de1-soc" builtInBoardIds={[]} onClose={() => {}} onSave={async () => {}} />);
  expect(html).not.toContain('All changes applied');
  expect(html).not.toContain('Save the project to store');
  expect(html).not.toContain('read-only');
});

it('explains a read-only board instead of claiming changes were applied', () => {
  const html = render('de1-soc');
  expect(html).toContain('Built-in boards are read-only');
  expect(html).not.toContain('All changes applied');
});
