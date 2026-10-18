// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a figure shows (docs/waveform_viewer_spec.md § 8.9): the shown signals in list
 * order across the time window on screen; the traces stop where the run ended, since
 * nothing is known after it. Section heads and the hidden signals stay out. Pure.
 */

import type { SignalRef, Ticks, Trace } from '../model';
import type { ShowAs } from '../radix';
import type { SignalPath, Tone, TraceRow } from '../signalRows';
import type { FigureFont } from './figureStyle';

export interface FigureRow {
  readonly label: string;
  readonly signal: SignalRef;
  readonly trace: Trace;
  readonly showAs: ShowAs;
  readonly tone: Tone;
}

export interface FigureContent {
  readonly rows: readonly FigureRow[];
  readonly start: Ticks;
  readonly end: Ticks;
  /** Where the recording ends: the traces stop there. */
  readonly runEnd: Ticks;
  /** The femtoseconds in one tick of `start`, `end`, `runEnd` and `cursor`. */
  readonly tickFs: number;
  readonly cursor: Ticks;
}

/** The width of `text` in `font`, in the figure's drawing units. */
export type MeasureText = (text: string, font: FigureFont) => number;

const PATH_SEPARATOR = '/';
const LABEL_SEPARATOR = '.';

/** A signal's name below the testbench: `dut.count` for `counter_tb/dut/count`. */
const nameBelowTestbench = (path: SignalPath): string => path.split(PATH_SEPARATOR).slice(1).join(LABEL_SEPARATOR);

/**
 * Each row's name as the list writes it; a name that two rows share – `clk` in the
 * testbench and in the design – gets its place in the design, so no two rows read alike.
 */
function uniqueLabels(rows: readonly TraceRow[]): string[] {
  const uses = new Map<string, number>();
  for (const row of rows) uses.set(row.label, (uses.get(row.label) ?? 0) + 1);
  return rows.map((row) => ((uses.get(row.label) ?? 0) > 1 ? nameBelowTestbench(row.path) : row.label));
}

export function figureRows(rows: readonly TraceRow[], showAsOf: (path: SignalPath) => ShowAs): FigureRow[] {
  const labels = uniqueLabels(rows);
  return rows.map((row, index) => ({ label: labels[index], signal: row.signal, trace: row.trace, showAs: showAsOf(row.path), tone: row.tone }));
}
