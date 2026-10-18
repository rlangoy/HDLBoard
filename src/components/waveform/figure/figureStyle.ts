// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How a waveform figure looks (docs/waveform_viewer_spec.md § 8.9). One drawing serves
 * two looks: the report look, sized in points at the final printed size and black on
 * white by default, and the screen look of `screenLook.ts`, a copy of the view as it is
 * on screen. The report look's colour palette tells values apart by shape as well, so
 * it still reads in grayscale.
 */

import type { Tone } from '../signalRows';

export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;
export const ptFromMm = (mm: number): number => (mm / MM_PER_INCH) * PT_PER_INCH;
export const mmFromPt = (pt: number): number => (pt / PT_PER_INCH) * MM_PER_INCH;

/** The two IEEE figure widths: one column and the full two-column page. */
export type FigureWidth = 'column' | 'page';
export const FIGURE_WIDTH_MM: Readonly<Record<FigureWidth, number>> = { column: 88.9, page: 182 };

export type FigureColouring = 'mono' | 'colour';

/** What the student picks for a report figure. */
export interface ReportOptions {
  readonly width: FigureWidth;
  readonly colouring: FigureColouring;
  readonly showCursor: boolean;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = { width: 'column', colouring: 'mono', showCursor: false };

export interface FigureFont {
  readonly family: string;
  /** In the figure's drawing units. */
  readonly size: number;
}

export interface FigurePalette {
  readonly background: string;
  readonly text: string;
  readonly grid: string;
  readonly axis: string;
  readonly cursor: string;
  /** Bits, and buses, in each part of the design. */
  readonly ink: Readonly<Record<Tone, string>>;
  readonly enumInk: string;
  /** A U, X or W value: hatched or shaded in every palette, red only in colour. */
  readonly undefined: string;
  readonly highZ: string;
}

/** Where the time axis goes and how it is labelled. */
export type AxisStyle =
  /** Below the traces, bare numbers, the unit in a title: `Time (ns)`. */
  | 'report'
  /** Above the traces, each label with its unit, as on screen. */
  | 'screen';

export interface FigureLook {
  readonly palette: FigurePalette;
  readonly nameFont: FigureFont;
  readonly valueFont: FigureFont;
  readonly axisFont: FigureFont;
  /** The figure's width in drawing units. */
  readonly width: number;
  /** A length in drawing units as the SVG's width and height: `88.9mm`, `640px`. */
  readonly cssLength: (units: number) => string;
  /** The PNG's pixels per drawing unit. */
  readonly pixelsPerUnit: number;
  /** The width of the names column; undefined fits it to the longest name. */
  readonly namesWidth: number | undefined;
  /** Whether the names column also shows each value at the cursor. */
  readonly showValues: boolean;
  readonly showCursor: boolean;
  readonly axis: AxisStyle;
  readonly margin: number;
  /** Every row is as tall as the others, so the traces line up. */
  readonly rowHeight: number;
  /** The trace's top and bottom inside its row. */
  readonly tracePad: number;
  readonly traceLine: number;
  /** The axis, its ticks and the cursor. */
  readonly markerLine: number;
  /** Grid lines and hatching. */
  readonly gridLine: number;
  readonly busSlope: number;
  readonly hatchStep: number;
  readonly minTickSpacing: number;
  readonly weakDash: string;
  readonly cursorDash: string | undefined;
}

/** Arial's capital height and descent, as shares of the font size: for placing baselines. */
export const CAP_HEIGHT_EM = 0.72;
export const DESCENT_EM = 0.21;
/** A U value and a busy stretch are shaded rather than hatched, so they stay apart from X. */
export const SHADE_OPACITY = 0.25;
/** How finely changes are drawn: closer than a quarter unit, they merge into a busy stretch. */
export const DETAIL_PER_UNIT = 4;

/** Line art at 600 dpi at the final size: enough for black and white, twice what colour needs. */
export const REPORT_DPI = 600;

/** One family for the whole figure, from the fonts every publisher and word processor has. */
const REPORT_FONT: FigureFont = { family: "Arial, Helvetica, 'Liberation Sans', sans-serif", size: 9 };

const MONO: FigurePalette = {
  background: '#ffffff',
  text: '#000000',
  grid: '#bfbfbf',
  axis: '#000000',
  cursor: '#000000',
  ink: { testbench: '#000000', rtl: '#000000' },
  enumInk: '#000000',
  undefined: '#000000',
  highZ: '#000000',
};

/** The screen's colours made darker, so that each still prints as a clear line in grayscale. */
const COLOUR: FigurePalette = {
  ...MONO,
  cursor: '#b45309',
  ink: { testbench: '#1d4ed8', rtl: '#15803d' },
  enumInk: '#6d28d9',
  undefined: '#b91c1c',
  highZ: '#92400e',
};

/**
 * The report look: 9 pt text (inside the 9–10 pt asked for, well above the 6 pt floor),
 * 1 pt traces, 0.75 pt markers and 0.5 pt grid lines – never thinner, or they vanish in print.
 */
export function reportLook(options: ReportOptions): FigureLook {
  return {
    palette: options.colouring === 'colour' ? COLOUR : MONO,
    nameFont: REPORT_FONT,
    valueFont: REPORT_FONT,
    axisFont: REPORT_FONT,
    width: ptFromMm(FIGURE_WIDTH_MM[options.width]),
    cssLength: (pt) => `${mmFromPt(pt).toFixed(2)}mm`,
    pixelsPerUnit: REPORT_DPI / PT_PER_INCH,
    namesWidth: undefined,
    showValues: false,
    showCursor: options.showCursor,
    axis: 'report',
    margin: 2,
    rowHeight: 20,
    tracePad: 4,
    traceLine: 1,
    markerLine: 0.75,
    gridLine: 0.5,
    busSlope: 2.5,
    hatchStep: 3,
    // About ten labels across a full page, never more than fit.
    minTickSpacing: 48,
    weakDash: '2 2',
    cursorDash: '3 2',
  };
}
