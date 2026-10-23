// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from './parseProject';
import { projectJson } from './testHelpers';
import type { Diagnostic, SavedWaveView } from './types';
import { parseWaveViews, sameWaveView, withWaveViewOf } from './waveViews';

const view: SavedWaveView = { signals: [{ path: 'clk' }, { path: 'dut/count', showAs: 'decimal', expanded: true }] };

describe('saved waveform views in the project file', () => {
  it('are read back as they were saved, in their order', () => {
    const { project, warnings } = parseProject(projectJson([], { waveViews: { counter_tb: view } }));
    expect(project.waveViews).toEqual({ counter_tb: view });
    expect(warnings).toEqual([]);
    expect(parseProject(serializeProject(project)).project.waveViews).toEqual({ counter_tb: view });
  });

  it('are left out of the file when there are none', () => {
    const { project } = parseProject(projectJson([]));
    expect(project.waveViews).toBeUndefined();
    expect(serializeProject(project)).not.toMatch(/waveViews/);
  });

  it('are written after the files, each signal with its fields in a fixed order', () => {
    const { project } = parseProject(projectJson([], { waveViews: { counter_tb: { signals: [{ expanded: true, path: 'q', showAs: 'hex' }] } } }));
    const text = serializeProject(project);
    expect(text.indexOf('"waveViews"')).toBeGreaterThan(text.indexOf('"files"'));
    expect(text).toMatch(/"path": "q",\s+"showAs": "hex",\s+"expanded": true/);
  });
});

describe('a broken saved view never stops a project from opening', () => {
  const parse = (raw: unknown) => {
    const warnings: Diagnostic[] = [];
    return { views: parseWaveViews(raw, warnings), warnings: warnings.map((w) => w.message) };
  };

  it('a field that is not an object is left out, with a warning', () => {
    expect(parse([1, 2])).toEqual({ views: undefined, warnings: ['"waveViews" is not an object and was left out'] });
  });

  it('a testbench without a list of signals is left out; the others are kept', () => {
    const { views, warnings } = parse({ a_tb: { signals: 'clk' }, b_tb: view });
    expect(views).toEqual({ b_tb: view });
    expect(warnings).toEqual(['The saved waveform view of "a_tb" is not usable and was left out']);
  });

  it('a signal without a path is left out; odd fields are dropped', () => {
    const { views, warnings } = parse({ a_tb: { signals: [{ path: 'clk', showAs: 7, expanded: 'yes' }, { showAs: 'hex' }, 'rst'] } });
    expect(views).toEqual({ a_tb: { signals: [{ path: 'clk' }] } });
    expect(warnings).toHaveLength(1);
  });
});

describe('changing the view of one testbench', () => {
  it('keeps the other testbenches, and its own place among them', () => {
    const views = { a_tb: view, b_tb: view };
    const changed = { signals: [{ path: 'rst' }] };
    expect(Object.keys(withWaveViewOf(views, 'a_tb', changed) ?? {})).toEqual(['a_tb', 'b_tb']);
    expect(withWaveViewOf(views, 'a_tb', changed)?.a_tb).toEqual(changed);
  });

  it('gives back the same views when nothing changes, so the project does not read as changed', () => {
    const views = { a_tb: view };
    expect(withWaveViewOf(views, 'a_tb', { signals: view.signals.map((s) => ({ ...s })) })).toBe(views);
    expect(sameWaveView(view, { signals: [...view.signals].reverse() })).toBe(false);
  });

  it('a view showing nothing is not kept', () => {
    expect(withWaveViewOf({ a_tb: view }, 'a_tb', { signals: [] })).toBeUndefined();
    expect(withWaveViewOf(undefined, 'a_tb', { signals: [] })).toBeUndefined();
  });
});
