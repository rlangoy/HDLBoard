// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { DesignCheckMode } from '../simOnly/types';
import { SimulationSection } from './SimulationSection';

/** Settings › Simulation › Design check (docs/impl_sim_only_warnings.md § 6). */

const ignore = () => undefined;
const render = (mode: DesignCheckMode) =>
  renderToStaticMarkup(<SimulationSection designCheck={{ value: mode, onChange: ignore }} recordWaves={{ value: true, onChange: ignore }} />);

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

describe('the Synthesis check choices', () => {
  const renderWith = (mode: DesignCheckMode, toolCheck: boolean) =>
    renderToStaticMarkup(
      <SimulationSection
        designCheck={{ value: mode, onChange: ignore }}
        toolCheck={{ value: toolCheck, onChange: ignore }}
        recordWaves={{ value: true, onChange: ignore }}
      />,
    );

  test('sit under Synthesis: Quick check, or + GHDL check (VHDL)', () => {
    const html = renderWith('synthesis', false);
    expect(html.match(/<strong>[^<]+<\/strong>/g)?.slice(0, 4)).toEqual([
      '<strong>Synthesis</strong>',
      '<strong>Quick check</strong>',
      '<strong>Quick check + GHDL check (VHDL)</strong>',
      '<strong>Simulation only</strong>',
    ]);
  });

  test('check the choice in effect', () => {
    expect(renderWith('synthesis', true)).toMatch(/is-selected"><input[^>]*value="tool"/);
    expect(renderWith('synthesis', false)).toMatch(/is-selected"><input[^>]*value="quick"/);
  });

  test('cannot be chosen under Simulation only', () => {
    const inputOf = (html: string, value: string) => html.match(/<input [^>]*>/g)?.find((tag) => tag.includes(`value="${value}"`)) ?? '';
    expect(inputOf(renderWith('simulation', false), 'tool')).toContain('disabled=""');
    expect(inputOf(renderWith('synthesis', false), 'tool')).not.toContain('disabled');
  });

  test('are not shown without the setting', () => {
    expect(render('synthesis')).not.toContain('Quick check');
  });
});
