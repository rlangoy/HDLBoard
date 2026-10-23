// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reordering the shown signals (docs/imp_wave_rearange.md § 5.2): where each section's
 * shown signals are on the list, which slot a drag over the list points at, and the
 * order after a move. A shown vector with its bits unfolded is one block, and a signal
 * only moves inside its own section, TB or one RTL instance. Geometry comes from the
 * list model, never from the DOM, so the list and the canvas always agree. Pure.
 */

import type { ListModel, Row, SignalPath, Tone, TraceRow } from './signalRows';
import { ROW_HEIGHT } from './waveDraw';

/** A shown signal and the rows it covers on the list: itself, and its bits when unfolded. */
export interface Block {
  readonly path: SignalPath;
  readonly label: string;
  /** Pixels from the top of the list. */
  readonly top: number;
  readonly bottom: number;
}

/** A section of the list and the shown signals that can be reordered in it. */
export interface Section {
  /** The section head's path, `#tb/dut`. */
  readonly path: string;
  /** `TB` or `RTL`, as on its head. */
  readonly label: string;
  readonly tone: Tone;
  readonly top: number;
  /** The bottom of the section's last row. */
  readonly bottom: number;
  readonly blocks: readonly Block[];
}

/** A move inside one section: the block at `from` goes to slot `to` (0 = above the first block, blocks.length = below the last). */
export interface Move {
  readonly section: Section;
  readonly from: number;
  readonly to: number;
}

/** What releasing a drag at some height would do. */
export type DropTarget =
  | { readonly kind: 'slot'; readonly move: Move; readonly lineY: number }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'other-section'; readonly label: string };

/** The keyboard and menu moves. */
export type MoveStep = 'up' | 'down' | 'top' | 'bottom';

const bottomOf = (list: ListModel, index: number): number => list.tops[index] + ROW_HEIGHT;

/** A shown signal of its own, not a bit of an unfolded vector: what a move moves. */
export const isSignalRow = (row: Row): row is TraceRow => row.kind === 'trace' && row.parent === undefined;
const isBitRow = (row: Row): boolean => row.kind === 'trace' && row.parent !== undefined;

interface OpenSection {
  path: string;
  label: string;
  tone: Tone;
  top: number;
  bottom: number;
  blocks: Block[];
}

/** Adds row `index` to the section being read: a new block, a bit that lengthens the last one, or just more of the section. */
function addRow(section: OpenSection, list: ListModel, index: number): void {
  const row = list.rows[index];
  const bottom = bottomOf(list, index);
  section.bottom = bottom;
  const last = section.blocks[section.blocks.length - 1];
  if (isSignalRow(row)) section.blocks.push({ path: row.path, label: row.label, top: list.tops[index], bottom });
  else if (isBitRow(row) && last !== undefined) section.blocks[section.blocks.length - 1] = { ...last, bottom };
}

/** Every section with its shown blocks, in list order. */
export function sectionsOf(list: ListModel): Section[] {
  const sections: OpenSection[] = [];
  list.rows.forEach((row, index) => {
    if (row.kind === 'section') sections.push({ path: row.path, label: row.label, tone: row.tone, top: list.tops[index], bottom: bottomOf(list, index), blocks: [] });
    else if (sections.length > 0) addRow(sections[sections.length - 1], list, index);
  });
  return sections;
}

/** The section and the index of the block that `path` heads, or undefined when it is not a movable signal. */
export function blockOf(sections: readonly Section[], path: SignalPath): { readonly section: Section; readonly index: number } | undefined {
  for (const section of sections) {
    const index = section.blocks.findIndex((block) => block.path === path);
    if (index >= 0) return { section, index };
  }
  return undefined;
}

/** The signals that can be moved at all: each shares its section with another shown signal. */
export function movablePaths(sections: readonly Section[]): Set<SignalPath> {
  const crowded = sections.filter((section) => section.blocks.length > 1);
  return new Set(crowded.flatMap((section) => section.blocks.map((block) => block.path)));
}

/** The section at `y`: the gap above a section belongs to it; above the list is the first, below it the last. */
function sectionAt(sections: readonly Section[], y: number): Section {
  return sections.find((section) => y < section.bottom) ?? sections[sections.length - 1];
}

/** The slot at `y` in its section: how many blocks have their middle above it (the midpoint rule). */
function slotAt(section: Section, y: number): number {
  return section.blocks.filter((block) => (block.top + block.bottom) / 2 < y).length;
}

/** Where the insertion line of slot `to` is drawn. */
export function lineYOf(section: Section, to: number): number {
  const below = section.blocks[to];
  return below === undefined ? section.blocks[section.blocks.length - 1].bottom : below.top;
}

/** A move that leaves the order as it is: the slot right above or right below the block itself. */
export const changesNothing = (move: Move): boolean => move.to === move.from || move.to === move.from + 1;

/** What releasing the drag of block `from` of `own` at list height `y` would do (D5, D6, D8). */
export function dropTargetAt(sections: readonly Section[], drag: { readonly own: Section; readonly from: number }, y: number): DropTarget {
  const section = sectionAt(sections, y);
  if (section.path !== drag.own.path) return { kind: 'other-section', label: drag.own.label };
  const move = { section, from: drag.from, to: slotAt(section, y) };
  return changesNothing(move) ? { kind: 'unchanged' } : { kind: 'slot', move, lineY: lineYOf(section, move.to) };
}

const SLOT_OF_STEP: Readonly<Record<MoveStep, (from: number, count: number) => number>> = {
  up: (from) => from - 1,
  // The slot below the next block.
  down: (from) => from + 2,
  top: () => 0,
  bottom: (_from, count) => count,
};

/** The move a key or a menu item makes, or null when the signal is already at that edge. */
export function stepMove(sections: readonly Section[], path: SignalPath, step: MoveStep): Move | null {
  const found = blockOf(sections, path);
  if (found === undefined) return null;
  const count = found.section.blocks.length;
  const to = SLOT_OF_STEP[step](found.index, count);
  const move = { section: found.section, from: found.index, to };
  return to < 0 || to > count || changesNothing(move) ? null : move;
}

/**
 * Whether `move` was made on the order `shown` still has. A drag outlives the list it
 * started on when a new waveform arrives during it; a signal renamed or gone then must
 * not be put back, nor another lost.
 */
export function fitsOrder(shown: readonly SignalPath[], move: Move): boolean {
  const blocks = move.section.blocks.map((block) => block.path);
  const inSection = new Set(blocks);
  const now = shown.filter((path) => inSection.has(path));
  return now.length === blocks.length && now.every((path, index) => path === blocks[index]);
}

/** The section's signals in their order after `move`. */
function sectionOrderAfter(move: Move): SignalPath[] {
  const order = move.section.blocks.map((block) => block.path);
  const [moving] = order.splice(move.from, 1);
  const to = move.to > move.from ? move.to - 1 : move.to;
  order.splice(to, 0, moving);
  return order;
}

/**
 * The shown signals after `move`: the section's signals take their new order in the
 * places they had in `shown`, so the other sections' signals do not move at all.
 */
export function orderAfter(shown: readonly SignalPath[], move: Move): SignalPath[] {
  const order = sectionOrderAfter(move);
  const inSection = new Set(order);
  let next = 0;
  return shown.map((path) => (inSection.has(path) ? order[next++] : path));
}

/** Where `path` is after a move, for the announcement: `place` counts from 1. */
export function placeOf(move: Move): { readonly place: number; readonly of: number } {
  const order = sectionOrderAfter(move);
  return { place: order.indexOf(move.section.blocks[move.from].path) + 1, of: order.length };
}
