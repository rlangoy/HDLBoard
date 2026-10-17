// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Paints the whole waveform canvas for one frame (docs/waveform_viewer_spec.md § 8.5):
 * background, the section heads and shown rows that are on screen, each section's traces
 * in its own colour, the axis, the part after the run, the
 * error marker, the cursor and a drag selection. Only the visible rows and time window
 * are drawn, so the cost follows the screen, not the file (NFR-1).
 */

import { paintCursorHandle } from './cursorHandle';
import { visibleSpans } from './levelOfDetail';
import type { Ticks } from './model';
import type { ShowAs } from './radix';
import { rowIndexAtY, type Row, type SignalPath, type Tone, type TraceRow } from './signalRows';
import { formatFs, timeToX, xToTime, type TimeView } from './timeAxis';
import { AXIS_HEIGHT, drawAxis, drawRow, drawVerticalLine, readColors, ROW_HEIGHT, type Painter, type WaveColors } from './waveDraw';

/** A shown waveform from an earlier run is drawn faded while the new one is on its way (§ 8.7). */
const STALE_ALPHA = 0.45;
const AFTER_RUN_ALPHA = 0.35;
const SELECTION_ALPHA = 0.15;
const ERROR_MARKER_WIDTH = 2;
const SELECTION_FONT = '600 12px system-ui, sans-serif';
const SELECTION_LABEL_Y = AXIS_HEIGHT / 2;

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface Scene {
  readonly rows: readonly Row[];
  /** Each row's top from the top of the list (`ListModel.tops`). */
  readonly tops: readonly number[];
  readonly view: TimeView;
  readonly size: CanvasSize;
  readonly scrollTop: number;
  readonly endTime: Ticks;
  readonly tickFs: number;
  readonly cursor: Ticks;
  readonly error?: Ticks;
  readonly stale: boolean;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  /** A time range being dragged out with the mouse, to zoom into. */
  readonly selection?: { readonly from: Ticks; readonly to: Ticks };
  /** The selected signal's row is shaded, as in the list. */
  readonly selectedPath?: SignalPath;
}

