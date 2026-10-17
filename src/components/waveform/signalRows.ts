// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The signal list as rows (docs/waveform_viewer_spec.md § 8.6). The list has one section
 * for the testbench and one for each design instance it holds, `tb (Testbench)` and
 * `dut (RTL)`, set apart by a small gap and a colour of their own. In a section the
 * shown signals come first, together, in the student's order, so their traces lie
 * directly below each other; a shown vector can unfold into its bits. The section's
 * chevron shows or hides the signals that are not shown, to tick them (FR-4, FR-5,
 * FR-11). A signal is named by its hierarchical path, so the student's choices survive
 * a rerun for every signal that still exists (FR-17). Pure.
 */

import { bitSignal, bitTrace } from './bitTraces';
import { NO_TRACE, type Scope, type SignalRef, type Trace, type UnavailableReason, type WaveformData } from './model';
import { ROW_HEIGHT } from './waveDraw';

/** `counter_tb/dut/state`; a record field adds its name: `counter_tb/pair/a`. */
export type SignalPath = string;

const SEPARATOR = '/';
/** A section's path: `#` and its scope's path, never a name VHDL or Verilog allow. */
const SECTION_MARK = '#';
/** The space above every section but the first. */
export const SECTION_GAP_PX = 8;

export const sectionPath = (scopePath: string): string => `${SECTION_MARK}${scopePath}`;

/** Which part of the design a row belongs to; it sets the row's colour. */
export type Tone = 'testbench' | 'rtl';

export const childPath = (parent: string, name: string): string => (parent === '' ? name : `${parent}${SEPARATOR}${name}`);

/** The declaration a path names, split into its scope path and the signal's own name. */
export function splitPath(path: SignalPath): { scopes: string[]; name: string } {
  const parts = path.split(SEPARATOR);
  return { scopes: parts.slice(0, -1), name: parts[parts.length - 1] };
}

/** The scope a testbench run shows first: the top that is not a package. */
export function testbenchScope(data: WaveformData): Scope | undefined {
  return data.root.scopes.find((s) => s.kind !== 'package');
}

/** Every signal by path – records and arrays through their fields. */
export function signalsByPath(data: WaveformData): Map<SignalPath, SignalRef> {
  const found = new Map<SignalPath, SignalRef>();
  const addSignal = (path: SignalPath, signal: SignalRef) => {
    found.set(path, signal);
    for (const field of signal.fields ?? []) addSignal(childPath(path, field.name), field);
  };
  const addScope = (path: string, scope: Scope) => {
    for (const signal of scope.signals) addSignal(childPath(path, signal.name), signal);
    for (const child of scope.scopes) addScope(childPath(path, child.name), child);
  };
  for (const scope of data.root.scopes) addScope(scope.name, scope);
  return found;
}

/** A shown signal, or one bit of an unfolded vector: a row with a trace on the canvas. */
export interface TraceRow {
  readonly kind: 'trace';
  readonly path: SignalPath;
  /** The name as listed, inside its section: `count`, `state`, `u1.q`, `pair.a`, `count[3]`. */
  readonly label: string;
  readonly signal: SignalRef;
  readonly trace: Trace;
  readonly depth: number;
  readonly tone: Tone;
  /** A vector's row can unfold into its bits (FR-6). */
  readonly expandable: boolean;
  readonly expanded: boolean;
  /** For a bit row: the vector it belongs to. */
  readonly parent?: SignalPath;
}

/** The head of a section, `TB` or `RTL`; open, it also lists the signals not shown. */
export interface SectionRow {
  readonly kind: 'section';
  readonly path: string;
  readonly label: string;
  /** The scope's path, from the testbench down: what the head's tooltip names. */
  readonly scopes: readonly string[];
  readonly depth: number;
  readonly tone: Tone;
  readonly open: boolean;
  /** How many of its signals are not shown. */
  readonly count: number;
}

interface Placed {
  readonly depth: number;
  readonly tone: Tone;
}

export type Row =
  | TraceRow
  | SectionRow
  | (Placed & { readonly kind: 'hidden'; readonly path: SignalPath; readonly signal: SignalRef })
  | (Placed & { readonly kind: 'group'; readonly path: SignalPath; readonly signal: SignalRef; readonly open: boolean })
  | (Placed & { readonly kind: 'folder'; readonly path: string; readonly label: string; readonly open: boolean; readonly count: number })
  | (Placed & { readonly kind: 'unavailable'; readonly path: string; readonly name: string; readonly reason: UnavailableReason });

