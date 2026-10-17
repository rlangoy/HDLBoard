// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Canvas 2D drawing of the waveform (docs/waveform_viewer_spec.md § 8.5): the time
 * axis, one row per shown signal, the cursor and the first error's marker. Only the
 * visible window is drawn, as the spans of `levelOfDetail.ts`. Pure apart from the
 * context it is handed; colours come from `Waveform.css` through `WaveColors`.
 */

import { BUSY, NO_VALUE, type Span } from './levelOfDetail';
import type { SignalRef, Trace } from './model';
import { formatValue, isUndefinedValue, type ShowAs } from './radix';
import { tickMarks, timeToX, type TimeView } from './timeAxis';

export interface WaveColors {
  readonly background: string;
  readonly grid: string;
  readonly axisText: string;
  readonly high: string;
  readonly low: string;
  readonly bus: string;
  readonly busText: string;
  readonly undefined: string;
  readonly highZ: string;
  readonly dontCare: string;
  readonly cursor: string;
  readonly errorMarker: string;
  readonly selection: string;
  readonly selectedRow: string;
  /** Traces and heads of the testbench section and of the design (RTL) sections. */
  readonly testbenchInk: string;
  readonly rtlInk: string;
  readonly enumInk: string;
  readonly testbenchHead: string;
  readonly rtlHead: string;
}

/** The custom properties of `Waveform.css`, read once per draw. */
export function readColors(element: Element): WaveColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: token('--wv-bg'),
    grid: token('--wv-grid'),
    axisText: token('--wv-axis-text'),
    high: token('--wv-trace-high'),
    low: token('--wv-trace-low'),
    bus: token('--wv-trace-bus'),
    busText: token('--wv-trace-bus-text'),
    undefined: token('--wv-trace-undefined'),
    highZ: token('--wv-trace-z'),
    dontCare: token('--wv-trace-dont-care'),
    cursor: token('--wv-cursor'),
    errorMarker: token('--wv-error-marker'),
    selection: token('--wv-selection'),
    selectedRow: token('--wv-row-selected'),
    testbenchInk: token('--wv-tb-ink'),
    rtlInk: token('--wv-rtl-ink'),
    enumInk: token('--wv-enum-ink'),
    testbenchHead: token('--wv-tb-head'),
    rtlHead: token('--wv-rtl-head'),
  };
}

/** Where drawing goes, and in which colours. */
export interface Painter {
  readonly ctx: CanvasRenderingContext2D;
  readonly colors: WaveColors;
}

/** A stretch of one row: from `x0` to `x1`, between the trace's `top` and `bottom`. */
interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
}

export const AXIS_HEIGHT = 28;
export const ROW_HEIGHT = 28;
/** The trace's top and bottom inside its row. */
const PAD = 6;
const BUS_SLOPE = 3;
const FONT = '12px "Cascadia Mono", Consolas, ui-monospace, monospace';
const AXIS_FONT = '11px system-ui, sans-serif';
const TEXT_PAD = 4;
const HATCH_STEP = 6;
const TICK_LENGTH = 6;
const LABEL_OFFSET = 3;
const WEAK_DASH_LENGTH = 3;
const WEAK_DASH = [WEAK_DASH_LENGTH, WEAK_DASH_LENGTH];
const BAND_ALPHA = 0.35;
const BAD_BUS_ALPHA = 0.18;
const BUSY_ALPHA = 0.5;
const TRACE_WIDTH = 1.5;
/** Keeps a one-pixel line on whole device pixels. */
const HALF_PIXEL = 0.5;

/** The width and height of the canvas, and the length of one tick of the file. */
export interface AxisSize {
  readonly width: number;
  readonly height: number;
  readonly tickFs: number;
}

