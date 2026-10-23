// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { fixtureBytes } from './fixtures.testSupport';
import { parseGhw } from './ghwParser';
import { blockOf, dropTargetAt, fitsOrder, movablePaths, orderAfter, placeOf, sectionsOf, stepMove, type Section } from './signalOrder';
import { listRows, rowIndexAtY, sectionPath, SECTION_GAP_PX, traceRows, type ListState } from './signalRows';
import { AUTO_SCROLL_ZONE_PX, autoScrollSpeed } from './rowDragGesture';
import { AXIS_HEIGHT, ROW_HEIGHT } from './waveDraw';

const data = parseGhw(fixtureBytes('wave_types.ghw'));
const TB = 'wave_types_tb';
const CLK = `${TB}/clk`;
const RST = `${TB}/rst`;
const Q = `${TB}/q`;
const DUT_COUNT = `${TB}/dut/count`;
const DUT_CLK = `${TB}/dut/clk`;

const state = (shown: string[], expanded: string[] = [], open: string[] = []): ListState => ({ shown, expanded: new Set(expanded), open: new Set(open) });
const sectionsFor = (shown: string[], expanded: string[] = [], open: string[] = []) => sectionsOf(listRows(data, state(shown, expanded, open)));
const middleOf = (section: Section, index: number) => (section.blocks[index].top + section.blocks[index].bottom) / 2;

describe('sections and blocks', () => {
  test('one section per head, each with its shown signals', () => {
    const [tb, dut] = sectionsFor([CLK, DUT_COUNT, RST]);
    expect(tb).toMatchObject({ path: sectionPath(TB), label: 'TB', top: 0, bottom: 3 * ROW_HEIGHT });
    expect(tb.blocks.map((b) => b.path)).toEqual([CLK, RST]);
    expect(dut).toMatchObject({ label: 'RTL', top: 3 * ROW_HEIGHT + SECTION_GAP_PX });
    expect(dut.blocks.map((b) => b.label)).toEqual(['count']);
  });

  test('a vector with its bits unfolded is one block, as tall as its rows', () => {
    const [tb] = sectionsFor([CLK, Q, RST], [Q]);
    expect(tb.blocks.map((b) => b.path)).toEqual([CLK, Q, RST]);
    expect(tb.blocks[1]).toMatchObject({ top: 2 * ROW_HEIGHT, bottom: 7 * ROW_HEIGHT }); // q and its four bits
  });

  test('the geometry is the list model the canvas paints from', () => {
    const list = listRows(data, state([CLK, Q, DUT_COUNT], [Q]));
    for (const section of sectionsOf(list)) {
      for (const block of section.blocks) expect(list.rows[rowIndexAtY(list, block.top) ?? -1].path).toBe(block.path);
    }
  });

  test('a section with one shown signal has nothing to reorder', () => {
    const movable = movablePaths(sectionsFor([CLK, Q, RST, DUT_COUNT], [Q]));
    expect([...movable]).toEqual([CLK, Q, RST]);
  });

  test('the same name in two sections is two signals', () => {
    const sections = sectionsFor([CLK, RST, DUT_CLK, DUT_COUNT]);
    expect(blockOf(sections, CLK)?.section.label).toBe('TB');
    expect(blockOf(sections, DUT_CLK)?.section.label).toBe('RTL');
  });
});

describe('where a drag would drop', () => {
  const sections = sectionsFor([CLK, RST, Q, DUT_COUNT, DUT_CLK], [], [sectionPath(TB)]);
  const [tb, dut] = sections;
  const dragClk = { own: tb, from: 0 };

  test('below the middle of a block is the slot after it', () => {
    expect(dropTargetAt(sections, dragClk, middleOf(tb, 2) + 1)).toEqual({
      kind: 'slot',
      move: { section: tb, from: 0, to: 3 },
      lineY: tb.blocks[2].bottom,
    });
    expect(dropTargetAt(sections, dragClk, middleOf(tb, 2) - 1)).toMatchObject({ kind: 'slot', move: { to: 2 }, lineY: tb.blocks[2].top });
  });

  test('next to where it already is changes nothing: no line', () => {
    expect(dropTargetAt(sections, dragClk, middleOf(tb, 0))).toEqual({ kind: 'unchanged' });
    expect(dropTargetAt(sections, dragClk, middleOf(tb, 1) - 1)).toEqual({ kind: 'unchanged' });
  });

  test("over its own head it goes first; over its section's signals not shown, last", () => {
    expect(dropTargetAt(sections, { own: tb, from: 2 }, 1)).toMatchObject({ kind: 'slot', move: { to: 0 } });
    expect(dropTargetAt(sections, dragClk, tb.bottom - 1)).toMatchObject({ kind: 'slot', move: { to: 3 } });
  });

  test('above and below the list it stays at the ends', () => {
    expect(dropTargetAt(sections, { own: tb, from: 2 }, -50)).toMatchObject({ kind: 'slot', move: { to: 0 } });
    expect(dropTargetAt(sections, { own: dut, from: 0 }, dut.bottom + 500)).toMatchObject({ kind: 'slot', move: { to: 2 } });
  });

  test('another section, and the gap above it, refuse the drop and say why', () => {
    expect(dropTargetAt(sections, dragClk, middleOf(dut, 0))).toEqual({ kind: 'other-section', label: 'TB' });
    expect(dropTargetAt(sections, dragClk, dut.top - 1)).toEqual({ kind: 'other-section', label: 'TB' });
    expect(dropTargetAt(sections, { own: dut, from: 0 }, middleOf(tb, 0))).toEqual({ kind: 'other-section', label: 'RTL' });
  });
});

