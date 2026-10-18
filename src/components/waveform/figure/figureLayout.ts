// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where everything goes in a figure, in its drawing units (docs/waveform_viewer_spec.md
 * § 8.9): the names on the left, one row of equal height per signal, and the time axis
 * with only as many labels as fit without touching. The look's axis decides its labels,
 * its room and where the rows go (`figureAxes.ts`). Pure.
 */

import { tickStepFs, timeToX, viewOf, type TimeView } from '../timeAxis';
import type { AxisVertical } from './figureAxes';
import type { FigureContent, MeasureText } from './figureContent';
import type { FigureLook } from './figureStyle';

export interface Tick {
  readonly x: number;
  readonly label: string;
}

export interface FigureLayout extends AxisVertical {
  readonly width: number;
  /** The right edge of the names column, where the traces start. */
  readonly namesRight: number;
  /** Where the traces start and end, left to right. */
  readonly tracesLeft: number;
  readonly tracesRight: number;
  /** Time across the traces, with x counted from `tracesLeft`. */
  readonly view: TimeView;
  readonly ticks: readonly Tick[];
}

/** The space kept clear between the names and the traces, and between neighbouring tick labels. */
const LABEL_GAP_EM = 0.9;
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

function ticksAt(axis: Axis, spacing: number): Tick[] {
  const { content, look, view, tracesLeft, tracesWidth } = axis;
  const stepFs = tickStepFs(view.ticksPerPx, content.tickFs, spacing);
  const stepTicks = stepFs / content.tickFs;
  const ticks: Tick[] = [];
  // Each mark is index × step, not a running sum, so labels never drift.
  for (let k = Math.ceil(content.start / stepTicks); ; k++) {
    const time = k * stepTicks;
    const x = timeToX(view, time);
    if (x > tracesWidth) break;
    ticks.push({ x: tracesLeft + x, label: look.axis.tickLabel(time * content.tickFs, stepFs, content) });
  }
  return ticks;
}

/** The ticks, spaced so that the widest label still keeps clear of its neighbours. */
function axisTicks(axis: Axis): Tick[] {
  const font = axis.look.fonts.axis;
  let spacing = axis.look.sizes.minTickSpacing;
  let ticks = ticksAt(axis, spacing);
  for (let tries = 0; tries < MAX_SPACING_TRIES; tries++) {
    const widest = Math.max(0, ...ticks.map((tick) => axis.measure(tick.label, font)));
    const needed = widest + LABEL_GAP_EM * font.size;
    if (needed <= spacing) break;
    spacing = needed;
    ticks = ticksAt(axis, spacing);
  }
  return ticks;
}

/** The right edge of the names column: as wide as on screen, or fitted to the longest name. */
function namesRight(content: FigureContent, look: FigureLook, measure: MeasureText): number {
  const { sizes, fonts } = look;
  if (sizes.namesWidth !== undefined) return sizes.namesWidth;
  const longest = Math.max(0, ...content.rows.map((row) => measure(row.label, fonts.name)));
  return sizes.textInset + longest + LABEL_GAP_EM * fonts.name.size;
}

export function figureLayout(content: FigureContent, look: FigureLook, measure: MeasureText): FigureLayout {
  const tracesLeft = namesRight(content, look, measure);
  const tracesRight = look.sizes.width - look.axis.rightMargin(content, look, measure);
  const tracesWidth = Math.max(1, tracesRight - tracesLeft);
  const view = viewOf(content.start, content.end, tracesWidth);
  return {
    width: look.sizes.width,
    namesRight: tracesLeft,
    tracesLeft,
    tracesRight,
    view,
    ticks: axisTicks({ content, look, view, tracesLeft, tracesWidth, measure }),
    ...look.axis.vertical(content, look),
  };
}
