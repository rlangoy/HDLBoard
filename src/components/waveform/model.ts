// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The format-neutral waveform model (docs/waveform_viewer_spec.md § 8.2, W3). Both
 * parsers produce it, and nothing after them knows which file format a waveform came
 * from. Types only — no logic.
 */

/** Integer ticks of the file's timescale – exact while below 2^53. */
export type Ticks = number;

/** Index of a trace in `WaveformData.traces`. */
export type TraceId = number;

/** A group (record, array of non-bits) has fields instead of a trace of its own. */
export const NO_TRACE: TraceId = -1;

export type WaveFormat = 'ghw' | 'vcd';

/** How the run that wrote the file ended (`WAVE-READY`'s status, spec § 7.4). */
export type RunWaveStatus = 'complete' | 'stopped' | 'timeout' | 'size-limit';

export interface WaveSource {
  readonly format: WaveFormat;
  readonly status: RunWaveStatus;
  /** The file ended inside a record: everything up to the last complete time step is kept. */
  readonly truncated: boolean;
}

export interface WaveformData {
  readonly source: WaveSource;
  /** Length of one tick in femtoseconds (1 for GHDL, 1000 for `1ps`). */
  readonly tickFs: number;
  readonly endTime: Ticks;
  readonly root: Scope;
  /** One trace per distinct value stream; several signals may share one (Icarus aliases, GHW ports). */
  readonly traces: ReadonlyMap<TraceId, Trace>;
}

export type ScopeKind = 'design' | 'instance' | 'package';

/** Why a signal is listed but has no trace (FR-11); `valueHelp.ts` words each one. */
export type UnavailableReason = 'vcd-type' | 'memory';

export interface UnavailableSignal {
  readonly name: string;
  readonly reason: UnavailableReason;
}

export interface Scope {
  readonly name: string;
  readonly kind: ScopeKind;
  readonly scopes: readonly Scope[];
  readonly signals: readonly SignalRef[];
  /** Signals the format could not carry, with the reason shown in the list (FR-11). */
  readonly unavailable: readonly UnavailableSignal[];
}

export type SignalKind = 'logic' | 'vector' | 'integer' | 'real' | 'enum' | 'record' | 'array' | 'character';

export interface EnumType {
  readonly name: string;
  readonly literals: readonly string[];
}

export interface SignalRef {
  readonly name: string;
  /** `NO_TRACE` for a record or an array of non-bits, which show their `fields` instead. */
  readonly trace: TraceId;
  readonly kind: SignalKind;
  readonly width: number;
  readonly range?: { readonly left: number; readonly right: number };
  /** For `enum`: the type name and its literals in order (`state_t`: idle, run, done). */
  readonly enumType?: EnumType;
  /** For `record` and `array`: its parts, shown folded under it. */
  readonly fields?: readonly SignalRef[];
}

export interface Trace {
  /** Ascending change times. */
  readonly times: Float64Array;
  /** Index into `values` for each change. */
  readonly valueIndex: Uint32Array;
  /** Distinct values, interned: '0', '1', 'U', '0101', 'idle', '3.5', … */
  readonly values: readonly string[];
}

/** A file the viewer cannot read; `message` is one sentence for the student. */
export class WaveParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaveParseError';
  }
}