export interface ListState {
  /** The signals drawn, in the order they are listed in their section. */
  readonly shown: readonly SignalPath[];
  /** Sections, folders and records unfolded by the student. */
  readonly open: ReadonlySet<string>;
  /** Shown vectors unfolded into their bits. */
  readonly expanded: ReadonlySet<SignalPath>;
}

export interface ListModel {
  readonly rows: readonly Row[];
  /** The top of each row, from the top of the list: a section after the first has a gap above it. */
  readonly tops: readonly number[];
  /** The height of the whole list. */
  readonly height: number;
}

/** Where the walk adds rows and what it reads to decide them. */
interface Walk {
  readonly state: ListState;
  readonly shown: ReadonlySet<SignalPath>;
  readonly rows: Row[];
  readonly tone: Tone;
}

/** A place in the tree: the path of a scope or record, and the depth of its rows. */
interface At {
  readonly path: string;
  readonly depth: number;
}

/** A design section: the testbench, or an instance in it. */
interface Section {
  readonly path: string;
  readonly scope: Scope;
  readonly tone: Tone;
  /** The testbench section holds only its own signals; an instance's holds its instances' too. */
  readonly owns: (path: SignalPath) => boolean;
}

const SIGNAL_DEPTH = 1;

/** `state` in the section's own scope, `u1.q` in an instance below it. */
function labelOf(path: SignalPath, section: string): string {
  return path.slice(section.length + 1).split(SEPARATOR).join('.');
}

function bitRows(row: TraceRow): TraceRow[] {
  return Array.from({ length: row.signal.width }, (_, position) => {
    const signal = bitSignal(row.signal, position);
    return {
      kind: 'trace',
      path: `${row.path}[${position}]`,
      label: signal.name,
      signal,
      trace: bitTrace(row.trace, position),
      depth: row.depth + 1,
      tone: row.tone,
      expandable: false,
      expanded: false,
      parent: row.path,
    };
  });
}

/** The section's shown signals that still exist, with the bits of every unfolded vector after it. */
function shownRows(data: WaveformData, state: ListState, section: Section): TraceRow[] {
  const known = signalsByPath(data);
  return state.shown.filter(section.owns).flatMap((path) => {
    const signal = known.get(path);
    const trace = signal === undefined ? undefined : data.traces.get(signal.trace);
    if (signal === undefined || trace === undefined) return [];
    const expandable = signal.kind === 'vector';
    const expanded = expandable && state.expanded.has(path);
    const label = labelOf(path, section.path);
    const row: TraceRow = { kind: 'trace', path, label, signal, trace, depth: SIGNAL_DEPTH, tone: section.tone, expandable, expanded };
    return expanded ? [row, ...bitRows(row)] : [row];
  });
}

/** How many signals under a scope or record are not shown. */
function hiddenCount(walk: Walk, at: string, signals: readonly SignalRef[]): number {
  return signals.reduce((sum, signal) => {
    const path = childPath(at, signal.name);
    if (signal.trace !== NO_TRACE) return sum + (walk.shown.has(path) ? 0 : 1);
    return sum + hiddenCount(walk, path, signal.fields ?? []);
  }, 0);
}

function hiddenSignal(walk: Walk, at: At, signal: SignalRef): void {
  const path = childPath(at.path, signal.name);
  const { tone } = walk;
  if (signal.trace !== NO_TRACE) {
    if (!walk.shown.has(path)) walk.rows.push({ kind: 'hidden', path, signal, depth: at.depth, tone });
    return;
  }
  if (hiddenCount(walk, path, signal.fields ?? []) === 0) return;
  const open = walk.state.open.has(path);
  walk.rows.push({ kind: 'group', path, signal, depth: at.depth, tone, open });
  if (open) for (const field of signal.fields ?? []) hiddenSignal(walk, { path, depth: at.depth + 1 }, field);
}

/** A scope's own signals that are not shown, and the ones the format could not carry. */
function hiddenContents(walk: Walk, at: At, scope: Scope): void {
  for (const signal of scope.signals) hiddenSignal(walk, at, signal);
  for (const entry of scope.unavailable) {
    const path = childPath(at.path, entry.name);
    walk.rows.push({ kind: 'unavailable', path, name: entry.name, reason: entry.reason, depth: at.depth, tone: walk.tone });
  }
}

/** Not-shown signals anywhere below `scope`, its own and its instances'. */
function scopeHiddenCount(walk: Walk, path: string, scope: Scope): number {
  const own = hiddenCount(walk, path, scope.signals) + scope.unavailable.length;
  return scope.scopes.reduce((sum, child) => sum + scopeHiddenCount(walk, childPath(path, child.name), child), own);
}

