// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The screen look (docs/waveform_viewer_spec.md § 8.8): a copy of the waveform as it is
 * on screen – the view's colours, fonts and sizes, the Signal and Value columns at their
 * width, the time axis on top and the cursor – drawn in CSS pixels.
 */

import { MIN_TICK_SPACING_PX } from '../timeAxis';
import { AXIS_HEIGHT, ROW_HEIGHT, type WaveColors } from '../waveDraw';
import type { FigureLook } from './figureStyle';

/** The copied PNG has twice the screen's pixels, so it stays sharp when pasted large. */
const SCREEN_PIXELS_PER_PX = 2;

export interface ScreenSize {
  readonly namesWidth: number;
  readonly tracesWidth: number;
}

export function screenLook(colors: WaveColors, size: ScreenSize, valueFontFamily: string): FigureLook {
  return {
    palette: {
      background: colors.background,
      text: colors.busText,
      grid: colors.grid,
      axis: colors.axisText,
      cursor: colors.cursor,
      ink: { testbench: colors.testbenchInk, rtl: colors.rtlInk },
      enumInk: colors.enumInk,
      undefined: colors.undefined,
      highZ: colors.highZ,
    },
    nameFont: { family: 'system-ui, "Segoe UI", sans-serif', size: 13 },
    valueFont: { family: valueFontFamily, size: 12 },
    axisFont: { family: 'system-ui, "Segoe UI", sans-serif', size: 11 },
    width: size.namesWidth + size.tracesWidth,
    cssLength: (px) => `${Math.round(px)}px`,
    pixelsPerUnit: SCREEN_PIXELS_PER_PX,
    namesWidth: size.namesWidth,
    showValues: true,
    showCursor: true,
    axis: 'screen',
    margin: 0,
    rowHeight: ROW_HEIGHT,
    tracePad: 6,
    traceLine: 1.5,
    markerLine: 1,
    gridLine: 1,
    busSlope: 3,
    hatchStep: 6,
    minTickSpacing: MIN_TICK_SPACING_PX,
    weakDash: '3 3',
    cursorDash: undefined,
  };
}

/** The height of the axis band above the rows, as on screen. */
export const SCREEN_AXIS_HEIGHT = AXIS_HEIGHT;
