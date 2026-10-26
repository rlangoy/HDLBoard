// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { builtInBoard } from '../../boards/boardCatalog';
import { BoardSettingsPage } from './BoardSettingsPage';

it('shows the active board parameters and an accessible way back to code', () => {
  const html = renderToStaticMarkup(<BoardSettingsPage board={builtInBoard('nexys-a7')} requestedBoardId="nexys-a7" onClose={() => {}} />);
  expect(html).toContain('CPU_RESETN');
  expect(html).toContain('digitEnablesActiveLow');
  expect(html).toContain('Close board settings');
  expect(html).not.toContain('<input');
  expect(html).not.toContain('<textarea');
});

it('explains when the requested board is missing and the fallback is displayed', () => {
  const html = renderToStaticMarkup(<BoardSettingsPage board={builtInBoard('default')} requestedBoardId="missing-board" onClose={() => {}} />);
  expect(html).toContain('missing-board');
  expect(html).toContain('not installed');
  expect(html).toContain('active fallback board');
});