function line(ctx: CanvasRenderingContext2D, from: readonly [number, number], to: readonly [number, number]): void {
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

/** Tick marks with labels, and a faint grid line down through the rows at each. */
export function drawAxis({ ctx, colors }: Painter, view: TimeView, size: AxisSize): void {
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, size.width, AXIS_HEIGHT);
  ctx.font = AXIS_FONT;
  ctx.textBaseline = 'middle';
  for (const mark of tickMarks(view, size.width, size.tickFs)) {
    const x = Math.round(mark.x) + HALF_PIXEL;
    ctx.strokeStyle = colors.grid;
    line(ctx, [x, AXIS_HEIGHT - TICK_LENGTH], [x, size.height]);
    ctx.fillStyle = colors.axisText;
    ctx.fillText(mark.label, x + LABEL_OFFSET, AXIS_HEIGHT / 2);
  }
  ctx.strokeStyle = colors.grid;
  line(ctx, [0, AXIS_HEIGHT - HALF_PIXEL], [size.width, AXIS_HEIGHT - HALF_PIXEL]);
}

function hatch(ctx: CanvasRenderingContext2D, box: Box): void {
  const height = box.bottom - box.top;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x0, box.top, box.x1 - box.x0, height);
  ctx.clip();
  ctx.beginPath();
  for (let x = box.x0 - height; x < box.x1; x += HATCH_STEP) {
    ctx.moveTo(x, box.bottom);
    ctx.lineTo(x + height, box.top);
  }
  ctx.stroke();
  ctx.restore();
}

function horizontal(ctx: CanvasRenderingContext2D, box: Box, y: number): void {
  line(ctx, [box.x0, y], [box.x1, y]);
}

function band(ctx: CanvasRenderingContext2D, box: Box, color: string): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = BAND_ALPHA;
  ctx.fillRect(box.x0, box.top, box.x1 - box.x0, box.bottom - box.top);
  ctx.globalAlpha = 1;
}

/** A level line: solid for a strong value, dashed for a weak one (`L`, `H`). */
function level({ ctx }: Painter, box: Box, style: { readonly y: number; readonly color: string; readonly weak?: boolean }): void {
  ctx.strokeStyle = style.color;
  ctx.setLineDash(style.weak ? WEAK_DASH : []);
  horizontal(ctx, box, style.y);
  ctx.setLineDash([]);
}

/** One bit: levels for 0/1, weak levels dashed, Z in the middle, U a red band, X/W hatched (§ 8.5). */
function drawBitSpan(painter: Painter, value: string, box: Box): void {
  const { ctx, colors } = painter;
  switch (value) {
    case '1':
    case 'H':
      return level(painter, box, { y: box.top, color: colors.high, weak: value === 'H' });
    case '0':
    case 'L':
      return level(painter, box, { y: box.bottom, color: colors.low, weak: value === 'L' });
    case 'Z':
      return level(painter, box, { y: (box.top + box.bottom) / 2, color: colors.highZ });
    case '-':
      return band(ctx, box, colors.dontCare);
    case 'U':
      band(ctx, box, colors.undefined);
      break;
    default: // X, W
      ctx.strokeStyle = colors.undefined;
      hatch(ctx, box);
  }
  level(painter, box, { y: box.top, color: colors.undefined });
  level(painter, box, { y: box.bottom, color: colors.undefined });
}

/** Where a bit is drawn, as a share of the row's height from the top. */
const levelOf = (value: string): number => (value === '1' || value === 'H' ? 0 : value === '0' || value === 'L' ? 1 : 1 / 2);

/** The value text, cut with an ellipsis only when it does not fit (an FSM's state name never is while it fits). */
function fitText(ctx: CanvasRenderingContext2D, text: string, room: number): string {
  if (ctx.measureText(text).width <= room) return text;
  let shown = text;
  while (shown.length > 1 && ctx.measureText(`${shown}…`).width > room) shown = shown.slice(0, -1);
  return shown.length > 1 ? `${shown}…` : '';
}

