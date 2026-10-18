// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The two time axes a figure can have (docs/waveform_viewer_spec.md § 8.8, § 8.9). Each
 * knows its labels, the room it needs, where the rows and the axis go, and how it is
 * drawn, so the layout and the drawing never ask which one they have.
 *
 * - The report axis lies below the traces: bare numbers on the ticks, the unit in a
 *   title (`Time (ns)`).
 * - The screen axis is a band above the traces, as on screen: each label with its unit,
 *   the Signal and Value heads, and the line between the names and the traces.
 *
 * Pure.
 */

import { formatFs, formatFsIn, unitFor, type TimeUnit } from '../timeAxis';
import { AXIS_HEIGHT, LABEL_OFFSET, TICK_LENGTH } from '../waveDraw';
import type { FigureContent, MeasureText } from './figureContent';
import type { FigureLayout, Tick } from './figureLayout';
import type { FigureLook } from './figureStyle';
import { PathData, fontAttributes, pathElement, textElement } from './svgMarkup';
import { CAP_HEIGHT_EM, DESCENT_EM, centredBaseline } from './typography';

/** Where the rows, the grid and the axis go, top to bottom. */
export interface AxisVertical {
  readonly height: number;
  readonly rowTops: readonly number[];
  /** The top and bottom of the grid lines and the cursor. */
  readonly gridTop: number;
  readonly gridBottom: number;
  /** The axis line. */
  readonly axisY: number;
  readonly tickLabelBaseline: number;
  /** The report axis's title, `Time (ns)`, and where it sits; none on the screen axis. */
  readonly axisTitle?: { readonly text: string; readonly baseline: number };
}

/** What the drawing of a figure needs. */
export interface Drawing {
  readonly content: FigureContent;
  readonly look: FigureLook;
  readonly layout: FigureLayout;
}

export interface FigureAxis {
  /** A tick's label, for a tick at `fs` on a scale of `stepFs` steps. */
  tickLabel(fs: number, stepFs: number, content: FigureContent): string;
  /** The room the axis keeps clear right of the traces. */
  rightMargin(content: FigureContent, look: FigureLook, measure: MeasureText): number;
  vertical(content: FigureContent, look: FigureLook): AxisVertical;
  markup(drawing: Drawing): string;
}

const TICK_LENGTH_EM = 0.35;
const TICK_LABEL_GAP_EM = 0.25;
const AXIS_TITLE_GAP_EM = 0.35;
const HEAD_WEIGHT = 600;

/** The report axis's unit: the one the end of the time shown reads best in. */
const axisUnit = (content: FigureContent): TimeUnit => unitFor(content.end * content.tickFs);

const rowTopsFrom = (top: number, content: FigureContent, look: FigureLook): number[] =>
  content.rows.map((_, index) => top + index * look.sizes.rowHeight);

function reportVertical(content: FigureContent, look: FigureLook): AxisVertical {
  const { margin, rowHeight } = look.sizes;
  const fontSize = look.fonts.axis.size;
  const axisY = margin + content.rows.length * rowHeight;
  const tickLabelBaseline = axisY + (TICK_LENGTH_EM + TICK_LABEL_GAP_EM + CAP_HEIGHT_EM) * fontSize;
  const titleBaseline = tickLabelBaseline + (AXIS_TITLE_GAP_EM + DESCENT_EM + CAP_HEIGHT_EM) * fontSize;
  return {
    height: titleBaseline + DESCENT_EM * fontSize + margin,
    rowTops: rowTopsFrom(margin, content, look),
    gridTop: margin,
    gridBottom: axisY,
    axisY,
    tickLabelBaseline,
    axisTitle: { text: `Time (${axisUnit(content)[0]})`, baseline: titleBaseline },
  };
}

/** The axis line, its ticks, the labels centred under them and the title with the unit. */
function reportMarkup({ look, layout }: Drawing): string {
  const { palette, fonts } = look;
  const tickLength = TICK_LENGTH_EM * fonts.axis.size;
  const lines = new PathData().moveTo(layout.tracesLeft, layout.axisY).horizontalTo(layout.tracesRight);
  for (const tick of layout.ticks) lines.moveTo(tick.x, layout.axisY).verticalTo(layout.axisY + tickLength);
  const centred = { 'text-anchor': 'middle', fill: palette.text, ...fontAttributes(fonts.axis) };
  const label = (tick: Tick) => textElement({ ...centred, x: tick.x, y: layout.tickLabelBaseline }, tick.label);
  const titleX = (layout.tracesLeft + layout.tracesRight) / 2;
  const title = layout.axisTitle === undefined ? '' : textElement({ ...centred, x: titleX, y: layout.axisTitle.baseline }, layout.axisTitle.text);
  const axisLine = pathElement(lines, { fill: 'none', stroke: palette.axis, 'stroke-width': look.strokes.marker });
  return [axisLine, ...layout.ticks.map(label), title].join('');
}

/** Room for half the widest label a tick near the end could have. */
function reportRightMargin(content: FigureContent, look: FigureLook, measure: MeasureText): number {
  const endLabel = formatFsIn(content.end * content.tickFs, axisUnit(content));
  return measure(endLabel, look.fonts.axis) / 2 + look.sizes.margin;
}

export const REPORT_AXIS: FigureAxis = {
  tickLabel: (fs, stepFs, content) => formatFsIn(fs, axisUnit(content), stepFs),
  rightMargin: reportRightMargin,
  vertical: reportVertical,
  markup: reportMarkup,
};

function screenVertical(content: FigureContent, look: FigureLook): AxisVertical {
  const height = AXIS_HEIGHT + content.rows.length * look.sizes.rowHeight;
  return {
    height,
    rowTops: rowTopsFrom(AXIS_HEIGHT, content, look),
    gridTop: AXIS_HEIGHT - TICK_LENGTH,
    gridBottom: height,
    axisY: AXIS_HEIGHT,
    tickLabelBaseline: centredBaseline(AXIS_HEIGHT / 2, look.fonts.axis),
  };
}

/** The column heads, the labels just after their ticks, the axis line and the line between the names and the traces. */
function screenMarkup({ look, layout }: Drawing): string {
  const { palette, fonts, sizes } = look;
  const muted = { fill: palette.axis, y: layout.tickLabelBaseline, ...fontAttributes(fonts.axis) };
  const heads = [
    textElement({ ...muted, x: sizes.textInset, 'font-weight': HEAD_WEIGHT }, 'SIGNAL'),
    textElement({ ...muted, x: layout.tracesLeft - sizes.textInset, 'text-anchor': 'end', 'font-weight': HEAD_WEIGHT }, 'VALUE'),
  ];
  const labels = layout.ticks.map((tick) => textElement({ ...muted, x: tick.x + LABEL_OFFSET }, tick.label));
  const lines = new PathData().moveTo(0, layout.axisY).horizontalTo(layout.width).moveTo(layout.tracesLeft, 0).verticalTo(layout.height);
  return [pathElement(lines, { fill: 'none', stroke: palette.grid, 'stroke-width': look.strokes.grid }), ...heads, ...labels].join('');
}

export const SCREEN_AXIS: FigureAxis = {
  tickLabel: (fs, stepFs) => formatFs(fs, stepFs),
  rightMargin: () => 0,
  vertical: screenVertical,
  markup: screenMarkup,
};
