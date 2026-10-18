// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A waveform figure as one SVG document (docs/waveform_viewer_spec.md § 8.9). It is the
 * figure itself – the PNG is drawn from it – so both always match. A report figure is
 * sized in millimetres with its drawing in points, so it opens at its printed size in
 * Word, Inkscape or LaTeX; a screen copy is sized in CSS pixels. Pure: text is measured
 * by the function it is handed.
 */

import { formatValue, isUndefinedValue } from '../radix';
import { timeToX } from '../timeAxis';
import { valueAt } from '../valueAt';
import type { Drawing } from './figureAxes';
import type { FigureContent, FigureRow, MeasureText } from './figureContent';
import { figureLayout, type FigureLayout } from './figureLayout';
import type { FigureLook } from './figureStyle';
import { traceMarkup } from './figureTraces';
import { PathData, element, fontAttributes, pathElement, textElement } from './svgMarkup';
import { centredBaseline } from './typography';

export interface Figure {
  readonly svg: string;
  /** Where everything is, in drawing units: for mapping the mouse onto time. */
  readonly layout: FigureLayout;
  /** The PNG's size in pixels. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

const rowMiddle = ({ look, layout }: Drawing, index: number): number => layout.rowTops[index] + look.sizes.rowHeight / 2;

function namesMarkup(drawing: Drawing): string {
  const { content, look } = drawing;
  const font = look.fonts.name;
  const name = (row: FigureRow, index: number) => {
    const place = { x: look.sizes.textInset, y: centredBaseline(rowMiddle(drawing, index), font) };
    return textElement({ ...place, fill: look.palette.text, ...fontAttributes(font) }, row.label);
  };
  return content.rows.map(name).join('');
}

/** Each value at the cursor, right-aligned in the names column, red when it holds U, X or W. */
function valuesMarkup(drawing: Drawing): string {
  const { content, look, layout } = drawing;
  const font = look.fonts.value;
  const valueText = (row: FigureRow, index: number): string => {
    const raw = valueAt(row.trace, content.cursor);
    if (raw === undefined) return '';
    const fill = isUndefinedValue(row.signal, raw) ? look.palette.undefined : look.palette.text;
    const place = { x: layout.namesRight - look.sizes.textInset, y: centredBaseline(rowMiddle(drawing, index), font), 'text-anchor': 'end' };
    return textElement({ ...place, fill, ...fontAttributes(font) }, formatValue(row.signal, raw, row.showAs));
  };
  return content.rows.map(valueText).join('');
}

/** A light line down through the rows at each tick. */
function gridMarkup({ look, layout }: Drawing): string {
  const lines = new PathData();
  for (const tick of layout.ticks) lines.moveTo(tick.x, layout.gridTop).verticalTo(layout.gridBottom);
  return pathElement(lines, { fill: 'none', stroke: look.palette.grid, 'stroke-width': look.strokes.grid });
}

/** The cursor, when it is shown and inside the time shown. */
function cursorMarkup({ content, look, layout }: Drawing): string {
  if (!look.shows.cursor || content.cursor < content.start || content.cursor > content.end) return '';
  const x = layout.tracesLeft + timeToX(layout.view, content.cursor);
  const line = new PathData().moveTo(x, layout.gridTop).verticalTo(layout.gridBottom);
  const { strokes } = look;
  return pathElement(line, { fill: 'none', stroke: look.palette.cursor, 'stroke-width': strokes.marker, 'stroke-dasharray': strokes.cursorDash });
}

function tracesMarkup(drawing: Drawing, measure: MeasureText): string {
  const { content, look, layout } = drawing;
  const context = { layout, look, measure, end: Math.min(content.end, content.runEnd) };
  return content.rows.map((row, index) => traceMarkup(row, layout.rowTops[index], context)).join('');
}

function svgDocument({ look, layout }: Drawing, body: string): string {
  const { cssLength } = look.output;
  const size = { width: cssLength(layout.width), height: cssLength(layout.height) };
  const viewBox = `0 0 ${layout.width.toFixed(2)} ${layout.height.toFixed(2)}`;
  return element('svg', { xmlns: 'http://www.w3.org/2000/svg', ...size, viewBox, ...fontAttributes(look.fonts.name) }, body);
}

export function waveformFigure(content: FigureContent, look: FigureLook, measure: MeasureText): Figure {
  const layout = figureLayout(content, look, measure);
  const drawing: Drawing = { content, look, layout };
  const body = [
    element('rect', { width: layout.width, height: layout.height, fill: look.palette.background }),
    gridMarkup(drawing),
    namesMarkup(drawing),
    look.shows.values ? valuesMarkup(drawing) : '',
    tracesMarkup(drawing, measure),
    cursorMarkup(drawing),
    look.axis.markup(drawing),
  ].join('');
  const pixels = (units: number) => Math.round(units * look.output.pixelsPerUnit);
  return { svg: svgDocument(drawing, body), layout, pixelWidth: pixels(layout.width), pixelHeight: pixels(layout.height) };
}