function busOutline(ctx: CanvasRenderingContext2D, box: Box, slope: number): void {
  const mid = (box.top + box.bottom) / 2;
  ctx.beginPath();
  ctx.moveTo(box.x0, mid);
  ctx.lineTo(box.x0 + slope, box.top);
  ctx.lineTo(box.x1 - slope, box.top);
  ctx.lineTo(box.x1, mid);
  ctx.lineTo(box.x1 - slope, box.bottom);
  ctx.lineTo(box.x0 + slope, box.bottom);
  ctx.closePath();
}

/** The bus shape – two lines that cross at every change – with the value written in it when it fits. */
function drawBusSpan({ ctx, colors }: Painter, label: { readonly text: string; readonly bad: boolean }, box: Box): void {
  const slope = Math.min(BUS_SLOPE, (box.x1 - box.x0) / 2);
  const color = label.bad ? colors.undefined : colors.bus;
  busOutline(ctx, box, slope);
  if (label.bad) {
    ctx.fillStyle = colors.undefined;
    ctx.globalAlpha = BAD_BUS_ALPHA;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = color;
  ctx.stroke();
  const room = box.x1 - box.x0 - 2 * (slope + TEXT_PAD);
  if (room <= 0) return;
  ctx.fillStyle = label.bad ? colors.undefined : colors.busText;
  ctx.fillText(fitText(ctx, label.text, room), Math.max(box.x0, 0) + slope + TEXT_PAD, (box.top + box.bottom) / 2);
}

export interface RowDrawing {
  readonly signal: SignalRef;
  readonly trace: Trace;
  readonly spans: readonly Span[];
  readonly showAs: ShowAs;
  /** Top of the row on the canvas. */
  readonly y: number;
}

/** The vertical edge where a bit changes level. */
function drawEdge({ ctx, colors }: Painter, box: Box, levels: readonly [number, number]): void {
  const height = box.bottom - box.top;
  ctx.strokeStyle = colors.high;
  line(ctx, [box.x0, box.top + levels[0] * height], [box.x0, box.top + levels[1] * height]);
}

function drawBusy({ ctx, colors }: Painter, box: Box, bit: boolean): void {
  ctx.fillStyle = bit ? colors.high : colors.bus;
  ctx.globalAlpha = BUSY_ALPHA;
  ctx.fillRect(box.x0, box.top, box.x1 - box.x0, box.bottom - box.top);
  ctx.globalAlpha = 1;
}

export function drawRow(painter: Painter, view: TimeView, row: RowDrawing): void {
  const { ctx } = painter;
  const top = row.y + PAD;
  const bottom = row.y + ROW_HEIGHT - PAD;
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = TRACE_WIDTH;
  const bit = row.signal.kind === 'logic';
  let previousLevel: number | undefined;
  for (const span of row.spans) {
    const x0 = timeToX(view, span.start);
    const box: Box = { x0, x1: Math.max(timeToX(view, span.end), x0 + 1), top, bottom };
    if (span.value === NO_VALUE || span.value === BUSY) {
      if (span.value === BUSY) drawBusy(painter, box, bit);
      previousLevel = undefined;
      continue;
    }
    const value = row.trace.values[span.value];
    if (!bit) {
      drawBusSpan(painter, { text: formatValue(row.signal, value, row.showAs), bad: isUndefinedValue(row.signal, value) }, box);
      continue;
    }
    const current = levelOf(value);
    if (previousLevel !== undefined && previousLevel !== current) drawEdge(painter, box, [previousLevel, current]);
    drawBitSpan(painter, value, box);
    previousLevel = current;
  }
  ctx.lineWidth = 1;
}

export interface LineStyle {
  readonly height: number;
  readonly color: string;
  readonly width?: number;
}

/** A line from top to bottom: the cursor, the error marker. */
export function drawVerticalLine({ ctx }: Painter, x: number, style: LineStyle): void {
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width ?? 1;
  const at = Math.round(x) + HALF_PIXEL;
  line(ctx, [at, 0], [at, style.height]);
  ctx.lineWidth = 1;
}
