// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { DesignCheckMode } from '../simOnly/types';
import { EditorSection } from './EditorSection';

/** Settings › Editor › Design check (docs/impl_sim_only_warnings.md § 6). */

const ignore = () => undefined;
const render = (mode: DesignCheckMode) =>
  renderToStaticMarkup(<EditorSection split={{ value: 'auto', onChange: ignore }} designCheck={{ value: mode, onChange: ignore }} />);

describe('the Design check card', () => {
  test('is shown with its title', () => {
    expect(render('synthesis')).toContain('Design check');
  });

  test('offers Synthesis and Simulation only', () => {
    expect(render('synthesis').match(/<strong>(Synthesis|Simulation only)<\/strong>/g)).toEqual(['<strong>Synthesis</strong>', '<strong>Simulation only</strong>']);
  });

  test('checks the mode in effect', () => {
    expect(render('simulation')).toMatch(/is-selected"><input[^>]*value="simulation"/);
  });
});
