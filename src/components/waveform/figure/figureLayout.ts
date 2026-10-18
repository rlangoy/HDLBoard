// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where everything goes in a figure, in its drawing units (docs/waveform_viewer_spec.md
 * § 8.9): the names on the left, one row of equal height per signal, and the time axis.
 * The report axis lies below the rows with the unit in its title and only as many
 * labels as fit without touching; the screen axis is a band above them, as on screen. Pure.
 */

import { formatFs, formatFsIn, tickStepFs, timeToX, unitFor, viewOf, type TimeUnit, type TimeView } from '../timeAxis';
import type { FigureContent, MeasureText } from './figureContent';
import { CAP_HEIGHT_EM, DESCENT_EM, type FigureFont, type FigureLook } from './figureStyle';
import { SCREEN_AXIS_HEIGHT } from './screenLook';

export interface Tick {
  readonly x: number;
  readonly label: string;
}

export interface FigureLayout {
  readonly width: number;
  readonly height: number;
  /** The names column, from the left edge. */
  readonly namesRight: number;
  /** Where the traces start and end, left to right. */
  readonly tracesLeft: number;
  readonly tracesRight: number;
  /** Time across the traces, with x counted from `tracesLeft`. */
  readonly view: TimeView;
  readonly rowTops: readonly number[];
  /** The top and bottom of the grid lines and the cursor. */
  readonly gridTop: number;
  readonly gridBottom: number;
  /** The axis line. */
  readonly axisY: number;
  readonly ticks: readonly Tick[];
  readonly tickLabelBaseline: number;
  /** The report axis's title, `Time (ns)`, and where it sits; none on the screen axis. */
  readonly axisTitle?: { readonly text: string; readonly baseline: number };
}

/** The baseline that centres capital letters of `font` on `y`. */
export const centredBaseline = (y: number, font: FigureFont): number => y + (CAP_HEIGHT_EM * font.size) / 2;

/** The space kept clear between the names and the traces, and between neighbouring tick labels. */
const LABEL_GAP_EM = 0.9;
const TICK_LENGTH_EM = 0.35;
const TICK_LABEL_GAP_EM = 0.25;
const AXIS_TITLE_GAP_EM = 0.35;
/** The screen writes a tick's label just after its line. */
const SCREEN_LABEL_OFFSET = 3;
/** The screen's grid lines start this far above the axis line, as its ticks. */
const SCREEN_TICK_LENGTH = 6;
/** Spacings tried before giving up on wider labels: a 1-2-5 step always lands within a few. */
const MAX_SPACING_TRIES = 4;

interface Axis {
  readonly content: FigureContent;
  readonly look: FigureLook;
  readonly view: TimeView;
  readonly tracesLeft: number;
  readonly tracesWidth: number;
  readonly measure: MeasureText;
}

const axisUnit = (content: FigureContent): TimeUnit => unitFor(content.end * content.tickFs);

/** A tick's label: a bare number in the axis's unit on the report axis, with its unit on screen. */
function tickLabel(axis: Axis, fs: number, stepFs: number): string {
  return axis.look.axis === 'report' ? formatFsIn(fs, axisUnit(axis.content), stepFs) : formatFs(fs, stepFs);
}

function ticksAt(axis: Axis, spacing: number): Tick[] {
  const { content, view, tracesLeft, tracesWidth } = axis;
  const stepFs = tickStepFs(view.ticksPerPx, content.tickFs, spacing);
  const stepTicks = stepFs / content.tickFs;
  const ticks: Tick[] = [];
  // Each mark is index × step, not a running sum, so labels never drift.
  for (let k = Math.ceil(content.start / stepTicks); ; k++) {
    const time = k * stepTicks;
    const x = timeToX(view, time);
    if (x > tracesWidth) break;
    ticks.push({ x: tracesLeft + x, label: tickLabel(axis, time * content.tickFs, stepFs) });
  }
  return ticks;
}

