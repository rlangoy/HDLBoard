// SPDX-License-Identifier: GPL-2.0-only
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { builtInBoard } from '../../../boards/boardCatalog';
import { BoardDraftIo } from './BoardDraftIo';

it('previews the chosen arrangement, including the last valid draft', () => {
  const board = builtInBoard('de1-soc');
  for (const invalid of [false, true]) {
    const preview = { board, invalid };
    expect(renderToStaticMarkup(<BoardDraftIo preview={preview} layout="single-column" />)).toContain('pb-board--single');
    expect(renderToStaticMarkup(<BoardDraftIo preview={preview} layout="two-columns" />)).not.toContain('pb-board--single');
  }
});
