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
  readonly stale: string;
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
    stale: token('--wv-stale'),
  };
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

export function drawAxis(ctx: CanvasRenderingContext2D, view: TimeView, width: number, height: number, tickFs: number, colors: WaveColors): void {
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, AXIS_HEIGHT);
  ctx.font = AXIS_FONT;
  ctx.textBaseline = 'middle';
  for (const mark of tickMarks(view, width, tickFs)) {
    const x = Math.round(mark.x) + 0.5;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(x, AXIS_HEIGHT - 6);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillStyle = colors.axisText;
    ctx.fillText(mark.label, x + 3, AXIS_HEIGHT / 2);
  }
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  ctx.moveTo(0, AXIS_HEIGHT - 0.5);
  ctx.lineTo(width, AXIS_HEIGHT - 0.5);
  ctx.stroke();
}

function hatch(ctx: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top, x1 - x0, bottom - top);
  ctx.clip();
  ctx.beginPath();
  for (let x = x0 - (bottom - top); x < x1; x += HATCH_STEP) {
    ctx.moveTo(x, bottom);
    ctx.lineTo(x + (bottom - top), top);
  }
  ctx.stroke();
  ctx.restore();
}

/** One bit: levels for 0/1, weak levels dashed, Z in the middle, U a red band, X/W hatched (§ 8.5). */
function drawBitSpan(ctx: CanvasRenderingContext2D, value: string, x0: number, x1: number, top: number, bottom: number, colors: WaveColors): void {
  const mid = (top + bottom) / 2;
  const line = (y: number, color: string, dashed = false) => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  switch (value) {
    case '1':
    case 'H':
      line(top, colors.high, value === 'H');
      break;
    case '0':
    case 'L':
      line(bottom, colors.low, value === 'L');
      break;
    case 'Z':
      line(mid, colors.highZ);
      break;
    case 'U':
      ctx.fillStyle = colors.undefined;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x0, top, x1 - x0, bottom - top);
      ctx.globalAlpha = 1;
      line(top, colors.undefined);
      line(bottom, colors.undefined);
      break;
    case '-':
      ctx.fillStyle = colors.dontCare;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x0, top, x1 - x0, bottom - top);
      ctx.globalAlpha = 1;
      break;
    default:
      // X, W
      ctx.strokeStyle = colors.undefined;
      hatch(ctx, x0, x1, top, bottom);
      line(top, colors.undefined);
      line(bottom, colors.undefined);
  }
}

const levelOf = (value: string): number => (value === '1' || value === 'H' ? 0 : value === '0' || value === 'L' ? 1 : 0.5);

/** The bus shape – two lines that cross at every change – with the value written in it when it fits. */
function drawBusSpan(ctx: CanvasRenderingContext2D, text: string, bad: boolean, x0: number, x1: number, top: number, bottom: number, colors: WaveColors): void {
  const mid = (top + bottom) / 2;
  const slope = Math.min(BUS_SLOPE, (x1 - x0) / 2);
  ctx.strokeStyle = bad ? colors.undefined : colors.bus;
  ctx.beginPath();
  ctx.moveTo(x0, mid);
  ctx.lineTo(x0 + slope, top);
  ctx.lineTo(x1 - slope, top);
  ctx.lineTo(x1, mid);
  ctx.lineTo(x1 - slope, bottom);
  ctx.lineTo(x0 + slope, bottom);
  ctx.closePath();
  if (bad) {
    ctx.fillStyle = colors.undefined;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.stroke();
  const room = x1 - x0 - 2 * (slope + TEXT_PAD);
  if (room <= 0) return;
  ctx.fillStyle = bad ? colors.undefined : colors.busText;
  // Never abbreviated while it fits (an FSM's state name); cut with an ellipsis only when it does not.
  let shown = text;
  if (ctx.measureText(shown).width > room) {
    while (shown.length > 1 && ctx.measureText(`${shown}…`).width > room) shown = shown.slice(0, -1);
    shown = shown.length > 1 ? `${shown}…` : '';
  }
  ctx.fillText(shown, Math.max(x0, 0) + slope + TEXT_PAD, mid);
}

export interface RowDrawing {
  readonly signal: SignalRef;
  readonly trace: Trace;
  readonly spans: readonly Span[];
  readonly showAs: ShowAs;
  /** Top of the row on the canvas. */
  readonly y: number;
}

export function drawRow(ctx: CanvasRenderingContext2D, view: TimeView, row: RowDrawing, colors: WaveColors): void {
  const top = row.y + PAD;
  const bottom = row.y + ROW_HEIGHT - PAD;
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5;
  const bit = row.signal.kind === 'logic';
  let previousLevel: number | undefined;
  for (const span of row.spans) {
    const x0 = timeToX(view, span.start);
    const x1 = Math.max(timeToX(view, span.end), x0 + 1);
    if (span.value === NO_VALUE) {
      previousLevel = undefined;
      continue;
    }
    if (span.value === BUSY) {
      ctx.fillStyle = bit ? colors.high : colors.bus;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x0, top, x1 - x0, bottom - top);
      ctx.globalAlpha = 1;
      previousLevel = undefined;
      continue;
    }
    const value = row.trace.values[span.value];
    if (bit) {
      const level = levelOf(value);
      // The edge between two levels.
      if (previousLevel !== undefined && previousLevel !== level) {
        ctx.strokeStyle = colors.high;
        ctx.beginPath();
        ctx.moveTo(x0, top + previousLevel * (bottom - top));
        ctx.lineTo(x0, top + level * (bottom - top));
        ctx.stroke();
      }
      drawBitSpan(ctx, value, x0, x1, top, bottom, colors);
      previousLevel = level;
    } else {
      drawBusSpan(ctx, formatValue(row.signal, value, row.showAs), isUndefinedValue(row.signal, value), x0, x1, top, bottom, colors);
    }
  }
  ctx.lineWidth = 1;
}

export function drawVerticalLine(ctx: CanvasRenderingContext2D, x: number, height: number, color: string, width = 1): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, 0);
  ctx.lineTo(Math.round(x) + 0.5, height);
  ctx.stroke();
  ctx.lineWidth = 1;
}
