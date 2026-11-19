// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The types of the multiple-driver check (docs/impl_sim_only_warnings.md § 8.1). Data only. */

import type { Bits } from './bits';

/** One assignment to a signal, found in the code. */
export interface Assignment {
  /** File offset of the target. */
  readonly at: number;
  readonly target: string;
  readonly bits: Bits;
  /** It drives 'Z' somewhere: a tri-state bus, where several drivers are the point. */
  readonly tristate: boolean;
}

/**
 * Everything one process / `always` block, or one concurrent statement, drives of one
 * signal: on the FPGA, one source.
 */
export interface Driver {
  /** The process or statement, by its file offset: assignments with the same source are one driver. */
  readonly source: number;
  /** Compared as the language compares names. */
  readonly signal: string;
  /** As written in the first assignment. */
  readonly name: string;
  /** The bits it drives with a value. */
  readonly bits: readonly Bits[];
  /** The bits it drives with 'Z': a tri-state bus there, where several drivers are the point. */
  readonly tristateBits: readonly Bits[];
  /** The line of its first assignment to the signal. */
  readonly line: number;
}

/** The drivers of one architecture or module, and the names it declares as signals. */
export interface BodyDrivers {
  readonly fileId: string;
  /** The entity or module, as written. */
  readonly unitName: string;
  /** False for an architecture whose entity is declared in another file. */
  readonly ownsUnit: boolean;
  readonly drivers: readonly Driver[];
  /** Signals (VHDL) or nets and variables (Verilog) declared in the body, as written. */
  readonly declared: readonly string[];
}

/** A driver that another driver of the same bits clashes with. */
export interface DriverConflict {
  readonly fileId: string;
  readonly line: number;
  readonly signal: string;
  /** The lines of the other drivers of the same bits. */
  readonly otherLines: readonly number[];
}
