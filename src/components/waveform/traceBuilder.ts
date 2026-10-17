// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Collects the value changes of one trace while a file is parsed, and hands them over
 * as the typed arrays of `Trace` (docs/waveform_viewer_spec.md § 8.2). Shared by both
 * parsers. Values are interned, a value equal to the one before is not a change, and a
 * second change at the same time replaces the first: the viewer shows the value at the
 * end of each time step (NFR-6). Pure.
 */

import type { Ticks, Trace } from './model';

const LINEAR_INTERN_LIMIT = 8;

export class TraceBuilder {
  private times: number[] = [];
  private valueIndex: number[] = [];
  private readonly values: string[] = [];
  private readonly interned = new Map<string, number>();

  private intern(value: string): number {
    // Most traces have a handful of values (a clock two, an FSM its states): a scan beats a lookup.
    const values = this.values;
    if (values.length <= LINEAR_INTERN_LIMIT) {
      for (let i = 0; i < values.length; i++) if (values[i] === value) return i;
    }
    let index = this.interned.get(value);
    if (index === undefined) {
      index = this.values.length;
      this.values.push(value);
      this.interned.set(value, index);
    }
    return index;
  }

  /** The value the trace has now, or undefined before its first change. */
  get last(): string | undefined {
    const n = this.valueIndex.length;
    return n === 0 ? undefined : this.values[this.valueIndex[n - 1]];
  }

  change(time: Ticks, value: string): void {
    const index = this.intern(value);
    const n = this.times.length;
    if (n > 0 && this.times[n - 1] === time) {
      this.valueIndex[n - 1] = index;
      // The replaced change may now repeat the one before it.
      if (n > 1 && this.valueIndex[n - 2] === index) {
        this.times.pop();
        this.valueIndex.pop();
      }
      return;
    }
    if (n > 0 && this.valueIndex[n - 1] === index) return;
    this.times.push(time);
    this.valueIndex.push(index);
  }

  /** Forgets every change at `time` or later: the incomplete last time step of a cut-off file. */
  dropFrom(time: Ticks): void {
    let n = this.times.length;
    while (n > 0 && this.times[n - 1] >= time) n--;
    this.times.length = n;
    this.valueIndex.length = n;
  }

  build(): Trace {
    const trace: Trace = {
      times: Float64Array.from(this.times),
      valueIndex: Uint32Array.from(this.valueIndex),
      values: this.values,
    };
    this.times = [];
    this.valueIndex = [];
    return trace;
  }
}
