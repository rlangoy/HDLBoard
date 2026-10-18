// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The view's two figures (docs/waveform_viewer_spec.md § 8.8): Copy waveform, the view
 * as it is on screen, and Figure for a report, the same traces in the report look.
 */

import type { ShowAs } from '../radix';
import { traceRows, type ListModel, type SignalPath } from '../signalRows';
import type { ViewSetup } from '../viewSetup';
import { readColors } from '../waveDraw';
import { figureRows, type FigureContent } from './figureContent';
import { copyFigure, measureText, type CopyResult } from './figureOutput';
import { waveformFigure } from './figureSvg';
import { screenLook, type ScreenSize } from './screenLook';
import type { FigureFont } from './typography';

export interface ViewState {
  readonly setup: ViewSetup;
  readonly list: ListModel;
  readonly showAsOf: (path: SignalPath) => ShowAs;
}

/** The shown traces across the window on screen. */
export function viewContent({ setup, list, showAsOf }: ViewState): FigureContent {
  const { window, runEnd, tickFs, cursor } = setup;
  return { rows: figureRows(traceRows(list), showAsOf), start: window.start, end: window.end, runEnd, tickFs, cursor };
}

/** The signal names' font as the list draws it: the pane's family at `--wv-name-font-size`. */
function listNameFont(pane: HTMLElement): FigureFont {
  const style = getComputedStyle(pane);
  return { family: style.fontFamily, size: parseFloat(style.getPropertyValue('--wv-name-font-size')) };
}

/** Copies the view as on screen, in the colours and fonts of the pane it is in. */
export function copyScreenFigure(pane: HTMLElement, state: ViewState, size: ScreenSize): Promise<CopyResult> {
  const look = screenLook(readColors(pane), size, listNameFont(pane));
  return copyFigure(waveformFigure(viewContent(state), look, measureText));
}
