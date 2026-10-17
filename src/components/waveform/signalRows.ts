// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The signal list as rows (docs/waveform_viewer_spec.md § 8.6): the testbench's own
 * signals first, then its instances folded (`▸ dut`), and signals the format could not
 * carry, greyed out (FR-4, FR-5, FR-11). A signal is named by its hierarchical path, so the student's choices survive
 * a rerun for every signal that still exists (FR-17). Pure.
 */

import { NO_TRACE, type Scope, type SignalRef, type UnavailableReason, type WaveformData } from './model';

/** `counter_tb/dut/state`; a record field adds its name: `counter_tb/pair/a`. */
export type SignalPath = string;

const SEPARATOR = '/';
export const childPath = (parent: string, name: string): string => (parent === '' ? name : `${parent}${SEPARATOR}${name}`);

/** The scope a testbench run shows first: the top that is not a package. */
export function testbenchScope(data: WaveformData): Scope | undefined {
  return data.root.scopes.find((s) => s.kind !== 'package');
}

/** Every signal with a trace, by path – records and arrays through their fields. */
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

/** The testbench's own signals in declaration order, records and arrays as their parts. */
export function testbenchSignalPaths(data: WaveformData): SignalPath[] {
  const tb = testbenchScope(data);
  if (tb === undefined) return [];
  const paths: SignalPath[] = [];
  const add = (path: SignalPath, signal: SignalRef) => {
    if (signal.trace !== NO_TRACE) paths.push(path);
    for (const field of signal.fields ?? []) add(childPath(path, field.name), field);
  };
  for (const signal of tb.signals) add(childPath(tb.name, signal.name), signal);
  return paths;
}

export type Row =
  | { readonly kind: 'signal'; readonly path: SignalPath; readonly signal: SignalRef; readonly depth: number; readonly shown: boolean }
  | { readonly kind: 'group'; readonly path: SignalPath; readonly signal: SignalRef; readonly depth: number; readonly open: boolean }
  | { readonly kind: 'scope'; readonly path: string; readonly name: string; readonly depth: number; readonly open: boolean }
  | { readonly kind: 'unavailable'; readonly path: string; readonly name: string; readonly reason: UnavailableReason; readonly depth: number }
  | { readonly kind: 'more'; readonly path: string; readonly count: number; readonly depth: number };

export interface ListState {
  /** Signals drawn with their trace. */
  readonly shown: ReadonlySet<SignalPath>;
  /** Scopes and records unfolded by the student. */
  readonly open: ReadonlySet<string>;
  /** The testbench signals not shown at first are listed as "N more signals" until this is set. */
  readonly showAll: boolean;
}

interface Walk {
  readonly state: ListState;
  readonly rows: Row[];
}

function signalRows(walk: Walk, path: SignalPath, signal: SignalRef, depth: number): void {
  if (signal.trace !== NO_TRACE) {
    walk.rows.push({ kind: 'signal', path, signal, depth, shown: walk.state.shown.has(path) });
    return;
  }
  const open = walk.state.open.has(path);
  walk.rows.push({ kind: 'group', path, signal, depth, open });
  if (open) for (const field of signal.fields ?? []) signalRows(walk, childPath(path, field.name), field, depth + 1);
}

function scopeContents(walk: Walk, path: string, scope: Scope, depth: number): void {
  for (const signal of scope.signals) signalRows(walk, childPath(path, signal.name), signal, depth);
  for (const entry of scope.unavailable) {
    walk.rows.push({ kind: 'unavailable', path: childPath(path, entry.name), name: entry.name, reason: entry.reason, depth });
  }
  for (const child of scope.scopes) scopeRow(walk, childPath(path, child.name), child, depth);
}

function scopeRow(walk: Walk, path: string, scope: Scope, depth: number): void {
  const open = walk.state.open.has(path);
  walk.rows.push({ kind: 'scope', path, name: scope.name, depth, open });
  if (open) scopeContents(walk, path, scope, depth + 1);
}

/**
 * The rows of the list. At the testbench level, signals that are neither shown nor
 * listed because the student unfolded them wait under one "N more signals" row.
 */
export function listRows(data: WaveformData, state: ListState): Row[] {
  const walk: Walk = { state, rows: [] };
  const tb = testbenchScope(data);
  if (tb === undefined) return walk.rows;
  const tbRows: Walk = { state, rows: [] };
  scopeContents(tbRows, tb.name, tb, 0);
  let hidden = 0;
  for (const row of tbRows.rows) {
    const hideable = row.kind === 'signal' && row.depth === 0 && !row.shown;
    if (hideable && !state.showAll) hidden++;
    else walk.rows.push(row);
  }
  if (hidden > 0) {
    const firstScope = walk.rows.findIndex((row) => row.kind === 'scope' && row.depth === 0);
    const more: Row = { kind: 'more', path: `${tb.name}#more`, count: hidden, depth: 0 };
    walk.rows.splice(firstScope < 0 ? walk.rows.length : firstScope, 0, more);
  }
  return walk.rows;
}

/** The declaration a row's path names, split into its scope path and the signal's own name. */
export function splitPath(path: SignalPath): { scopes: string[]; name: string } {
  const parts = path.split(SEPARATOR);
  return { scopes: parts.slice(0, -1), name: parts[parts.length - 1] };
}
