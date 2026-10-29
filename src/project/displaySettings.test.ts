// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from './parseProject';
import type { HdlBoardProject } from './types';
import { visibleIndices, withVisibilityCounts, withVisibleIndices } from './displaySettings';

describe('project display settings', () => {
  const base: HdlBoardProject = { version: 2, name: 'Test', board: 'default', description: '', files: [] };
  const first = { leds: { groupSize: 4 as const, visible: [0, 2], readouts: { binary: true, hexadecimal: true, decimal: false } }, switches: { groupSize: 8 as const, visible: [1, 3], readouts: { binary: false, hexadecimal: false, decimal: true } } };
  const second = { leds: { groupSize: null, visible: [], readouts: { binary: false, hexadecimal: true, decimal: false } } };

  it('round trips independent settings for separate projects without changing the file version', () => {
    const firstText = serializeProject({ ...base, displaySettings: first });
    const secondText = serializeProject({ ...base, displaySettings: second });
    expect(JSON.parse(firstText).version).toBe(2);
    expect(parseProject(firstText).project.displaySettings).toEqual(first);
    expect(parseProject(secondText).project.displaySettings).toEqual(second);
    expect(parseProject(firstText).project.displaySettings).toEqual(first);
  });

  it('accepts older files and ignores malformed settings with a warning', () => {
    expect(parseProject(serializeProject(base)).project.displaySettings).toBeUndefined();
    const parsed = parseProject(JSON.stringify({ ...base, displaySettings: { leds: { groupSize: 3 } } }));
    expect(parsed.project.displaySettings).toBeUndefined();
    expect(parsed.warnings.some((warning) => warning.message.includes('displaySettings.leds'))).toBe(true);
  });

  it('persists selected display indices and independently enabled readouts', () => {
    const settings = { ...first, sevenSegment: { visible: [0, 2, 5], visibilityCount: 6 } };
    expect(parseProject(serializeProject({ ...base, displaySettings: settings })).project.displaySettings).toEqual(settings);
  });

  it('shows new indices when a board grows while preserving hidden indices', () => {
    const settings = withVisibilityCounts({ leds: first.leds }, { leds: 4, switches: 4, sevenSegment: 6 })!;
    expect(visibleIndices(settings.leds, 8)).toEqual([0, 2, 4, 5, 6, 7]);
    expect(visibleIndices({ visible: [0], visibilityCount: 2 }, 4)).toEqual([0, 2, 3]);
  });

  it('retains selections outside the current board when a smaller board is edited', () => {
    const original = { visible: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], visibilityCount: 16 };
    const edited = withVisibleIndices(original, 10, [0, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(edited.visibilityCount).toBe(16);
    expect(visibleIndices(edited, 16)).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(visibleIndices(edited, 18).slice(-2)).toEqual([16, 17]);
    expect(visibleIndices(parseProject(serializeProject({ ...base, displaySettings: { sevenSegment: edited } })).project.displaySettings?.sevenSegment, 16)).toEqual(visibleIndices(edited, 16));
  });
});
