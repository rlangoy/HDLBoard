// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The recorded waveform files of docs/impl_files_for_waveform/ (spec § 12 step 0), as the
 * unit tests read them. GHW is stored as base64 text: Vite's `?raw` reads text only.
 * Re-created by docs/impl_files_for_waveform/make_fixtures.sh.
 */

import type { Trace, WaveformData, SignalRef, Scope } from './model';

const texts = import.meta.glob<string>('./fixtures/*', { query: '?raw', import: 'default', eager: true });

export function fixtureText(name: string): string {
  const text = texts[`./fixtures/${name}`];
  if (text === undefined) throw new Error(`No fixture ${name}`);
  return text;
}

export function fixtureBytes(name: string): Uint8Array {
  const binary = atob(fixtureText(`${name}.b64`).replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The scope at `path` (names from the root), or a test failure. */
export function scopeAt(data: WaveformData, ...path: string[]): Scope {
  let scope = data.root;
  for (const name of path) {
    const next = scope.scopes.find((s) => s.name === name);
    if (next === undefined) throw new Error(`No scope ${name} in ${scope.name || '(root)'}: ${scope.scopes.map((s) => s.name).join(', ')}`);
    scope = next;
  }
  return scope;
}

export function signalIn(scope: Scope, name: string): SignalRef {
  const signal = scope.signals.find((s) => s.name === name);
  if (signal === undefined) throw new Error(`No signal ${name} in ${scope.name}: ${scope.signals.map((s) => s.name).join(', ')}`);
  return signal;
}

/** The trace as `[time, value]` pairs, easy to compare. */
export function changes(data: WaveformData, signal: SignalRef): Array<[number, string]> {
  const trace = data.traces.get(signal.trace) as Trace;
  return Array.from(trace.times, (t, i) => [t, trace.values[trace.valueIndex[i]]]);
}
