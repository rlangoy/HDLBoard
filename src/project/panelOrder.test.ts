// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The Board panels' order in the project file (docs/imp_rearrange_board_io.md). */

import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from './parseProject';
import { parsePanelOrder, swapPanels } from './panelOrder';
import { withPanelOrder } from './displaySettings';
import { CURRENT_PROJECT_VERSION, type BoardPanel, type Diagnostic, type HdlBoardProject } from './types';

const PROJECT: HdlBoardProject = { version: CURRENT_PROJECT_VERSION, name: 'Test', board: 'default', description: '', files: [] };
const ARRANGED: BoardPanel[] = ['switches', 'pushbuttons', 'leds', 'sevenSegment'];

describe('panel order in the project file', () => {
  it('is saved and restored without changing the file version', () => {
    const saved = serializeProject({ ...PROJECT, displaySettings: { panelOrder: ARRANGED } });
    expect(JSON.parse(saved).version).toBe(CURRENT_PROJECT_VERSION);
    expect(JSON.parse(saved).displaySettings.panelOrder).toEqual(ARRANGED);
    expect(parseProject(saved).project.displaySettings).toEqual({ panelOrder: ARRANGED });
  });

  it('is absent in a project that never moved a panel', () => {
    expect(parseProject(serializeProject(PROJECT)).project.displaySettings).toBeUndefined();
  });

  it('keeps the other display settings beside it', () => {
    const settings = { pushbuttons: { bounce: 'bouncy' as const }, panelOrder: ARRANGED };
    expect(parseProject(serializeProject({ ...PROJECT, displaySettings: settings })).project.displaySettings).toEqual(settings);
  });

  it('opens the project with a warning when the order is not a list', () => {
    const parsed = parseProject(JSON.stringify({ ...PROJECT, displaySettings: { panelOrder: 'leds' } }));
    expect(parsed.project.displaySettings).toBeUndefined();
    expect(parsed.warnings.some((warning) => warning.message.includes('displaySettings.panelOrder'))).toBe(true);
  });
});

describe('parsePanelOrder', () => {
  it('drops unknown and repeated panels and puts the missing ones last', () => {
    const warnings: Diagnostic[] = [];
    expect(parsePanelOrder(['pushbuttons', 'speaker', 'pushbuttons', 7, 'leds'], warnings)).toEqual(['pushbuttons', 'leds', 'sevenSegment', 'switches']);
    expect(warnings).toEqual([]);
  });

  it('reads a list that names no panel as no order: the layout keeps its own', () => {
    expect(parsePanelOrder([], [])).toBeUndefined();
    expect(parsePanelOrder(['speaker'], [])).toBeUndefined();
  });
});

describe('swapPanels', () => {
  it('changes the places of two panels and leaves the others', () => {
    expect(swapPanels(['leds', 'sevenSegment', 'switches', 'pushbuttons'], 'leds', 'pushbuttons')).toEqual(['pushbuttons', 'sevenSegment', 'switches', 'leds']);
  });

  it('changes nothing when a panel is dropped on itself', () => {
    expect(swapPanels(ARRANGED, 'leds', 'leds')).toEqual(ARRANGED);
  });
});

describe('withPanelOrder', () => {
  it('sets the order beside the other settings', () => {
    expect(withPanelOrder({ pushbuttons: { bounce: 'bouncy' } }, ARRANGED)).toEqual({ pushbuttons: { bounce: 'bouncy' }, panelOrder: ARRANGED });
  });

  it('removes the order, and the settings with it when nothing else is set', () => {
    expect(withPanelOrder({ pushbuttons: { bounce: 'bouncy' }, panelOrder: ARRANGED }, undefined)).toEqual({ pushbuttons: { bounce: 'bouncy' } });
    expect(withPanelOrder({ panelOrder: ARRANGED }, undefined)).toBeUndefined();
  });

  it('leaves a project that never moved a panel as it was saved', () => {
    const saved = serializeProject(PROJECT);
    const movedBack = { ...PROJECT, displaySettings: withPanelOrder(withPanelOrder(undefined, ARRANGED), undefined) };
    expect(serializeProject(movedBack)).toBe(saved);
  });
});
