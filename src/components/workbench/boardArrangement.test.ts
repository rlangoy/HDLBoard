// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { arrangedPanels, orderToSave, panelOfCell } from './boardArrangement';

/** A board cell with these classes, as far as panelOfCell looks at it. */
const cell = (...classes: string[]) => ({ classList: { contains: (name: string) => classes.includes(name) } }) as unknown as Element;

describe('arrangedPanels', () => {
  it('uses the saved order in every layout', () => {
    const saved = ['switches', 'leds', 'pushbuttons', 'sevenSegment'] as const;
    expect(arrangedPanels(saved, 'two-columns')).toEqual(saved);
    expect(arrangedPanels(saved, 'single-column')).toEqual(saved);
  });

  it('falls back to each layout\'s own order', () => {
    expect(arrangedPanels(undefined, 'two-columns')).toEqual(['leds', 'sevenSegment', 'switches', 'pushbuttons']);
    expect(arrangedPanels(undefined, 'single-column')).toEqual(['leds', 'switches', 'sevenSegment', 'pushbuttons']);
  });
});

describe('orderToSave', () => {
  it('keeps an order the student chose', () => {
    expect(orderToSave(['switches', 'sevenSegment', 'leds', 'pushbuttons'], 'two-columns')).toEqual(['switches', 'sevenSegment', 'leds', 'pushbuttons']);
  });

  it('keeps nothing once the panels are back in the layout order', () => {
    expect(orderToSave(['leds', 'sevenSegment', 'switches', 'pushbuttons'], 'two-columns')).toBeUndefined();
    expect(orderToSave(['leds', 'switches', 'sevenSegment', 'pushbuttons'], 'single-column')).toBeUndefined();
  });
});

describe('panelOfCell', () => {
  it('knows each panel, open or collapsed, and puts the reset button with the buttons', () => {
    expect(panelOfCell(cell('pb-ui', 'pb-panel', 'pb-sevenseg'))).toBe('sevenSegment');
    expect(panelOfCell(cell('pb-io-collapsed', 'pb-leds'))).toBe('leds');
    expect(panelOfCell(cell('pb-reset'))).toBe('pushbuttons');
    expect(panelOfCell(cell('pb-io-dialog'))).toBeUndefined();
  });
});
