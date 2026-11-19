// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BOARD } from '../../boards/boardCatalog';
import { ExamplesPane } from './ExamplesPane';

const ignore = () => undefined;
const render = (designCheck: 'synthesis' | 'simulation') =>
  renderToStaticMarkup(
    <ExamplesPane initialLanguages={new Set(['vhdl'])} onOpen={ignore} onClose={ignore} board={DEFAULT_BOARD} onNewStarterFile={ignore} designCheck={designCheck} />,
  );

describe('the Examples cards and the design check', () => {
  test('a SIM-only example has the amber badge beside its language', () => {
    expect(render('synthesis')).toMatch(/wb-examples__badge is-vhdl">VHDL<\/span><span class="wb-examples__simonly"/);
  });

  test('the two-clocks card says it is a synthesis error on purpose', () => {
    expect(render('synthesis')).toContain('Synthesis error, on purpose: a register has one clock.');
  });

  test('with Simulation only, no card is marked SIM-only', () => {
    expect(render('simulation')).not.toContain('wb-examples__simonly');
  });
});
