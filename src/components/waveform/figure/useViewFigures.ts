// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The figure actions of the waveform view (docs/waveform_viewer_spec.md § 8.8). Copy
 * waveform puts the view as on screen on the clipboard. Figure for a report turns the
 * view into report mode: the figure itself, drawn live from the view, so panning and
 * zooming choose what it shows, with its options kept in this browser.
 */

import { useMemo, useState, type RefObject } from 'react';
import type { ShowAs } from '../radix';
import { traceRows, type SignalPath } from '../signalRows';
import { useStatusLine } from '../useStatusLine';
import type { WaveView } from '../useWaveView';
import { loadReportOptions, saveReportOptions } from '../wavePrefs';
import { COPY_MESSAGES, copyFigure, measureText, saveFigurePng, saveFigureSvg } from './figureOutput';
import { REPORT_DPI, reportLook, type ReportOptions } from './figureStyle';
import { waveformFigure, type Figure } from './figureSvg';
import type { ScreenSize } from './screenLook';
import { copyScreenFigure, viewContent, type ViewState } from './viewFigures';

export interface ViewFiguresInput {
  readonly view: WaveView;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  /** The pane, whose colours and fonts a copy as on screen takes. */
  readonly pane: RefObject<HTMLElement>;
  readonly size: ScreenSize;
  /** The saved files' name without extension: `counter_tb_waveform`. */
  readonly baseName: string;
}

/** Report mode: the figure as it stands, its options, and what its buttons do. */
export interface ReportMode {
  readonly figure: Figure;
  readonly options: ReportOptions;
  change(patch: Partial<ReportOptions>): void;
  copy(): void;
  saveSvg(): void;
  savePng(): void;
  close(): void;
}

export interface ViewFigures {
  readonly hasTraces: boolean;
  /** How the last copy went, for a status line; empty when there is nothing to say. */
  readonly status: string;
  copyWaveform(): void;
  /** Report mode while it is on, else null. */
  readonly report: ReportMode | null;
  openReport(): void;
}

/** The report options, remembered each time one changes. */
function useReportOptions(): [ReportOptions, (patch: Partial<ReportOptions>) => void] {
  const [options, setOptions] = useState(loadReportOptions);
  const change = (patch: Partial<ReportOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    saveReportOptions(next);
  };
  return [options, change];
}

export function useViewFigures({ view, showAsOf, pane, size, baseName }: ViewFiguresInput): ViewFigures {
  const [reportOn, setReportOn] = useState(false);
  const [options, change] = useReportOptions();
  const [status, setStatus] = useStatusLine();
  const state: ViewState | null = view.setup === null ? null : { setup: view.setup, list: view.list, showAsOf };
  const hasTraces = state !== null && traceRows(view.list).length > 0;
  // Drawn again only when the view or an option changes; `showAsOf` follows the setup.
  const figure = useMemo(
    () => (reportOn && state !== null && hasTraces ? waveformFigure(viewContent(state), reportLook(options), measureText) : null),
    [reportOn, hasTraces, view.setup, view.list, options],
  );
  const copyWaveform = () => {
    if (state !== null && hasTraces && pane.current !== null) void copyScreenFigure(pane.current, state, size).then((result) => setStatus(COPY_MESSAGES[result]));
  };
  const report: ReportMode | null =
    figure === null
      ? null
      : {
          figure,
          options,
          change,
          copy: () => void copyFigure(figure).then((result) => setStatus(COPY_MESSAGES[result])),
          saveSvg: () => saveFigureSvg(figure, baseName),
          savePng: () => void saveFigurePng(figure, baseName, REPORT_DPI),
          close: () => setReportOn(false),
        };
  return { hasTraces, status, copyWaveform, report, openReport: () => setReportOn(hasTraces) };
}
