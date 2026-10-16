// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The plugin output of one run (docs/plugin_batch_implementation_plan.md § 7.2, § 7.3):
 * every PLUGIN frame, kept per `kind/instance` so that a flooding instance cannot evict
 * another's entries, and shown merged in arrival order. Each instance keeps at most its
 * newest `MAX_ENTRIES_PER_INSTANCE` entries (once over, the oldest tenth is dropped at
 * once) and counts the ones it dropped.
 *
 * Mutable on purpose: a testbench-driven plugin sends tens of thousands of frames a
 * second, so the log is appended to in place and the view re-reads it at most once per
 * animation frame (`usePluginOutput`). No React, no I/O.
 */

import type { PluginLine } from './pluginFrame';

/** Bounds browser memory per instance (§ 6.2). */
export const MAX_ENTRIES_PER_INSTANCE = 10_000;

export interface PluginEntry extends PluginLine {
  /** Arrival order within the run, from 0. */
  readonly seq: number;
}

/** One instance's entries: the key of a tab in stage 2. */
export interface PluginInstanceLog {
  readonly kind: string;
  readonly instance: string;
  readonly entries: readonly PluginEntry[];
  /** Entries dropped from the front to keep within the limit. */
  readonly dropped: number;
}

interface MutableInstanceLog {
  readonly kind: string;
  readonly instance: string;
  entries: PluginEntry[];
  dropped: number;
}

/** The same instance name with another kind is another key, so a payload is never read with the wrong schema. */
export const instanceKey = (line: Pick<PluginLine, 'kind' | 'instance'>): string => `${line.kind}/${line.instance}`;

export class PluginLog {
  private readonly instances = new Map<string, MutableInstanceLog>();
  private nextSeq = 0;
  private readonly limit: number;

  constructor(limit: number = MAX_ENTRIES_PER_INSTANCE) {
    this.limit = limit;
  }

  add(line: PluginLine): void {
    const key = instanceKey(line);
    let log = this.instances.get(key);
    if (log === undefined) {
      log = { kind: line.kind, instance: line.instance, entries: [], dropped: 0 };
      this.instances.set(key, log);
    }
    log.entries.push({ ...line, seq: this.nextSeq++ });
    if (log.entries.length > this.limit) this.dropOldest(log);
  }

  /** Dropping in batches keeps `add` cheap: one splice per tenth of the limit, not one shift per line. */
  private dropOldest(log: MutableInstanceLog): void {
    const excess = log.entries.length - this.limit;
    const batch = Math.max(excess, Math.ceil(this.limit / 10));
    const removed = Math.min(batch, log.entries.length - 1);
    log.entries.splice(0, removed);
    log.dropped += removed;
  }

  clear(): void {
    this.instances.clear();
    this.nextSeq = 0;
  }

  get isEmpty(): boolean {
    return this.nextSeq === 0;
  }

  /** Every instance, in the order its first line arrived. */
  instanceLogs(): PluginInstanceLog[] {
    return [...this.instances.values()].map((log) => ({ ...log, entries: [...log.entries] }));
  }

  /** All kept entries, merged in arrival order. */
  rows(): PluginEntry[] {
    return [...this.instances.values()].flatMap((log) => log.entries).sort((a, b) => a.seq - b.seq);
  }

  /** Entries no longer kept, over all instances. */
  get dropped(): number {
    let total = 0;
    for (const log of this.instances.values()) total += log.dropped;
    return total;
  }
}