describe('the order after a move', () => {
  const shown = [CLK, DUT_COUNT, RST, DUT_CLK, Q];
  const sections = sectionsFor(shown);
  const [tb] = sections;

  test("a section's signals take their new order in their own places; the other section does not move", () => {
    expect(tb.blocks.map((b) => b.path)).toEqual([CLK, RST, Q]);
    expect(orderAfter(shown, { section: tb, from: 0, to: 3 })).toEqual([RST, DUT_COUNT, Q, DUT_CLK, CLK]);
    expect(orderAfter(shown, { section: tb, from: 2, to: 0 })).toEqual([Q, DUT_COUNT, CLK, DUT_CLK, RST]);
  });

  test('the list and its traces follow the new order', () => {
    const moved = orderAfter(shown, { section: tb, from: 2, to: 1 });
    expect(traceRows(listRows(data, state(moved))).map((r) => r.path)).toEqual([CLK, Q, RST, DUT_COUNT, DUT_CLK]);
  });

  test('a move says where the signal ends up', () => {
    expect(placeOf({ section: tb, from: 0, to: 3 })).toEqual({ place: 3, of: 3 });
    expect(placeOf({ section: tb, from: 2, to: 0 })).toEqual({ place: 1, of: 3 });
  });
});

describe('a move made on an order the list no longer has', () => {
  const [tb] = sectionsFor([CLK, Q, RST]);
  const move = { section: tb, from: 2, to: 0 };

  test('fits while the section still shows the same signals in the same order', () => {
    expect(fitsOrder([CLK, DUT_COUNT, Q, RST], move)).toBe(true);
  });

  test('does not fit when a signal of the section is gone or the order changed', () => {
    expect(fitsOrder([CLK, RST], move)).toBe(false);
    expect(fitsOrder([Q, CLK, RST], move)).toBe(false);
  });
});

describe('moves from the keyboard and the menu', () => {
  const sections = sectionsFor([CLK, RST, Q]);
  const [tb] = sections;

  test('one place up or down, or to either end', () => {
    expect(stepMove(sections, RST, 'up')).toEqual({ section: tb, from: 1, to: 0 });
    expect(stepMove(sections, RST, 'down')).toEqual({ section: tb, from: 1, to: 3 });
    expect(stepMove(sections, Q, 'top')).toEqual({ section: tb, from: 2, to: 0 });
    expect(stepMove(sections, CLK, 'bottom')).toEqual({ section: tb, from: 0, to: 3 });
  });

  test('nothing at the edge it is already at, nor for a signal that cannot move', () => {
    expect(stepMove(sections, CLK, 'up')).toBeNull();
    expect(stepMove(sections, CLK, 'top')).toBeNull();
    expect(stepMove(sections, Q, 'down')).toBeNull();
    expect(stepMove(sections, Q, 'bottom')).toBeNull();
    expect(stepMove(sections, `${Q}[1]`, 'up')).toBeNull();
  });
});

describe('scrolling while dragging', () => {
  const box = { top: 100, bottom: 600 };
  const zoneTop = box.top + AXIS_HEIGHT;

  test('nothing away from the edges; faster the deeper into an edge zone, at most a row a frame', () => {
    expect(autoScrollSpeed(350, box)).toBe(0);
    expect(autoScrollSpeed(zoneTop + AUTO_SCROLL_ZONE_PX, box)).toBe(0);
    expect(autoScrollSpeed(zoneTop + AUTO_SCROLL_ZONE_PX / 2, box)).toBeLessThan(0);
    expect(autoScrollSpeed(zoneTop, box)).toBe(-ROW_HEIGHT);
    expect(autoScrollSpeed(box.bottom - AUTO_SCROLL_ZONE_PX / 2, box)).toBeGreaterThan(0);
    expect(autoScrollSpeed(box.bottom + 200, box)).toBe(ROW_HEIGHT);
    expect(autoScrollSpeed(box.bottom - 4, box)).toBeGreaterThan(autoScrollSpeed(box.bottom - 20, box));
  });
});
