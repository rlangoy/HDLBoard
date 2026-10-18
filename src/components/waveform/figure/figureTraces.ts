// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * One signal's trace in a figure, as SVG (docs/waveform_viewer_spec.md § 8.9). Every
 * value has a shape of its own, so the figure reads without colour:
 *
 * - 0 and 1 are solid low and high lines; the weak L and H are dashed.
 * - Z runs at mid-level, as timing diagrams draw high impedance.
 * - X and W are a hatched box, U a shaded box, `-` a box with nothing in it.
 * - A bus is the usual crossing outline, its value centred between the crossings, or
 *   left out when it does not fit, so labels never touch an edge or each other.
 * - Changes closer together than the figure can show are one shaded stretch.
 *
 * Pure.
 */

import { BUSY, NO_VALUE, visibleSpans, type Span } from '../levelOfDetail';
import { formatValue, isUndefinedValue } from '../radix';
import { timeToX } from '../timeAxis';
import type { FigureRow, MeasureText } from './figureContent';
import { centredBaseline, type FigureLayout } from './figureLayout';
import { DETAIL_PER_UNIT, SHADE_OPACITY, type FigureLook } from './figureStyle';
import { PathData, element, pathElement, textElement } from './svgMarkup';

export interface TraceContext {
  readonly layout: FigureLayout;
  readonly look: FigureLook;
  readonly measure: MeasureText;
  /** The end of the time shown; the layout's view gives the start. */
  readonly end: number;
}

/** A stretch of one trace: from `x0` to `x1`, between its `top` and `bottom` line. */
interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
}

/** The colours of one row: its section's, and an enumeration's own for a state machine. */
interface RowInk {
  readonly ink: string;
  readonly bus: string;
}

/** What one row is drawn with. */
interface RowStyle extends TraceContext {
  readonly colors: RowInk;
}

/** One value over its stretch of the trace. */
interface Stretch {
  readonly value: string;
  readonly box: Box;
}

/** Room between a bus value and the bus's slanted ends, as a share of the value font. */
const BUS_TEXT_PAD_EM = 0.25;

const middle = (box: Box): number => (box.top + box.bottom) / 2;

/** The pieces of a bit's trace, gathered so each kind of line is one path. */
class BitPaths {
  readonly strong = new PathData();
  readonly weak = new PathData();
  readonly highZ = new PathData();
  readonly undefinedOutline = new PathData();
  readonly hatch = new PathData();
  readonly undefinedShades: Box[] = [];
  readonly busyShades: Box[] = [];
}

/** Where a level value is drawn, or undefined for a value drawn as a box. */
function levelY(value: string, box: Box): number | undefined {
  switch (value) {
    case '1':
    case 'H':
      return box.top;
    case '0':
    case 'L':
      return box.bottom;
    case 'Z':
      return middle(box);
    default:
      return undefined;
  }
}

/** Diagonal lines across `box`, clipped to it by hand: every SVG reader draws plain lines. */
function addHatch(path: PathData, box: Box, step: number): void {
  const height = box.bottom - box.top;
  for (let x = box.x0 - height; x < box.x1; x += step) {
    const startX = Math.max(x, box.x0);
    const endX = Math.min(x + height, box.x1);
    if (endX > startX) path.moveTo(startX, box.bottom - (startX - x)).lineTo(endX, box.bottom - (endX - x));
  }
}

function addBox(path: PathData, box: Box): void {
  path.moveTo(box.x0, box.top).horizontalTo(box.x1).verticalTo(box.bottom).horizontalTo(box.x0).close();
}

function addLevel(paths: BitPaths, { value, box }: Stretch, y: number): void {
  const path = value === 'Z' ? paths.highZ : value === 'H' || value === 'L' ? paths.weak : paths.strong;
  path.moveTo(box.x0, y).horizontalTo(box.x1);
}

function addBoxValue(paths: BitPaths, { value, box }: Stretch, hatchStep: number): void {
  addBox(paths.undefinedOutline, box);
  if (value === 'U') paths.undefinedShades.push(box);
  else if (value !== '-') addHatch(paths.hatch, box, hatchStep);
}

function shadeMarkup(boxes: readonly Box[], color: string): string {
  return boxes
    .map((box) => element('rect', { x: box.x0, y: box.top, width: box.x1 - box.x0, height: box.bottom - box.top, fill: color, 'fill-opacity': SHADE_OPACITY }))
    .join('');
}

