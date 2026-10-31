// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { arrangedPanels, moveItem, orderToSave, panelOfCell, passesMiddle } from './boardArrangement';

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

describe('moveItem', () => {
  it("moving down: the item takes the target's place, those between move up", () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });

  it("moving up: the item takes the target's place, those between move down", () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('an item or target not in the list changes nothing', () => {
    expect(moveItem(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 'a', 'x')).toEqual(['a', 'b']);
  });
});

describe('passesMiddle', () => {
  const placeholder = { left: 0, top: 0, width: 100, height: 20 };
  const below = { left: 0, top: 30, width: 100, height: 80 };
  const beside = { left: 120, top: 0, width: 100, height: 20 };

  it('a panel below is passed once the pointer is under its middle', () => {
    expect(passesMiddle({ x: 50, y: 60 }, below, placeholder)).toBe(false);
    expect(passesMiddle({ x: 50, y: 80 }, below, placeholder)).toBe(true);
  });

  it('in the same row it is sideways that counts', () => {
    expect(passesMiddle({ x: 160, y: 10 }, beside, placeholder)).toBe(false);
    expect(passesMiddle({ x: 180, y: 10 }, beside, placeholder)).toBe(true);
  });

  it('after a tall panel moved up, the still pointer does not move it back', () => {
    const tallAbove = { left: 0, top: 0, width: 100, height: 80 };
    const placeholderBelow = { left: 0, top: 90, width: 100, height: 20 };
    expect(passesMiddle({ x: 50, y: 80 }, tallAbove, placeholderBelow)).toBe(false);
    expect(passesMiddle({ x: 50, y: 30 }, tallAbove, placeholderBelow)).toBe(true);
  });
});
