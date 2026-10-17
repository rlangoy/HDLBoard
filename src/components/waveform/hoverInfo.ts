// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The text of the tooltip over a trace (FR-23): the value and the time, a short vector
 * in both hexadecimal and decimal so "Show as" is rarely needed, and for `U`, `X`, `Z`,
 * `W` and `-` one sentence on what the value means. Over the error marker: the error's
 * message. Pure.
 */

import { formatValue, type ShowAs } from './radix';
import type { TraceRow } from './signalRows';
import { formatCursorFs } from './timeAxis';
import { valueAt } from './valueAt';
import { valueHelp } from './valueHelp';

/** Vectors up to this width show hexadecimal and decimal in their tooltip (FR-23). */
const BOTH_RADIXES_MAX_WIDTH = 16;

/** Where the mouse is: on which shown row, at which time, and how that time reads. */
export interface HoverPoint {
  readonly row: TraceRow | undefined;
  readonly time: number;
  readonly tickFs: number;
  /** How finely the mouse can point (`pixelResolutionFs`): the time gets no more decimals than that. */
  readonly resolutionFs?: number;
}

export const timeLine = (at: HoverPoint): string => `at ${formatCursorFs(at.time * at.tickFs, at.resolutionFs)}`;

export function errorMarkerLines(text: string, at: HoverPoint): string[] {
  return ['First error', text, timeLine(at)];
}

/** The value of `row` at the mouse, as the tooltip words it. */
function valueText(row: TraceRow, raw: string, showAs: ShowAs): string {
  const { signal } = row;
  if (signal.kind === 'vector' && signal.width <= BOTH_RADIXES_MAX_WIDTH) {
    return `${formatValue(signal, raw, 'hex')} = ${formatValue(signal, raw, 'decimal')}`;
  }
  return formatValue(signal, raw, showAs);
}

/** The tooltip's lines over a shown row, or none over anything else. */
export function traceLines(at: HoverPoint, showAs: ShowAs): string[] {
  const { row } = at;
  if (row === undefined) return [];
  const raw = valueAt(row.trace, at.time);
  const when = timeLine(at);
  if (raw === undefined) return [`${row.label}: no value yet`, when];
  const help = row.signal.kind === 'logic' || row.signal.kind === 'vector' ? valueHelp(raw) : undefined;
  return [`${row.label} = ${valueText(row, raw, showAs)}`, when, ...(help === undefined ? [] : [help])];
}