/** The ticks, spaced so that the widest label still keeps clear of its neighbours. */
function axisTicks(axis: Axis): Tick[] {
  const font = axis.look.axisFont;
  let spacing = axis.look.minTickSpacing;
  let ticks = ticksAt(axis, spacing);
  for (let tries = 0; tries < MAX_SPACING_TRIES; tries++) {
    const needed = Math.max(0, ...ticks.map((tick) => axis.measure(tick.label, font))) + LABEL_GAP_EM * font.size;
    if (needed <= spacing) break;
    spacing = needed;
    ticks = ticksAt(axis, spacing);
  }
  return ticks;
}

/** The names column: as wide as on screen, or as the longest name. */
function namesWidth(content: FigureContent, look: FigureLook, measure: MeasureText): number {
  if (look.namesWidth !== undefined) return look.namesWidth;
  const longest = Math.max(0, ...content.rows.map((row) => measure(row.label, look.nameFont)));
  return look.margin + longest + LABEL_GAP_EM * look.nameFont.size;
}

/** Room on the right of the report axis for half the widest label near its end. */
function rightMargin(content: FigureContent, look: FigureLook, measure: MeasureText): number {
  if (look.axis === 'screen') return 0;
  const endLabel = formatFsIn(content.end * content.tickFs, axisUnit(content));
  return measure(endLabel, look.axisFont) / 2 + look.margin;
}

type Vertical = Pick<FigureLayout, 'height' | 'rowTops' | 'gridTop' | 'gridBottom' | 'axisY' | 'tickLabelBaseline' | 'axisTitle'>;

function reportVertical(content: FigureContent, look: FigureLook): Vertical {
  const font = look.axisFont;
  const rowTops = content.rows.map((_, index) => look.margin + index * look.rowHeight);
  const axisY = look.margin + content.rows.length * look.rowHeight;
  const tickLabelBaseline = axisY + (TICK_LENGTH_EM + TICK_LABEL_GAP_EM + CAP_HEIGHT_EM) * font.size;
  const titleBaseline = tickLabelBaseline + (AXIS_TITLE_GAP_EM + DESCENT_EM + CAP_HEIGHT_EM) * font.size;
  return {
    height: titleBaseline + DESCENT_EM * font.size + look.margin,
    rowTops,
    gridTop: look.margin,
    gridBottom: axisY,
    axisY,
    tickLabelBaseline,
    axisTitle: { text: `Time (${axisUnit(content)[0]})`, baseline: titleBaseline },
  };
}

function screenVertical(content: FigureContent, look: FigureLook): Vertical {
  const axisY = SCREEN_AXIS_HEIGHT;
  const rowTops = content.rows.map((_, index) => axisY + index * look.rowHeight);
  const height = axisY + content.rows.length * look.rowHeight;
  const tickLabelBaseline = centredBaseline(axisY / 2, look.axisFont);
  return { height, rowTops, gridTop: axisY - SCREEN_TICK_LENGTH, gridBottom: height, axisY, tickLabelBaseline };
}

export function figureLayout(content: FigureContent, look: FigureLook, measure: MeasureText): FigureLayout {
  const tracesLeft = namesWidth(content, look, measure);
  const tracesRight = look.width - rightMargin(content, look, measure);
  const tracesWidth = Math.max(1, tracesRight - tracesLeft);
  const view = viewOf(content.start, content.end, tracesWidth);
  const vertical = look.axis === 'report' ? reportVertical(content, look) : screenVertical(content, look);
  return {
    width: look.width,
    namesRight: tracesLeft,
    tracesLeft,
    tracesRight,
    view,
    ticks: axisTicks({ content, look, view, tracesLeft, tracesWidth, measure }),
    ...vertical,
  };
}

/** The length of a report tick below the axis line. */
export const reportTickLength = (look: FigureLook): number => TICK_LENGTH_EM * look.axisFont.size;

/** Where a tick's label starts on the screen axis. */
export const screenLabelX = (tick: Tick): number => tick.x + SCREEN_LABEL_OFFSET;