function bitPathsMarkup(paths: BitPaths, look: FigureLook, ink: string): string {
  const { palette } = look;
  const line = { fill: 'none', 'stroke-width': look.traceLine, 'stroke-linecap': 'square' };
  return [
    shadeMarkup(paths.busyShades, ink),
    shadeMarkup(paths.undefinedShades, palette.undefined),
    pathElement(paths.hatch, { fill: 'none', stroke: palette.undefined, 'stroke-width': look.gridLine }),
    pathElement(paths.undefinedOutline, { ...line, stroke: palette.undefined, 'stroke-linejoin': 'miter' }),
    pathElement(paths.highZ, { ...line, stroke: palette.highZ }),
    pathElement(paths.weak, { ...line, stroke: ink, 'stroke-dasharray': look.weakDash, 'stroke-linecap': 'butt' }),
    pathElement(paths.strong, { ...line, stroke: ink }),
  ].join('');
}

function bitMarkup(row: FigureRow, boxes: ReadonlyArray<readonly [Span, Box]>, style: RowStyle): string {
  const paths = new BitPaths();
  let previousY: number | undefined;
  for (const [span, box] of boxes) {
    if (span.value === NO_VALUE || span.value === BUSY) {
      if (span.value === BUSY) paths.busyShades.push(box);
      previousY = undefined;
      continue;
    }
    const value = row.trace.values[span.value];
    const y = levelY(value, box);
    if (y === undefined) {
      addBoxValue(paths, { value, box }, style.look.hatchStep);
    } else {
      if (previousY !== undefined && previousY !== y) paths.strong.moveTo(box.x0, previousY).verticalTo(y);
      addLevel(paths, { value, box }, y);
    }
    previousY = y;
  }
  return bitPathsMarkup(paths, style.look, style.colors.ink);
}

function addBusOutline(path: PathData, box: Box, busSlope: number): void {
  const slope = Math.min(busSlope, (box.x1 - box.x0) / 2);
  const mid = middle(box);
  path
    .moveTo(box.x0, mid)
    .lineTo(box.x0 + slope, box.top)
    .lineTo(box.x1 - slope, box.top)
    .lineTo(box.x1, mid)
    .lineTo(box.x1 - slope, box.bottom)
    .lineTo(box.x0 + slope, box.bottom)
    .close();
}

/** The value centred between the crossings, or nothing when it would touch them. */
function busLabel(text: string, box: Box, context: TraceContext): string {
  const { look, measure } = context;
  const font = look.valueFont;
  const room = box.x1 - box.x0 - 2 * (look.busSlope + BUS_TEXT_PAD_EM * font.size);
  if (measure(text, font) > room) return '';
  const attributes = { x: (box.x0 + box.x1) / 2, y: centredBaseline(middle(box), font), 'text-anchor': 'middle', fill: look.palette.text };
  return textElement({ ...attributes, 'font-family': font.family, 'font-size': font.size }, text);
}

function busMarkup(row: FigureRow, boxes: ReadonlyArray<readonly [Span, Box]>, style: RowStyle): string {
  const { look } = style;
  const { bus } = style.colors;
  const known = new PathData();
  const unknown = new PathData();
  const busy: Box[] = [];
  const labels: string[] = [];
  for (const [span, box] of boxes) {
    if (span.value === BUSY) busy.push(box);
    if (span.value === NO_VALUE || span.value === BUSY) continue;
    const value = row.trace.values[span.value];
    addBusOutline(isUndefinedValue(row.signal, value) ? unknown : known, box, look.busSlope);
    labels.push(busLabel(formatValue(row.signal, value, row.showAs), box, style));
  }
  const outline = { 'stroke-width': look.traceLine, 'stroke-linejoin': 'miter' };
  const { undefined: undefinedColor } = look.palette;
  return [
    shadeMarkup(busy, bus),
    pathElement(unknown, { ...outline, stroke: undefinedColor, fill: undefinedColor, 'fill-opacity': SHADE_OPACITY }),
    pathElement(known, { ...outline, stroke: bus, fill: 'none' }),
    ...labels,
  ].join('');
}

function rowInk(row: FigureRow, look: FigureLook): RowInk {
  const ink = look.palette.ink[row.tone];
  return { ink, bus: row.signal.kind === 'enum' ? look.palette.enumInk : ink };
}

/** The trace of `row`, whose row starts at `rowTop`. */
export function traceMarkup(row: FigureRow, rowTop: number, context: TraceContext): string {
  const { layout, look } = context;
  const { view } = layout;
  const spans = visibleSpans(row.trace, { from: view.start, to: context.end }, view.ticksPerPx / DETAIL_PER_UNIT);
  const top = rowTop + look.tracePad;
  const bottom = rowTop + look.rowHeight - look.tracePad;
  const xOf = (time: number) => layout.tracesLeft + timeToX(view, time);
  const boxes = spans.map((span) => [span, { x0: xOf(span.start), x1: xOf(span.end), top, bottom }] as const);
  const style: RowStyle = { ...context, colors: rowInk(row, look) };
  return row.signal.kind === 'logic' ? bitMarkup(row, boxes, style) : busMarkup(row, boxes, style);
}
