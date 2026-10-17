// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The signal list as rows (docs/waveform_viewer_spec.md § 8.6). The shown signals come
 * first, together, in the student's order, so their traces lie directly below each
 * other; a shown vector can unfold into its bits. Below them, folded, the signals not
 * shown: one folder for the testbench and one for the RTL design, with a folder per
 * instance (FR-4, FR-5, FR-11). A signal is named by its hierarchical path, so the
 * student's choices survive a rerun for every signal that still exists (FR-17). Pure.
 */

import { bitSignal, bitTrace } from './bitTraces';
import { NO_TRACE, type Scope, type SignalRef, type Trace, type UnavailableReason, type WaveformData } from './model';

/** `counter_tb/dut/state`; a record field adds its name: `counter_tb/pair/a`. */
export type SignalPath = string;

const SEPARATOR = '/';
/** Folder paths: not names VHDL or Verilog allow, so they never collide with a scope. */
export const TESTBENCH_FOLDER = '#testbench';
export const RTL_FOLDER = '#rtl';

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
  /** The name as listed: `count`, `dut.state`, `pair.a`, `count[3]`. */
  readonly label: string;
  readonly signal: SignalRef;
  readonly trace: Trace;
  readonly depth: number;
  /** A vector's row can unfold into its bits (FR-6). */
  readonly expandable: boolean;
  readonly expanded: boolean;
  /** For a bit row: the vector it belongs to. */
  readonly parent?: SignalPath;
}

export type Row =
  | TraceRow
  | { readonly kind: 'hidden'; readonly path: SignalPath; readonly signal: SignalRef; readonly depth: number }
  | { readonly kind: 'group'; readonly path: SignalPath; readonly signal: SignalRef; readonly depth: number; readonly open: boolean }
  | { readonly kind: 'folder'; readonly path: string; readonly label: string; readonly depth: number; readonly open: boolean; readonly count: number }
  | { readonly kind: 'unavailable'; readonly path: string; readonly name: string; readonly reason: UnavailableReason; readonly depth: number };

export interface ListState {
  /** The signals drawn, in the order they are listed. */
  readonly shown: readonly SignalPath[];
  /** Folders and records unfolded by the student. */
  readonly open: ReadonlySet<string>;
  /** Shown vectors unfolded into their bits. */
  readonly expanded: ReadonlySet<SignalPath>;
}

export interface ListModel {
  readonly rows: readonly Row[];
  /** The first `activeCount` rows are the trace rows. */
  readonly activeCount: number;
}

/** Where the walk adds rows and what it reads to decide them. */
interface Walk {
  readonly state: ListState;
  readonly shown: ReadonlySet<SignalPath>;
  readonly rows: Row[];
}

/** A place in the tree: the path of a scope or record, and the depth of its rows. */
interface At {
  readonly path: string;
  readonly depth: number;
}

/** `dut.state` for a signal in an instance; just `count` in the testbench itself. */
function labelOf(path: SignalPath, testbench: string): string {
  const inside = path.startsWith(`${testbench}${SEPARATOR}`) ? path.slice(testbench.length + 1) : path;
  return inside.split(SEPARATOR).join('.');
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
      depth: 1,
      expandable: false,
      expanded: false,
      parent: row.path,
    };
  });
}

/** The shown signals that still exist, with the bits of every unfolded vector after it. */
function activeRows(data: WaveformData, state: ListState, testbench: string): TraceRow[] {
  const known = signalsByPath(data);
  return state.shown.flatMap((path) => {
    const signal = known.get(path);
    const trace = signal === undefined ? undefined : data.traces.get(signal.trace);
    if (signal === undefined || trace === undefined) return [];
    const expandable = signal.kind === 'vector';
    const expanded = expandable && state.expanded.has(path);
    const row: TraceRow = { kind: 'trace', path, label: labelOf(path, testbench), signal, trace, depth: 0, expandable, expanded };
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
  if (signal.trace !== NO_TRACE) {
    if (!walk.shown.has(path)) walk.rows.push({ kind: 'hidden', path, signal, depth: at.depth });
    return;
  }
  if (hiddenCount(walk, path, signal.fields ?? []) === 0) return;
  const open = walk.state.open.has(path);
  walk.rows.push({ kind: 'group', path, signal, depth: at.depth, open });
  if (open) for (const field of signal.fields ?? []) hiddenSignal(walk, { path, depth: at.depth + 1 }, field);
}

/** A scope's own signals that are not shown, and the ones the format could not carry. */
function hiddenContents(walk: Walk, at: At, scope: Scope): void {
  for (const signal of scope.signals) hiddenSignal(walk, at, signal);
  for (const entry of scope.unavailable) {
    walk.rows.push({ kind: 'unavailable', path: childPath(at.path, entry.name), name: entry.name, reason: entry.reason, depth: at.depth });
  }
}

/** Not-shown signals anywhere below `scope`, its own and its instances'. */
function scopeHiddenCount(walk: Walk, path: string, scope: Scope): number {
  const own = hiddenCount(walk, path, scope.signals) + scope.unavailable.length;
  return scope.scopes.reduce((sum, child) => sum + scopeHiddenCount(walk, childPath(path, child.name), child), own);
}

function folder(walk: Walk, at: At & { readonly label: string; readonly count: number }): boolean {
  const open = walk.state.open.has(at.path);
  walk.rows.push({ kind: 'folder', path: at.path, label: at.label, depth: at.depth, open, count: at.count });
  return open;
}

/** An instance as a folder: its own not-shown signals, then its instances. */
function instanceFolder(walk: Walk, at: At, scope: Scope): void {
  const count = scopeHiddenCount(walk, at.path, scope);
  if (count === 0 || !folder(walk, { ...at, label: scope.name, count })) return;
  hiddenContents(walk, { path: at.path, depth: at.depth + 1 }, scope);
  for (const child of scope.scopes) instanceFolder(walk, { path: childPath(at.path, child.name), depth: at.depth + 1 }, child);
}

function testbenchFolder(walk: Walk, testbench: Scope): void {
  const count = hiddenCount(walk, testbench.name, testbench.signals) + testbench.unavailable.length;
  if (count > 0 && folder(walk, { path: TESTBENCH_FOLDER, label: 'Testbench', depth: 0, count })) {
    hiddenContents(walk, { path: testbench.name, depth: 1 }, testbench);
  }
}

function rtlFolder(walk: Walk, testbench: Scope): void {
  const count = testbench.scopes.reduce((sum, child) => sum + scopeHiddenCount(walk, childPath(testbench.name, child.name), child), 0);
  if (count === 0 || !folder(walk, { path: RTL_FOLDER, label: 'RTL', depth: 0, count })) return;
  for (const child of testbench.scopes) instanceFolder(walk, { path: childPath(testbench.name, child.name), depth: 1 }, child);
}

/** The rows of the list: the shown signals first, then the folders of the ones not shown. */
export function listRows(data: WaveformData, state: ListState): ListModel {
  const testbench = testbenchScope(data);
  if (testbench === undefined) return { rows: [], activeCount: 0 };
  const active = activeRows(data, state, testbench.name);
  const walk: Walk = { state, shown: new Set(state.shown), rows: [...active] };
  testbenchFolder(walk, testbench);
  rtlFolder(walk, testbench);
  return { rows: walk.rows, activeCount: active.length };
}

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
