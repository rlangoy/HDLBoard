// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The bits of a vector as traces of their own, for a vector row that is unfolded
 * (FR-6: every bit drawn like any other bit). A bit's trace is made once from the
 * vector's and kept while the vector's trace lives. Pure.
 */

import type { SignalRef, Trace } from './model';
import { TraceBuilder } from './traceBuilder';

const cache = new WeakMap<Trace, Map<number, Trace>>();

/** The trace of the bit at `position` in the vector's text, counted from the left (most significant). */
export function bitTrace(vector: Trace, position: number): Trace {
  let bits = cache.get(vector);
  if (bits === undefined) {
    bits = new Map();
    cache.set(vector, bits);
  }
  let trace = bits.get(position);
  if (trace === undefined) {
    trace = buildBitTrace(vector, position);
    bits.set(position, trace);
  }
  return trace;
}

function buildBitTrace(vector: Trace, position: number): Trace {
  const builder = new TraceBuilder();
  for (let i = 0; i < vector.times.length; i++) {
    builder.change(vector.times[i], vector.values[vector.valueIndex[i]][position] ?? '?');
  }
  return builder.build();
}

/** The index a bit has in VHDL or Verilog – `count(3)` is the leftmost of `count(3 downto 0)`. */
export function bitIndex(vector: SignalRef, position: number): number {
  const range = vector.range;
  if (range === undefined) return vector.width - 1 - position;
  return range.left >= range.right ? range.left - position : range.left + position;
}

/** The model's view of one bit of a vector. */
export function bitSignal(vector: SignalRef, position: number): SignalRef {
  return { name: `${vector.name}[${bitIndex(vector, position)}]`, trace: vector.trace, kind: 'logic', width: 1 };
}
