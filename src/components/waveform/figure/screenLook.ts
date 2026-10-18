// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The screen look (docs/waveform_viewer_spec.md § 8.8): a copy of the waveform as it is
 * on screen – the view's colours, fonts and sizes, the Signal and Value columns at their
 * width, the time axis on top and the cursor – drawn in CSS pixels. The sizes and fonts
 * are the canvas's own (`waveDraw.ts`) and the names' font is the list's, so the copy
 * follows any change to the view.
 */

import { MIN_TICK_SPACING_PX } from '../timeAxis';
import { AXIS_FONT, BUS_SLOPE, HATCH_STEP, ROW_HEIGHT, TRACE_PAD, TRACE_WIDTH, VALUE_FONT, WEAK_DASH_LENGTH, type WaveColors } from '../waveDraw';
import { SCREEN_AXIS } from './figureAxes';
import type { FigureFont, FigureLook, FigurePalette } from './figureStyle';

/** The copied PNG has twice the screen's pixels, so it stays sharp when pasted large. */
const SCREEN_PIXELS_PER_PX = 2;
/** Where the list writes its names, and how far its values keep from the traces. */
const LIST_TEXT_INSET = 12;
/** The canvas draws its grid lines, the axis and the cursor one pixel wide. */
const HAIRLINE_PX = 1;

/** The view's columns as on screen, and whether it shows its cursor (and with it the values at the cursor). */
export interface ScreenLayout {
  readonly namesWidth: number;
  readonly tracesWidth: number;
  readonly cursorShown: boolean;
}

function screenPalette(colors: WaveColors): FigurePalette {
  return {
    background: colors.background,
    text: colors.busText,
    grid: colors.grid,
    axis: colors.axisText,
    cursor: colors.cursor,
    ink: { testbench: colors.testbenchInk, rtl: colors.rtlInk },
    enumInk: colors.enumInk,
    undefined: colors.undefined,
    highZ: colors.highZ,
  };
}

/** The look of the view on screen: its `colors`, its `layout`, and the list's `nameFont`. */
export function screenLook(colors: WaveColors, layout: ScreenLayout, nameFont: FigureFont): FigureLook {
  const { namesWidth, tracesWidth, cursorShown } = layout;
  return {
    palette: screenPalette(colors),
    fonts: { name: nameFont, value: VALUE_FONT, axis: AXIS_FONT },
    sizes: {
      width: namesWidth + tracesWidth,
      margin: 0,
      textInset: LIST_TEXT_INSET,
      namesWidth,
      rowHeight: ROW_HEIGHT,
      tracePad: TRACE_PAD,
      busSlope: BUS_SLOPE,
      hatchStep: HATCH_STEP,
      minTickSpacing: MIN_TICK_SPACING_PX,
    },
    strokes: {
      trace: TRACE_WIDTH,
      marker: HAIRLINE_PX,
      grid: HAIRLINE_PX,
      weakDash: `${WEAK_DASH_LENGTH} ${WEAK_DASH_LENGTH}`,
      cursorDash: undefined,
    },
    output: { cssLength: (px) => `${Math.round(px)}px`, pixelsPerUnit: SCREEN_PIXELS_PER_PX },
    shows: { values: cursorShown, cursor: cursorShown },
    axis: SCREEN_AXIS,
  };
}