/** An instance inside a design section, as a folder: its own not-shown signals, then its instances. */
function instanceFolder(walk: Walk, at: At, scope: Scope): void {
  const count = scopeHiddenCount(walk, at.path, scope);
  if (count === 0) return;
  const open = walk.state.open.has(at.path);
  walk.rows.push({ kind: 'folder', path: at.path, label: scope.name, depth: at.depth, tone: walk.tone, open, count });
  if (!open) return;
  hiddenContents(walk, { path: at.path, depth: at.depth + 1 }, scope);
  for (const child of scope.scopes) instanceFolder(walk, { path: childPath(at.path, child.name), depth: at.depth + 1 }, child);
}

function sectionCount(walk: Walk, section: Section): number {
  if (section.tone === 'rtl') return scopeHiddenCount(walk, section.path, section.scope);
  return hiddenCount(walk, section.path, section.scope.signals) + section.scope.unavailable.length;
}

/** A section: its head, its shown signals, and, open, the ones not shown. */
function addSection(data: WaveformData, walk: Walk, section: Section): void {
  const path = sectionPath(section.path);
  const open = walk.state.open.has(path);
  const label = section.tone === 'testbench' ? 'TB' : 'RTL';
  const scopes = section.path.split(SEPARATOR);
  walk.rows.push({ kind: 'section', path, label, scopes, depth: 0, tone: section.tone, open, count: sectionCount(walk, section) });
  walk.rows.push(...shownRows(data, walk.state, section));
  if (!open) return;
  hiddenContents(walk, { path: section.path, depth: SIGNAL_DEPTH }, section.scope);
  if (section.tone === 'testbench') return;
  for (const child of section.scope.scopes) instanceFolder(walk, { path: childPath(section.path, child.name), depth: SIGNAL_DEPTH }, child);
}

/** The testbench, then each instance it holds. */
function sectionsOf(testbench: Scope): Section[] {
  const instances = testbench.scopes.map((scope): Section => {
    const path = childPath(testbench.name, scope.name);
    return { path, scope, tone: 'rtl', owns: (signal) => signal.startsWith(`${path}${SEPARATOR}`) };
  });
  const inInstance = (signal: SignalPath) => instances.some((instance) => instance.owns(signal));
  const own = (signal: SignalPath) => signal.startsWith(`${testbench.name}${SEPARATOR}`) && !inInstance(signal);
  return [{ path: testbench.name, scope: testbench, tone: 'testbench', owns: own }, ...instances];
}

/** Each row's top: rows are `ROW_HEIGHT` high, and a section after the first has a gap above it. */
function layOut(rows: readonly Row[]): ListModel {
  const tops: number[] = [];
  let y = 0;
  rows.forEach((row, index) => {
    if (row.kind === 'section' && index > 0) y += SECTION_GAP_PX;
    tops.push(y);
    y += ROW_HEIGHT;
  });
  return { rows, tops, height: y };
}

/** The rows of the list, section by section. */
export function listRows(data: WaveformData, state: ListState): ListModel {
  const testbench = testbenchScope(data);
  if (testbench === undefined) return layOut([]);
  const rows: Row[] = [];
  const shown = new Set(state.shown);
  for (const section of sectionsOf(testbench)) addSection(data, { state, shown, rows, tone: section.tone }, section);
  return layOut(rows);
}

/** The index of the row at `y` from the top of the list, or undefined in a gap or below the list. */
export function rowIndexAtY(model: Pick<ListModel, 'tops'>, y: number): number | undefined {
  let low = 0;
  let high = model.tops.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (model.tops[middle] > y) high = middle - 1;
    else low = middle + 1;
  }
  return high >= 0 && y < model.tops[high] + ROW_HEIGHT ? high : undefined;
}

/** The shown traces, in list order. */
export const traceRows = (model: Pick<ListModel, 'rows'>): TraceRow[] => model.rows.filter((row): row is TraceRow => row.kind === 'trace');

/**
 * Where a path's signal is declared: a record field or array element is declared with
 * its record (`tb/pair/a` → `pair` in `tb`), a signal in its scope.
 */
export function declarationOf(data: WaveformData, path: SignalPath): { scopes: string[]; name: string } {
  const known = signalsByPath(data);
  let { scopes, name } = splitPath(path);
  while (scopes.length > 1 && known.has(scopes.join(SEPARATOR))) {
    name = scopes[scopes.length - 1];
    scopes = scopes.slice(0, -1);
  }
  return { scopes, name };
}
