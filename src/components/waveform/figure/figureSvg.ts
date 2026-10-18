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
import type { FigureContent, FigureRow, MeasureText } from './figureContent';
import { centredBaseline, figureLayout, reportTickLength, screenLabelX, type FigureLayout } from './figureLayout';
import type { FigureFont, FigureLook } from './figureStyle';
import { traceMarkup } from './figureTraces';
import { PathData, element, pathElement, textElement, type Attributes } from './svgMarkup';

export interface Figure {
  readonly svg: string;
  /** The PNG's size in pixels. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

/** Where the screen look writes the names, and how far the values keep from the traces. */
const SCREEN_TEXT_INSET = 12;

interface Drawing {
  readonly content: FigureContent;
  readonly look: FigureLook;
  readonly layout: FigureLayout;
}

const fontAttributes = (font: FigureFont): Attributes => ({ 'font-family': font.family, 'font-size': font.size });

const rowMiddle = ({ look, layout }: Drawing, index: number): number => layout.rowTops[index] + look.rowHeight / 2;

function namesMarkup(drawing: Drawing): string {
  const { content, look } = drawing;
  const x = look.axis === 'screen' ? SCREEN_TEXT_INSET : look.margin;
  return content.rows
    .map((row, index) => textElement({ x, y: centredBaseline(rowMiddle(drawing, index), look.nameFont), fill: look.palette.text, ...fontAttributes(look.nameFont) }, row.label))
    .join('');
}

/** Each value at the cursor, right-aligned in the names column, red when it holds U, X or W. */
function valuesMarkup(drawing: Drawing): string {
  const { content, look, layout } = drawing;
  const valueText = (row: FigureRow, index: number): string => {
    const raw = valueAt(row.trace, content.cursor);
    if (raw === undefined) return '';
    const fill = isUndefinedValue(row.signal, raw) ? look.palette.undefined : look.palette.text;
    const attributes = { x: layout.namesRight - SCREEN_TEXT_INSET, y: centredBaseline(rowMiddle(drawing, index), look.valueFont), 'text-anchor': 'end', fill };
    return textElement({ ...attributes, ...fontAttributes(look.valueFont) }, formatValue(row.signal, raw, row.showAs));
  };
  return content.rows.map(valueText).join('');
}

/** A light line down through the rows at each tick. */
function gridMarkup({ look, layout }: Drawing): string {
  const lines = new PathData();
  for (const tick of layout.ticks) lines.moveTo(tick.x, layout.gridTop).verticalTo(layout.gridBottom);
  return pathElement(lines, { fill: 'none', stroke: look.palette.grid, 'stroke-width': look.gridLine });
}

/** Below the traces: the axis line, ticks, bare numbers and the title with the unit. */
function reportAxisMarkup({ look, layout }: Drawing): string {
  const { palette, axisFont } = look;
  const lines = new PathData().moveTo(layout.tracesLeft, layout.axisY).horizontalTo(layout.tracesRight);
  for (const tick of layout.ticks) lines.moveTo(tick.x, layout.axisY).verticalTo(layout.axisY + reportTickLength(look));
  const centred = { 'text-anchor': 'middle', fill: palette.text, ...fontAttributes(axisFont) };
  const labels = layout.ticks.map((tick) => textElement({ ...centred, x: tick.x, y: layout.tickLabelBaseline }, tick.label));
  const title = layout.axisTitle === undefined ? '' : textElement({ ...centred, x: (layout.tracesLeft + layout.tracesRight) / 2, y: layout.axisTitle.baseline }, layout.axisTitle.text);
  return [pathElement(lines, { fill: 'none', stroke: palette.axis, 'stroke-width': look.markerLine }), ...labels, title].join('');
}

/** Above the traces, as on screen: the column heads, labels with units, the axis line and the column divider. */
function screenAxisMarkup({ look, layout }: Drawing): string {
  const { palette, axisFont } = look;
  const muted = { fill: palette.axis, ...fontAttributes(axisFont) };
  const heads = [
    textElement({ ...muted, x: SCREEN_TEXT_INSET, y: layout.tickLabelBaseline, 'font-weight': 600 }, 'SIGNAL'),
    textElement({ ...muted, x: layout.namesRight - SCREEN_TEXT_INSET, y: layout.tickLabelBaseline, 'text-anchor': 'end', 'font-weight': 600 }, 'VALUE'),
  ];
  const labels = layout.ticks.map((tick) => textElement({ ...muted, x: screenLabelX(tick), y: layout.tickLabelBaseline }, tick.label));
  const lines = new PathData().moveTo(0, layout.axisY).horizontalTo(layout.width).moveTo(layout.namesRight, 0).verticalTo(layout.height);
  return [pathElement(lines, { fill: 'none', stroke: palette.grid, 'stroke-width': look.gridLine }), ...heads, ...labels].join('');
}

/** The cursor, when it is inside the time shown. */
function cursorMarkup({ content, look, layout }: Drawing): string {
  if (!look.showCursor || content.cursor < content.start || content.cursor > content.end) return '';
  const x = layout.tracesLeft + timeToX(layout.view, content.cursor);
  const line = new PathData().moveTo(x, layout.gridTop).verticalTo(layout.gridBottom);
  return pathElement(line, { fill: 'none', stroke: look.palette.cursor, 'stroke-width': look.markerLine, 'stroke-dasharray': look.cursorDash });
}

function tracesMarkup(drawing: Drawing, measure: MeasureText): string {
  const { content, look, layout } = drawing;
  const context = { layout, look, measure, end: content.end };
  return content.rows.map((row, index) => traceMarkup(row, layout.rowTops[index], context)).join('');
}

export function waveformFigure(content: FigureContent, look: FigureLook, measure: MeasureText): Figure {
  const layout = figureLayout(content, look, measure);
  const drawing: Drawing = { content, look, layout };
  const screen = look.axis === 'screen';
  const body = [
    element('rect', { width: layout.width, height: layout.height, fill: look.palette.background }),
    gridMarkup(drawing),
    namesMarkup(drawing),
    look.showValues ? valuesMarkup(drawing) : '',
    tracesMarkup(drawing, measure),
    cursorMarkup(drawing),
    screen ? screenAxisMarkup(drawing) : reportAxisMarkup(drawing),
  ].join('');
  const svg = element(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: look.cssLength(layout.width),
      height: look.cssLength(layout.height),
      viewBox: `0 0 ${layout.width.toFixed(2)} ${layout.height.toFixed(2)}`,
      ...fontAttributes(look.nameFont),
    },
    body,
  );
  return { svg, pixelWidth: Math.round(layout.width * look.pixelsPerUnit), pixelHeight: Math.round(layout.height * look.pixelsPerUnit) };
}
