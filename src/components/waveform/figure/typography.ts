// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Placing text in a figure: fonts, and where a line of text sits. Pure. */

/** A font as a size, in the figure's drawing units, and a family. */
export interface FigureFont {
  readonly size: number;
  readonly family: string;
}

/** Arial's capital height and descent, as shares of the font size: for placing baselines. */
export const CAP_HEIGHT_EM = 0.72;
export const DESCENT_EM = 0.21;

/** The baseline that centres capital letters of `font` on `y`. */
export const centredBaseline = (y: number, font: FigureFont): number => y + (CAP_HEIGHT_EM * font.size) / 2;
