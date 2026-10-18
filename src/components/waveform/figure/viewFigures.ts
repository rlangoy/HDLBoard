// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The view's two figures (docs/waveform_viewer_spec.md § 8.8): Copy waveform, the view
 * as it is on screen, and Figure for a report, the same traces sized for print and cut
 * off where the run ended.
 */

import type { ShowAs } from '../radix';
import { traceRows, type ListModel, type SignalPath } from '../signalRows';
import type { ViewSetup } from '../viewSetup';
import { readColors } from '../waveDraw';
import { figureRows, figureSpan, type FigureContent } from './figureContent';
import { copyFigure, measureText, type CopyResult } from './figureOutput';
import { waveformFigure } from './figureSvg';
import { screenLook, type ScreenSize } from './screenLook';

export interface ViewState {
  readonly setup: ViewSetup;
  readonly list: ListModel;
  readonly showAsOf: (path: SignalPath) => ShowAs;
}

function contentOf({ setup, list, showAsOf }: ViewState, span: { readonly start: number; readonly end: number }): FigureContent {
  return { rows: figureRows(traceRows(list), showAsOf), ...span, tickFs: setup.tickFs, cursor: setup.cursor };
}

/** The window on screen, as it is. */
export const screenContent = (state: ViewState): FigureContent => contentOf(state, state.setup.window);

/** The window on screen without the part after the run: a report shows only what is known. */
export const reportContent = (state: ViewState): FigureContent => contentOf(state, figureSpan(state.setup.window, state.setup.runEnd));

/** Copies the view as on screen, in the colours and fonts of the pane it is in. */
export function copyScreenFigure(pane: HTMLElement, state: ViewState, size: ScreenSize): Promise<CopyResult> {
  const valueFont = getComputedStyle(pane).getPropertyValue('--wv-value-font').trim();
  const look = screenLook(readColors(pane), size, valueFont);
  return copyFigure(waveformFigure(screenContent(state), look, measureText));
}
