// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The ⋯ menu's figure actions for the waveform view (docs/waveform_viewer_spec.md § 8.8):
 * Copy waveform puts the view as on screen on the clipboard and says how it went; Figure
 * for a report opens its dialog on the view as it was when opened.
 */

import { useState, type RefObject } from 'react';
import type { ShowAs } from '../radix';
import { traceRows, type SignalPath } from '../signalRows';
import { useStatusLine } from '../useStatusLine';
import type { WaveView } from '../useWaveView';
import type { FigureContent } from './figureContent';
import { COPY_MESSAGES } from './figureOutput';
import type { ScreenSize } from './screenLook';
import { copyScreenFigure, reportContent, type ViewState } from './viewFigures';

export interface ViewFiguresInput {
  readonly view: WaveView;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  /** The pane, whose colours and fonts a copy as on screen takes. */
  readonly pane: RefObject<HTMLElement>;
  readonly size: ScreenSize;
}

export interface ViewFigures {
  readonly hasTraces: boolean;
  /** How the last copy went, for a status line; empty when there is nothing to say. */
  readonly status: string;
  copyWaveform(): void;
  /** What the report dialog shows, or null while it is closed. */
  readonly report: FigureContent | null;
  openReport(): void;
  closeReport(): void;
}

export function useViewFigures({ view, showAsOf, pane, size }: ViewFiguresInput): ViewFigures {
  const [report, setReport] = useState<FigureContent | null>(null);
  const [status, setStatus] = useStatusLine();
  const state: ViewState | null = view.setup === null ? null : { setup: view.setup, list: view.list, showAsOf };
  const hasTraces = state !== null && traceRows(view.list).length > 0;
  const copyWaveform = () => {
    if (!hasTraces || pane.current === null) return;
    void copyScreenFigure(pane.current, state, size).then((result) => setStatus(COPY_MESSAGES[result]));
  };
  const openReport = () => {
    if (hasTraces) setReport(reportContent(state));
  };
  return { hasTraces, status, copyWaveform, report, openReport, closeReport: () => setReport(null) };
}