/** The canvas's backing store at the device's pixel ratio, with drawing in CSS pixels. */
function prepare(canvas: HTMLCanvasElement, size: CanvasSize): CanvasRenderingContext2D | null {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(size.width * ratio);
  canvas.height = Math.round(size.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

type Layout = Pick<Scene, 'tops' | 'scrollTop'>;

/** The y of the top of row `index` on the canvas. */
export const rowTop = (scene: Layout, index: number): number => AXIS_HEIGHT + (scene.tops[index] ?? 0) - scene.scrollTop;

/** The index of the row at canvas `y`, or undefined over the axis, in a gap or below the list. */
export function rowIndexAt(scene: Layout, y: number): number | undefined {
  return y < AXIS_HEIGHT ? undefined : rowIndexAtY(scene, y - AXIS_HEIGHT + scene.scrollTop);
}

/** The rows inside the visible part of the list. */
function visibleRows(scene: Scene): Array<{ readonly row: Row; readonly top: number }> {
  const found: Array<{ row: Row; top: number }> = [];
  scene.rows.forEach((row, index) => {
    const top = rowTop(scene, index);
    if (top + ROW_HEIGHT > AXIS_HEIGHT && top < scene.size.height) found.push({ row, top });
  });
  return found;
}

/** A section's traces in its colour; a state machine's states in their own. */
function toned(colors: WaveColors, tone: Tone, row: TraceRow): WaveColors {
  const ink = tone === 'testbench' ? colors.testbenchInk : colors.rtlInk;
  return { ...colors, high: ink, low: ink, bus: row.signal.kind === 'enum' ? colors.enumInk : ink };
}

/** A section's head runs across the canvas as a band in the section's colour. */
function paintSectionHead({ ctx, colors }: Painter, head: { readonly tone: Tone; readonly top: number }, width: number): void {
  const { tone, top } = head;
  ctx.fillStyle = tone === 'testbench' ? colors.testbenchHead : colors.rtlHead;
  ctx.fillRect(0, top, width, ROW_HEIGHT);
}

function paintRows(painter: Painter, scene: Scene): void {
  const { ctx } = painter;
  const { view, size } = scene;
  const window = { from: view.start, to: Math.min(xToTime(view, size.width), scene.endTime) };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, AXIS_HEIGHT, size.width, size.height - AXIS_HEIGHT);
  ctx.clip();
  ctx.globalAlpha = scene.stale ? STALE_ALPHA : 1;
  for (const { row, top } of visibleRows(scene)) {
    if (row.kind === 'section') paintSectionHead(painter, { tone: row.tone, top }, size.width);
    if (row.kind !== 'trace') continue;
    if (row.path === scene.selectedPath) paintSelectedRow(painter, top, size.width);
    const spans = visibleSpans(row.trace, window, view.ticksPerPx);
    drawRow({ ctx, colors: toned(painter.colors, row.tone, row) }, view, { signal: row.signal, trace: row.trace, spans, showAs: scene.showAsOf(row.path), y: top });
  }
  ctx.restore();
}

function paintSelectedRow({ ctx, colors }: Painter, top: number, width: number): void {
  ctx.fillStyle = colors.selectedRow;
  ctx.fillRect(0, top, width, ROW_HEIGHT);
}

/** Nothing is known after the end of the recording: that part is greyed. */
function paintAfterRun({ ctx, colors }: Painter, scene: Scene): void {
  const endX = timeToX(scene.view, scene.endTime);
  if (endX >= scene.size.width) return;
  ctx.fillStyle = colors.grid;
  ctx.globalAlpha = AFTER_RUN_ALPHA;
  ctx.fillRect(endX, AXIS_HEIGHT, scene.size.width - endX, scene.size.height - AXIS_HEIGHT);
  ctx.globalAlpha = 1;
}

/** The bottom of the last shown trace on the canvas. */
function tracesBottom(scene: Scene): number {
  const last = scene.rows.reduce((found, row, index) => (row.kind === 'trace' ? index : found), -1);
  return last < 0 ? AXIS_HEIGHT : rowTop(scene, last) + ROW_HEIGHT;
}

/** The dragged-out time range down to the last shown signal, to zoom into when the mouse is released. */
function paintSelection({ ctx, colors }: Painter, scene: Scene): void {
  if (scene.selection === undefined) return;
  const x0 = timeToX(scene.view, Math.min(scene.selection.from, scene.selection.to));
  const x1 = timeToX(scene.view, Math.max(scene.selection.from, scene.selection.to));
  const bottom = Math.min(scene.size.height, tracesBottom(scene));
  ctx.fillStyle = colors.selection;
  ctx.globalAlpha = SELECTION_ALPHA;
  ctx.fillRect(x0, 0, x1 - x0, bottom);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.selection;
  ctx.strokeRect(x0 + 1 / 2, 1 / 2, x1 - x0, bottom - 1);
  // The width of the selection, written in it on the ruler: what the view will show.
  const span = Math.abs(scene.selection.to - scene.selection.from);
  ctx.font = SELECTION_FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.selection;
  ctx.fillText(formatFs(span * scene.tickFs), (x0 + x1) / 2, SELECTION_LABEL_Y);
  ctx.textAlign = 'start';
}

export function paintWaveform(canvas: HTMLCanvasElement, scene: Scene): void {
  const ctx = prepare(canvas, scene.size);
  if (ctx === null) return;
  const painter: Painter = { ctx, colors: readColors(canvas) };
  const { size } = scene;
  ctx.fillStyle = painter.colors.background;
  ctx.fillRect(0, 0, size.width, size.height);
  paintRows(painter, scene);
  drawAxis(painter, scene.view, { width: size.width, height: size.height, tickFs: scene.tickFs });
  paintAfterRun(painter, scene);
  if (scene.error !== undefined) {
    drawVerticalLine(painter, timeToX(scene.view, scene.error), { height: size.height, color: painter.colors.errorMarker, width: ERROR_MARKER_WIDTH });
  }
  drawVerticalLine(painter, timeToX(scene.view, scene.cursor), { height: size.height, color: painter.colors.cursor });
  paintCursorHandle(painter, { view: scene.view, cursor: scene.cursor, tickFs: scene.tickFs, width: size.width });
  paintSelection(painter, scene);
}
